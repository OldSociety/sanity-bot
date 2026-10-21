const { randomUUID } = require('node:crypto')
const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js')
const { loadCatalog } = require('./campaign-catalog')

function createCampaign({
  catalog = loadCatalog(),
  authorize = (interaction) =>
    require('./access').access.authorize(interaction),
  environment = () => process.env.NODE_ENV,
  now = Date.now,
  timeoutMs = 5 * 60 * 1000,
  maxSessions = 1000,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  lifecycle = null,
  logger = console,
} = {}) {
  const sessions = new Map()
  const reply = (interaction, content) =>
    interaction.reply({
      content,
      ephemeral: true,
      allowedMentions: { parse: [] },
    })
  const towerFor = (session) =>
    catalog.find((tower) => tower.id === session.towerId && tower.available)
  function view(session, ended = false) {
    const id = (action) =>
      `arena:campaign:${session.id}:${session.revision}:${action}`
    const button = (
      action,
      label,
      style = ButtonStyle.Secondary,
      disabled = false,
    ) =>
      new ButtonBuilder()
        .setCustomId(id(action))
        .setLabel(label)
        .setStyle(style)
        .setDisabled(disabled)
    const embed = new EmbedBuilder()
      .setColor(0x34985d)
      .setFooter({
        text: 'Arena Campaign • Preview • Progress is not saved yet',
      })
    const components = []
    if (ended) {
      embed
        .setTitle('Campaign closed')
        .setDescription('Use /arena campaign to choose a tower again.')
    } else if (session.page === 'towers') {
      const start = session.catalogPage * 5,
        towers = catalog.slice(start, start + 5)
      embed
        .setTitle('Arena Campaign — Choose a tower')
        .setDescription(
          'Climb a series of ordered fights and face a boss at the summit.\n\n' +
            towers
              .map(
                (tower) =>
                  `**${tower.number}. ${tower.name}**\n${
                    tower.available
                      ? `${tower.encounters.length} fights • Boss at the summit`
                      : 'Coming soon'
                  }`,
              )
              .join('\n\n'),
        )
      const available = towers.filter((tower) => tower.available)
      if (available.length)
        components.push(
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(id('select'))
              .setPlaceholder('Choose a tower')
              .addOptions(
                available.map((tower) => ({
                  label: `Tower ${tower.number}: ${tower.name}`,
                  value: tower.id,
                  description: `${tower.encounters.length} ordered fights, ending with a boss`,
                })),
              ),
          ),
        )
      components.push(
        new ActionRowBuilder().addComponents(
          button('previous', 'Previous', ButtonStyle.Secondary, start === 0),
          button(
            'next',
            'Next',
            ButtonStyle.Secondary,
            start + 5 >= catalog.length,
          ),
          button('close', 'Cancel Climb', ButtonStyle.Danger),
        ),
      )
      embed.setFooter({
        text: `Towers ${start + 1}–${Math.min(start + 5, catalog.length)} of ${
          catalog.length
        } • Page ${session.catalogPage + 1}/${Math.ceil(catalog.length / 5)}`,
      })
    } else {
      const tower = towerFor(session)
      if (session.page === 'tower') {
        embed
          .setTitle(`Tower ${tower.number} — ${tower.name}`)
          .setDescription(
            `${tower.description}\n\n` +
              tower.encounters
                .map(
                  (enemy, index) =>
                    `**${index + 1}. ${enemy.name}${
                      enemy.boss ? ' — BOSS' : ''
                    }** • ${enemy.health} HP • ${enemy.damage} Damage`,
                )
                .join('\n') +
              '\n\nBegin your climb with Fight 1. Combat is coming soon.',
          )
        components.push(
          new ActionRowBuilder().addComponents(
            button('begin', 'Begin Climb', ButtonStyle.Success),
            button('towers', 'Back to Towers'),
            button('close', 'Cancel Climb', ButtonStyle.Danger),
          ),
        )
      } else {
        const enemy = tower.encounters[0]
        embed
          .setColor(0xffa500)
          .setTitle(`${enemy.name} — Fight 1/${tower.encounters.length}`)
          .setDescription(
            `Tower ${tower.number} — ${tower.name}\n\n**Health:** ${enemy.health} HP\n**Damage:** ${enemy.damage}\n\nYou have reached the first fight. Combat is coming soon.`,
          )
        components.push(
          new ActionRowBuilder().addComponents(
            button('combat', 'Combat Coming Soon', ButtonStyle.Primary, true),
            button('tower', 'Back to Tower'),
            button('close', 'Leave Climb', ButtonStyle.Danger),
          ),
        )
      }
    }
    return {
      content: '',
      embeds: [embed],
      components,
      allowedMentions: { parse: [] },
    }
  }
  function remove(session) {
    session.expiryGeneration = (session.expiryGeneration || 0) + 1
    clearTimer(session.timer)
    sessions.delete(session.id)
    session.release?.()
  }
  async function retire(session) {
    remove(session)
    await session.work?.catch(() => {})
    try { await session.edit({ components: [], allowedMentions: { parse: [] } }) }
    catch (error) {
      if (![10008, 10015, 50027].includes(Number(error.code)))
        logger.warn?.(`Arena campaign cleanup failed: ${error.code || error.name}`)
    }
  }
  function armExpiry(session) {
    clearTimer(session.timer)
    const generation = session.expiryGeneration = (session.expiryGeneration || 0) + 1
    session.expiresAt = now() + timeoutMs
    session.timer = setTimer(() => {
      if (generation === session.expiryGeneration && sessions.has(session.id)) return retire(session)
    }, timeoutMs)
    session.timer?.unref?.()
  }
  async function execute(interaction) {
    if (environment() !== 'development')
      return reply(
        interaction,
        'Campaign preview is available on the development bot only.',
      )
    if (!(await authorize(interaction))) return
    await interaction.deferReply({ ephemeral: true })
    return lifecycle ? lifecycle.open(interaction, () => openSession(interaction)) : openSession(interaction)
  }
  async function openSession(interaction) {
    for (const previous of sessions.values())
      if (previous.ownerId === interaction.user.id && previous.guildId === interaction.guildId) await retire(previous)
    if (sessions.size >= maxSessions)
      return interaction.editReply({ content: 'Campaign is busy. Please try again shortly.' })
    const session = {
      id: randomUUID(),
      ownerId: interaction.user.id,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      page: 'towers',
      catalogPage: 0,
      revision: 0,
      expiresAt: now() + timeoutMs,
      interaction,
      busy: true,
      edit: payload => interaction.editReply(payload),
    }
    sessions.set(session.id, session)
    session.release = lifecycle?.track(interaction, () => retire(session))
    try {
      const message = await interaction.editReply(view(session))
      session.messageId = message.id
      armExpiry(session)
    } catch (error) {
      remove(session)
      throw error
    } finally {
      session.busy = false
    }
  }
  async function handleButton(interaction) {
    if (environment() !== 'development')
      return reply(
        interaction,
        'Campaign preview is available on the development bot only.',
      )
    if (!(await authorize(interaction))) return
    const [, , id, revision, action] = (interaction.customId || '').split(':')
    const session = sessions.get(id)
    if (!session) return interaction.update({ components: [], allowedMentions: { parse: [] } })
    if (
      session.ownerId !== interaction.user.id ||
      session.guildId !== interaction.guildId ||
      session.channelId !== interaction.channelId ||
      session.messageId !== interaction.message?.id
    )
      return reply(
        interaction,
        'This campaign menu belongs to another session. Use /arena campaign.',
      )
    if (now() >= session.expiresAt) {
      remove(session)
      return interaction.update({ components: [], allowedMentions: { parse: [] } })
    }
    if (session.busy || String(session.revision) !== revision)
      return reply(
        interaction,
        'This menu has changed. Use its latest buttons.',
      )
    const next = { ...session, revision: session.revision + 1 }
    if (action === 'close') next.closed = true
    else if (session.page === 'towers' && action === 'select') {
      const tower = catalog
        .slice(session.catalogPage * 5, session.catalogPage * 5 + 5)
        .find(
          (tower) => tower.available && tower.id === interaction.values?.[0],
        )
      if (!tower)
        return reply(interaction, 'That tower is not available on this page.')
      next.towerId = tower.id
      next.page = 'tower'
    } else if (
      session.page === 'towers' &&
      ['previous', 'next'].includes(action)
    ) {
      next.catalogPage += action === 'next' ? 1 : -1
      if (
        next.catalogPage < 0 ||
        next.catalogPage >= Math.ceil(catalog.length / 5)
      )
        return reply(interaction, 'That page is not available.')
    } else if (session.page === 'tower' && action === 'begin')
      next.page = 'encounter'
    else if (session.page === 'encounter' && action === 'tower')
      next.page = 'tower'
    else if (session.page === 'tower' && action === 'towers')
      next.page = 'towers'
    else return reply(interaction, 'That action is not available in this menu.')
    session.busy = true
    const work = (async () => { try {
      await interaction.deferUpdate()
      session.edit = payload => interaction.editReply(payload)
      // Commit navigation only after delivery; a failed edit can be retried.
      await interaction.editReply(view(next, next.closed))
      if (!sessions.has(id)) {
        await interaction.editReply({ components: [], allowedMentions: { parse: [] } })
        return
      }
      if (next.closed) remove(session)
      else {
        const edit = session.edit
        Object.assign(session, next, { edit, work })
        armExpiry(session)
      }
    } finally {
      session.busy = false
    } })()
    session.work = work
    return work
  }
  function dispose() {
    return Promise.allSettled([...sessions.values()].map(session => retire(session)))
  }
  return { execute, handleButton, dispose }
}
let singleton
module.exports = {
  createCampaign,
  campaign: {
    execute: (interaction) =>
      (singleton ||= createCampaign({ lifecycle: require('./menu-lifecycle').menuLifecycle })).execute(interaction),
    handleButton: (interaction) =>
      (singleton ||= createCampaign({ lifecycle: require('./menu-lifecycle').menuLifecycle })).handleButton(interaction),
  },
}
