const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, PermissionFlagsBits } = require('discord.js')
const p = require('../presentation/messages')

function createController({ store, config, environment, botAdminId, clock = Date.now }) {
  let draining = null
  const access = require('./access').createAccess({ config, environment, botAdminId })
  const { settings, scope, authorize } = access
  async function reviewChannel(client) {
    const c = scope()
    const channel = await client.channels.fetch(c.reviewChannelId, { force: true })
    if (!channel || channel.guildId !== c.reviewGuildId || channel.type !== 0) throw Error('The configured review channel is unavailable or is not a server text channel.')
    const bot = await channel.guild.members.fetchMe({ force: true })
    const perms = channel.permissionsFor(bot)
    if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory])) throw Error('The bot needs View Channel, Send Messages, Embed Links and Read Message History in the test channel.')
    return channel
  }
  async function queuePrompt(record) {
    await store.queue(record, 'prompt', `user:${record.owner}`, p.prompt(record), String(record.revision))
  }
  async function submit(record) {
    record.status = 'PENDING'
    record.submittedAt = clock()
    record.snapshot = p.snapshot(record)
    await store.queue(record, 'receipt', `user:${record.owner}`, { ...p.quiet,
      content: record.type === 'ABSENCE' ? `Thank you for letting me know. Please also notify the other players that you won't be attending.\n${p.label(record)} receipt` : `${p.label(record)} receipt — submitted for review.`,
      embeds: [record.snapshot] })
    await store.queue(record, 'review', `channel:${record.reviewChannelId}`, p.review(record))
  }
  async function noticeEligible(record, delivery) {
    const calendar = require('../scheduling/calendar')
    const current = scope().scheduledEnabled && calendar.reminderOccurrence(settings(), record.campaign, clock())
    if (!current || current.key !== record.occurrenceKey) return false
    const slot = calendar.reminderSlot(current, clock())
    const backup = delivery.key === `${record.id}:${delivery.kind}:backup`
    if (!slot || slot.kind !== delivery.kind || slot.backup !== backup) return false
    if (backup) {
      const primary = (await store.deliveries(record.id)).find(d => d.key === `${record.id}:${delivery.kind}:`)
      if (primary && ['sent','sending','uncertain'].includes(primary.status)) return false
    }
    return !await store.completedFor(record.owner, record.occurrenceKey)
  }
  async function flush(client) {
    if (draining) return draining
    draining = (async () => {
      for (const delivery of await store.pending()) {
        try {
          const record = await store.get(delivery.submission)
          if (delivery.kind === 'prompt-clear') access.validateRecord(record)
          else await authorize(client, record, record.owner, 'delivery')
          const channel = await reviewChannel(client)
          if (!await store.claim(delivery.key)) continue
          try {
            const payload = JSON.parse(delivery.payload)
            const current = await store.get(record.id)
            if (record.isNotice) {
              if (!await noticeEligible(record, delivery)) {
                await store.finish(delivery.key, 'cancelled', null, 'Occurrence ended, notice superseded, or check-in completed.')
                continue
              }
            }
            if ((delivery.kind === 'invite' && (current.status !== 'INVITED' || delivery.key !== `${current.id}:invite:${current.revision > 0 ? current.revision : ''}`)) ||
              (delivery.kind === 'prompt' && (current.status !== 'IN_PROGRESS' || delivery.key !== `${current.id}:prompt:${current.revision}`))) {
              await store.finish(delivery.key, 'cancelled', null, 'Superseded prompt.')
              continue
            }
            let message
            if (delivery.kind === 'prompt-clear') {
              const user = await client.users.fetch(record.owner)
              const dm = await user.createDM()
              const original = await dm.messages.fetch(payload.messageId)
              settings()
              message = await original.edit({ components: [] })
            } else if (delivery.kind === 'review-edit') {
              const original = await channel.messages.fetch(payload.messageId)
              settings()
              message = await original.edit(payload.body)
            } else if (delivery.destination.startsWith('user:')) {
              const user = await client.users.fetch(record.owner)
              settings()
              if (record.isNotice) {
                await authorize(client, record, record.owner, 'player')
                if (!await noticeEligible(record, delivery)) {
                  await store.finish(delivery.key, 'cancelled', null, 'Notice no longer eligible.')
                  continue
                }
              }
              message = await user.send(payload)
            } else { settings(); message = await channel.send(payload) }
            await store.finish(delivery.key, 'sent', message.id)
          } catch (error) {
            // Definite Discord rejection is safe to report as failed. Ambiguous
            // transport/server failures are retained for inspection, never resent.
            const definite = [50007, 50001, 50013, 10003, 10008].includes(error.code)
            await store.finish(delivery.key, definite ? 'failed' : 'uncertain', null, `Delivery unavailable (${error.code || 'transport'}).`)
          }
        } catch {
          // Disabled/configuration/authorization failures leave the delivery
          // pending, with no access to another environment or fallback channel.
        }
      }
    })().finally(() => { draining = null })
    return draining
  }
  async function test(interaction) {
    settings()
    if (environment() !== 'development') throw Error('Check-in tests are disabled.')
    if (interaction.guildId !== settings().development.guildId || interaction.user.id !== botAdminId()) throw Error('Use this command as the owner in the development server.')
    const guild = await access.command(interaction)
    await reviewChannel(interaction.client)
    const campaign = interaction.options.getString('campaign') || 'monday'
    const selected = settings().campaigns[campaign]
    if (!selected) throw Error('Unknown campaign.')
    const member = await guild.members.fetch({ user: interaction.user.id, force: true })
    const c = scope()
    const record = await store.create({ owner: guild.ownerId, campaign, name: selected.name,
      guildId: c.guildId, reviewGuildId: c.reviewGuildId, reviewChannelId: c.reviewChannelId,
      isTest: true, displayName: member.displayName || interaction.user.username,
      avatar: interaction.user.displayAvatarURL(), joinedAt: member.joinedTimestamp }, interaction.id, p.invitation)
    await flush(interaction.client)
    const failures = (await store.deliveries(record.id)).filter(x => ['failed', 'uncertain'].includes(x.status))
    await interaction.editReply({ ...p.quiet, content: `TEST CHECK-IN: ${record.name}. ${failures.length ? 'DM delivery failed or is uncertain; check your DM/privacy settings and the saved delivery status.' : 'Continue in the owner DM.'}\nReview channel: <#${c.reviewChannelId}>.`, components: [] })
  }
  async function checkIn(interaction) {
    if (environment() === 'development') return test(interaction)
    const guild = await access.command(interaction)
    const c = scope()
    const member = await guild.members.fetch({ user: interaction.user.id, force: true })
    const eligible = Object.keys(c.playerRoleIds).filter(key => member.roles.cache.has(c.playerRoleIds[key]))
    const requested = interaction.options.getString('campaign')
    const campaign = requested || (eligible.length === 1 ? eligible[0] : null)
    if (!campaign || !eligible.includes(campaign)) throw Error('Choose a campaign whose player role you hold.')
    const calendar = require('../scheduling/calendar')
    let current = calendar.occurrence(settings(), campaign, clock())
    if (!current) {
      const candidate = calendar.reminderOccurrence(settings(), campaign, clock())
      const recipient = candidate && await store.recipient(interaction.user.id, candidate.key)
      if (recipient?.extendedClosesAt && clock() < recipient.extendedClosesAt) {
        current = { ...candidate, closesAt: recipient.extendedClosesAt, lateReminderExtension: true }
      }
    }
    if (!current) throw Error('There is no open check-in window for this campaign.')
    await reviewChannel(interaction.client)
    await store.expire(clock(), { backupHold: settings().schedule.backupDelayHours === 24 && settings().schedule.extendForMissedLastDayReminder })
    let record = await store.create({ owner: interaction.user.id, campaign, name: settings().campaigns[campaign].name,
      guildId: c.guildId, reviewGuildId: c.reviewGuildId, reviewChannelId: c.reviewChannelId,
      playerRoleId: c.playerRoleIds[campaign], occurrenceKey: current.key, ...current,
      isTest: false, displayName: member.displayName || interaction.user.username,
      avatar: interaction.user.displayAvatarURL(), joinedAt: member.joinedTimestamp }, interaction.id, p.invitation)
    if (record.needsResumePrompt) record = await store.resumePrompt(record.id, r => r.status === 'INVITED' ? p.invitation(r) : p.prompt(r))
    await flush(interaction.client)
    const deliveryIssues = (await store.deliveries(record.id)).some(d => ['failed','uncertain'].includes(d.status))
    await interaction.editReply({ ...p.quiet, components: [], content: record.submittedAt
      ? 'You have already submitted this check-in. Your copy is saved for review.'
      : `Continue your ${record.name} check-in in DMs.${deliveryIssues ? ' A DM could not be delivered or its delivery is uncertain; please contact the DM.' : ''}` })
  }
  async function handle(interaction) {
    const parts = interaction.customId.split(':')
    const [, id, rev, action] = parts
    const record = await store.get(id)
    settings()
    if (!record) throw Error('This check-in was not found.')
    if (record.revision !== Number(rev)) throw Error('This prompt has changed. Use the most recent message or /checkin-test to resume.')
    const isReview = /^(accept|deny)(-reason)?$/.test(action)
    const isModal = interaction.isModalSubmit?.()
    if (!isReview && record.owner !== interaction.user.id) throw Error('This check-in is not available to you.')
    access.validateRecord(record)
    if (isReview) {
      const delivery = (await store.deliveries(id)).find(x => x.kind === 'review' && x.status === 'sent')
      if (interaction.guildId !== record.reviewGuildId || interaction.channelId !== record.reviewChannelId || interaction.message?.id !== delivery?.message) throw Error('Use the buttons on the original test review message.')
      if (record.status !== 'PENDING') throw Error('This check-in has already been reviewed.')
    } else {
      if (interaction.guildId) {
        const old = interaction.message?.interaction
        if (record.isTest && interaction.guildId === record.guildId && old?.user?.id === record.owner && old?.commandName === 'checkin-test' && interaction.update) {
          await interaction.update({ components: [] })
          await interaction.followUp({ ...p.quiet, ephemeral: true, content: 'Continue in your check-in DM. These duplicate channel buttons have been removed.' })
          return
        }
        throw Error('Continue in your check-in DM. Use /check-in in the configured channel to find it.')
      }
      if (record.closesAt && clock() >= record.closesAt) throw Error('This check-in window has closed.')
      const kind = record.status === 'INVITED' ? 'invite' : 'prompt'
      const delivery = (await store.deliveries(id)).find(x => x.key === `${id}:${kind}:${kind === 'prompt' || record.revision > 0 ? record.revision : ''}` && x.status === 'sent')
      if (interaction.message?.id !== delivery?.message) throw Error('Use the current check-in prompt in your DM.')
      if (!['INVITED', 'IN_PROGRESS'].includes(record.status)) throw Error('This check-in has already been submitted.')
    }
    if (!isModal && (action === 'text' || action === 'absence' || action.endsWith('-reason'))) {
      if (action === 'text' && (record.status !== 'IN_PROGRESS' || record.question < 6)) throw Error('This question does not accept text.')
      const modal = new ModalBuilder().setCustomId(interaction.customId).setTitle(action === 'absence' ? 'Absence explanation' : isReview ? 'Review reason' : 'Check-in answer')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('answer')
          .setLabel(action === 'absence' ? 'Why will you be absent?' : isReview ? 'Reason for your decision' : `Question ${record.question + 1}`)
          .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(record.question === 8 && !isReview && action !== 'absence' ? 100 : 800)))
      // Modal submission rechecks fresh owner/configuration and revision.
      await interaction.showModal(modal)
      return
    }
    const updatePrompt = !isReview && Boolean(interaction.deferUpdate) && Boolean(interaction.message)
    if (updatePrompt) await interaction.deferUpdate()
    else await interaction.deferReply({ ephemeral: Boolean(interaction.guildId) })
    await authorize(interaction.client, record, interaction.user.id, isReview ? 'review' : 'player')
    const raw = isModal ? interaction.fields.getTextInputValue('answer') : null
    if (isModal && (!raw?.trim() || raw.length > (record.question === 8 && !isReview && action === 'text' ? 100 : 800))) throw Error('Please enter an answer within the field limit.')
    const updated = await store.change(id, Number(rev), interaction.id, async next => {
      if (!isReview && next.closesAt && clock() >= next.closesAt) throw Error('This check-in window has closed.')
      if (isReview) {
        if (next.status !== 'PENDING') throw Error('This check-in has already been reviewed.')
        next.status = action.startsWith('accept') ? 'ACCEPTED' : 'DENIED'
        next.reason = raw || null
        next.reviewer = interaction.user.username
        next.reviewedAt = clock()
        await store.queue(next, 'decision', `user:${next.owner}`, p.decision(next))
        const delivery = (await store.deliveries(id)).find(x => x.kind === 'review' && x.status === 'sent')
        await store.queue(next, 'review-edit', `channel:${next.reviewChannelId}`, { messageId: delivery.message, body: p.decision(next) })
      } else if (action === 'begin') {
        if (next.status !== 'INVITED') throw Error('This test is already in progress.')
        next.type = 'STANDARD'; next.status = 'IN_PROGRESS'; next.startedAt = clock(); await queuePrompt(next)
      } else if (action === 'absence' && isModal) {
        next.type = 'ABSENCE'; next.startedAt ||= clock(); next.explanation = raw; await submit(next)
      } else {
        if (next.status !== 'IN_PROGRESS') throw Error('Begin the check-in first.')
        const q = next.question
        let answer
        if (q <= 3 && /^answer-[1-5]$/.test(action)) answer = action.slice(7)
        else if (q >= 4 && q <= 5 && ['answer-Yes', 'answer-No'].includes(action)) answer = action.slice(7)
        else if (q >= 6 && action === 'text' && isModal) answer = raw
        else if (q === 7 && action === 'skip') answer = '-'
        else throw Error('This answer does not match the current question.')
        next.answers[q] = answer
        next.question++
        if (q === 5 && answer === 'Yes') { next.answers[6] = '-'; next.question = 7 }
        if (next.question > 8) await submit(next)
        else await queuePrompt(next)
      }
      if (!isReview) {
        const kind = record.status === 'INVITED' ? 'invite' : 'prompt'
        const old = (await store.deliveries(id)).find(x => x.key === `${id}:${kind}:${kind === 'prompt' || record.revision > 0 ? record.revision : ''}` && x.status === 'sent')
        if (old) await store.queue(next, 'prompt-clear', `user:${next.owner}`, { messageId: old.message }, old.message)
      }
    })
    await flush(interaction.client)
    const deliveries = await store.deliveries(id)
    const errors = deliveries.filter(x => ['failed', 'uncertain'].includes(x.status))
    if (updatePrompt) { await interaction.editReply({ components: [] }); return }
    await interaction.editReply({ ...p.quiet, content: `${isReview ? `Decision saved: ${updated.status}.` : updated.status === 'PENDING' ? 'Your test check-in has been submitted.' : 'Answer saved. Continue in your DM.'}${errors.length ? '\nA delivery failed or is uncertain. Your saved answers/decision are preserved; no automatic resend will duplicate it.' : ''}` })
  }
  return { test, checkIn, handle, flush, authorize, reviewChannel }
}
module.exports = { createController }
