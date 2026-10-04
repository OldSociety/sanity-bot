const { config: defaultConfig, pieces, getEventState } = require('./config')
const { createEconomy } = require('./economy')
const { createParticipants } = require('./participants')
const { createEffects } = require('./effects')
const { createCollection } = require('./collection')
const { createTheft } = require('./theft')
const { createPlayful } = require('./playful')
const { createProgression } = require('./progression')
const { createFatePurchases } = require('./fate-purchases')
const {
  actionMessages,
  privateScreen,
  helpScreen,
  registrationScreen,
  withBalances,
} = require('./presentation')

function createController({
  sequelize,
  User,
  models,
  delivery,
  fetchMembers,
  roleIds,
  event = defaultConfig,
  clock = () => new Date(),
  random = Math.random,
  mentionRoll,
  allowedChannelIds = [],
  notifications = null,
  badges = null,
  badgeAccess = null,
}) {
  if (User.sequelize !== sequelize)
    throw new Error('User and seasonal database must match')
  const economy = createEconomy({
    sequelize,
    models,
    configVersion: event.version,
    clock,
  })
  const participants = createParticipants({ models, economy, event })
  const effects = createEffects({ models, participants, event })
  const collection = createCollection({
    models,
    participants,
    event,
    random,
    badges,
  })
  const locks = new Map()
  async function completed(ctx, userId) {
    const player = await models.Participant.findOne({
      where: { ...ctx.scope, userId },
      transaction: ctx.transaction,
    })
    if (!player) return []
    const rows = await models.Inventory.findAll({
      where: { participantId: player.id },
      transaction: ctx.transaction,
    })
    const owned = new Set(rows.map((row) => row.pieceId))
    return [...new Set(pieces.map((piece) => piece.characterId))].filter((id) =>
      pieces
        .filter((piece) => piece.characterId === id)
        .every((piece) => owned.has(piece.id)),
    )
  }
  async function executeCommand(interaction, purchaseApproval = null) {
    if (!interaction.deferred) await interaction.deferReply({ ephemeral: interaction.options.getSubcommand() !== 'leaderboard' })
    const subcommand = interaction.options.getSubcommand()
    const input = {
      eventId: event.eventId,
      guildId: interaction.guildId,
      actorId: interaction.user.id,
      interactionId: interaction.id,
      ...(purchaseApproval ? { expectedWallet: purchaseApproval } : {}),
    }
    if (!interaction.guildId) throw new Error('Spooky requires a server')
    if (
      allowedChannelIds.length &&
      !allowedChannelIds.includes(interaction.channelId)
    )
      throw new Error('Use the configured Spooky or bot-test channel')
    if (subcommand === 'help') {
      const player = await balanceSnapshot(input)
      return interaction.editReply(
        withBalances(helpScreen(), player || {}, clock(), event),
      )
    }
    if (subcommand === 'leaderboard') {
      const page = interaction.options.getInteger?.('page') ?? 1
      const leaders = await require('./leaderboard').createLeaderboard({
        models,
        economy,
        User,
        badges,
      })({ eventId: event.eventId, guildId: input.guildId }, page)
      const emojis = interaction.guild?.emojis?.fetch
        ? [...(await interaction.guild.emojis.fetch()).values()]
        : []
      const text = leaders
        .map(
          (row) =>
            `**#${row.rank} ${require('../display-name').safeName(
              row.name,
            )}**\n${require('../badges').renderBadges(row.badges, emojis)}`,
        )
        .join('\n\n')
      const latestBadge = badges?.latest ? await badges.latest(input.guildId) : require('../badges').badges.find(badge => badge.characterId === 'sel')
      const badgeEmoji = emojis.find(emoji => emoji.available !== false &&
        [latestBadge?.emojiName, `${latestBadge?.characterId === 'sel' ? 'selene' : latestBadge?.name?.toLowerCase()}_badge`].includes(emoji.name?.toLowerCase()))
      const fallbackBadge = latestBadge?.imageAsset ? latestBadge : require('../badges').badges.find(badge => badge.characterId === 'sel')
      const badgeThumbnail = badgeEmoji ? `https://cdn.discordapp.com/emojis/${badgeEmoji.id}.${badgeEmoji.animated ? 'gif' : 'png'}?size=128`
        : `attachment://${fallbackBadge.imageAsset}`
      const rankingScreen = privateScreen(`👻 SCREAM SUPREME • Rankings ${page}`, text || 'No tricks or treats have been scored yet.')
      rankingScreen.embeds[0].thumbnail = { url: badgeThumbnail }
      if (!badgeEmoji) rankingScreen.files = [{ name: fallbackBadge.imageAsset, badgeAsset: fallbackBadge.imageAsset }]
      return interaction.editReply(
        require('./token-art').preparePayload(withBalances(
          rankingScreen,
          (await balanceSnapshot(input)) || {},
          clock(),
          event,
        )),
      )
    }
    if (subcommand === 'register') {
      const result = await economy.execute(
        { ...input, operationType: 'spooky_register' },
        async (ctx) => {
          let user = await User.findByPk(input.actorId, {
            transaction: ctx.transaction,
          })
          if (!user) {
            user = await User.create(
              { user_id: input.actorId, user_name: interaction.user.username },
              { transaction: ctx.transaction },
            )
            await ctx.record({
              userId: input.actorId,
              resource: 'fate_account',
              delta: 0,
              metadata: { reason: 'registration_account' },
            })
          }
          const prepared = await participants.prepare(ctx, input.actorId, {
            register: true,
          })
          return {
            candy: prepared.participant.candy,
            eyes: prepared.participant.eyes,
            newlyRegistered: prepared.newlyRegistered,
          }
        },
      )
      return interaction.editReply(
        withBalances(
          registrationScreen(result.receipt, interaction.user),
          result.receipt,
          clock(),
          event,
        ),
      )
    }
    if (subcommand === 'collection') {
      if (event.enabled && getEventState(clock(), event) === 'ACTIVE')
        await participants.refill({ ...input, workerKey: undefined })
      const player = await models.Participant.findOne({
        where: {
          eventId: event.eventId,
          guildId: input.guildId,
          userId: input.actorId,
        },
      })
      if (!player?.registeredAt)
        return interaction.editReply(
          privateScreen('🎃 Join Spooky', 'Use /spooky register to join.'),
        )
      const rows = await models.Inventory.findAll({
        where: { participantId: player.id },
      })
      const emojiMap = interaction.guild?.emojis?.fetch
        ? [...(await interaction.guild.emojis.fetch()).values()]
        : []
      const text = [...new Set(pieces.map((piece) => piece.characterId))]
        .map((id) => {
          const character = pieces.filter((piece) => piece.characterId === id)
          const count = character.filter((piece) =>
            rows.some((row) => row.pieceId === piece.id),
          ).length
          const badge = require('../badges').badges.find(
            (badge) => badge.characterId === id,
          )
          const emoji = emojiMap.find(
            (emoji) =>
              emoji.name === badge?.emojiName && emoji.available !== false,
          )
          const icon =
            count < 4
              ? '❔'
              : emoji
              ? `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`
              : '🏅'
          return `${icon} **${character[0].characterName}:** ${count}/4`
        })
        .join('\n')
      const duplicates = rows.reduce((sum, row) => sum + row.quantity - 1, 0)
      return interaction.editReply(
        withBalances(
          privateScreen(
            '🧩 Your Collection',
            `${text}\n\n**Current Duplicates: ${duplicates}/5**\nEvery 5 duplicates will grant you a new unowned piece!`,
          ),
          player,
          clock(),
          event,
        ),
      )
    }
    if (subcommand === 'spend-fate' && !purchaseApproval) {
      const saved = await economy.read((transaction) =>
        models.Operation.findByPk(`discord:${input.interactionId}`, {
          transaction,
        }),
      )
      if (saved) {
        // Re-deliver the original committed result even after the wallet is empty
        // or October ends. Replay identity is checked by the economy; this path
        // cannot make a new purchase or skip a fresh confirmation.
        const result = await economy.execute(
          { ...input, operationType: 'fate_quarter_purchase' },
          async () => {
            throw new Error('Purchase replay proof disappeared')
          },
        )
        return finishResult(interaction, input, result)
      }
      const quote = await economy.read(async (transaction) => {
        if (!event.enabled || getEventState(clock(), event) !== 'ACTIVE')
          throw new Error('Spooky is not active')
        const player = await models.Participant.findOne({
          where: {
            eventId: input.eventId,
            guildId: input.guildId,
            userId: input.actorId,
          },
          transaction,
        })
        if (!player?.registeredAt)
          throw new Error('Use /spooky register to join first.')
        const state = await models.EventState.findOne({
          where: { eventId: input.eventId, guildId: input.guildId },
          transaction,
        })
        if (state?.actionsPaused || state?.archivedAt)
          throw new Error('Spooky actions are paused or closed')
        const user = await User.findByPk(input.actorId, { transaction })
        if (!user) throw new Error('Fate account does not exist')
        const wallet = { bank: user.bank, fatePoints: user.fate_points }
        return {
          ...(await balanceSnapshotInTransaction(input, transaction)),
          wallet,
          payment: require('./fate-purchases').planFatePayment(
            user.bank,
            user.fate_points,
            event.fate.quarterCost,
          ),
        }
      })
      return require('./fate-confirmation').showConfirmation(interaction, {
        quote,
        event,
        onConfirm: () => executeCommand(interaction, quote.wallet),
      })
    }
    if (!['trick', 'treat', 'spend-fate'].includes(subcommand))
      throw new Error('Unknown spooky command')
    // Discord fetches occur before any root database transaction; failures abort.
    const snapshot = await fetchMembers(interaction.guildId, {
      actorId: input.actorId,
      actorOnly: subcommand === 'spend-fate',
    })
    if (
      !Array.isArray(snapshot) ||
      !snapshot.some((member) => member.userId === input.actorId)
    )
      throw new Error('Complete membership snapshot unavailable')
    const finalizeReceipt = async (ctx, receipt) => {
      const player = await models.Participant.findOne({
        where: { ...ctx.scope, userId: input.actorId },
        transaction: ctx.transaction,
      })
      receipt = { ...receipt, candy: player.candy, eyes: player.eyes }
      const registered = await models.Participant.findAll({
        where: ctx.scope,
        transaction: ctx.transaction,
      })
      const registeredIds = new Set(
        registered.filter((row) => row.registeredAt).map((row) => row.userId),
      )
      const mentions = await require('./mentions').reserveRecipientMentions({
        models,
        ctx,
        actorId: input.actorId,
        userIds: require('./presentation').targetIds(
          receipt.result || receipt,
          input.actorId,
        ),
        registeredIds,
        settings: event.recipientMentions,
        random: mentionRoll,
        names: Object.fromEntries(
          snapshot.map((member) => [member.userId, member.displayName]),
        ),
      })
      const messages = (await require('./gifs').withRecentActionGif(receipt, actionMessages(receipt, {
        actorId: input.actorId,
        members: snapshot,
        registeredIds,
        mentionIds: new Set(mentions.allowed),
        variantKey: ctx.operationId,
        timestamp: ctx.now.toISOString(),
        avatarURL:
          typeof interaction.user.displayAvatarURL === 'function'
            ? interaction.user.displayAvatarURL()
            : undefined,
      }), { operationId: ctx.operationId, routinePercent: event.gifs.routinePercent },
      { models: notifications ? models : null, ctx, channelId: interaction.channelId })).map((message) => ({
        ...message,
        payload: withBalances(message.payload, receipt, ctx.now, event),
      }))
      if (mentions.allowed.length)
        messages[0].payload._spookyMentions = mentions.reservation
      if (notifications)
        await notifications.enqueue(ctx, interaction.channelId, messages)
      return { ...receipt, messages }
    }
    const theft = createTheft({
      models,
      participants,
      collection,
      effects,
      delivery,
      event,
      random,
      listMembers: () => snapshot,
    })
    const playful = createPlayful({
      models,
      participants,
      effects,
      collection,
      delivery,
      event,
      random,
      roleIds,
      listMembers: () => snapshot,
    })
    const progression = createProgression({
      User,
      models,
      event,
      isUnwanted: (_ctx, userId) => {
        const member = snapshot.find((member) => member.userId === userId)
        if (!Array.isArray(member?.roleIds))
          throw new Error('Role snapshot unavailable')
        return member.roleIds.includes(roleIds.unwanted)
      },
    })
    const raw = progression.wrapHandlers({
      ...playful.handlers,
      ...theft.handlers,
      ...require('./candy-events').createCandyEvents({ models, participants, effects, delivery, event, random, listMembers: () => snapshot }).handlers,
    })
    const handlers = Object.fromEntries(
      Object.entries(raw).map(([key, handler]) => [
        key,
        async (ctx, plan) => {
          const before = await completed(ctx, input.actorId),
            result = await handler(ctx, plan)
          return {
            ...result,
            newlyCompletedCharacters: (result.completeCharacters || []).filter(
              (id) => !before.includes(id),
            ),
          }
        },
      ]),
    )
    let result
    if (subcommand === 'spend-fate') {
      const wrapped = {
        drawFateQuarter: async (ctx, userId) => {
          const before = await completed(ctx, userId),
            reward = await collection.drawFateQuarter(ctx, userId)
          return {
            ...reward,
            newlyCompletedCharacters: reward.completeCharacters.filter(
              (id) => !before.includes(id),
            ),
          }
        },
      }
      result = await createFatePurchases({
        User,
        models,
        economy,
        collection: wrapped,
        event,
        finalizeReceipt,
      }).purchase(input)
    } else
      result = await require('./actions')
        .createActions({
          models,
          economy,
          participants,
          event,
          random,
          clock,
          prepareChoice: {
            candidates: async (ctx, plan) => require('./theft').randomTargets(await playful.choiceCandidates(ctx, plan), 3, random),
            choose: (selected, candidates, balances) => selected.outcome === 'break_curse' && candidates.length === 1 ? candidates[0].userId : require('./target-choice').chooseTarget(interaction, candidates, {
              outcome: selected.outcome, timeoutMs: event.targetChoice.timeoutMs, random, balances, event,
            }),
          },
          handlers,
          getCurseState: effects.getCurseState,
          getCrownHolder: playful.crownHolder,
          finalizeReceipt,
        })
        .execute({ ...input, action: subcommand })
    return finishResult(interaction, input, result)
  }
  async function finishResult(interaction, input, result) {
    // Root operation retains exact visibility/mention/render plan on replay.
    const messages = result.receipt.messages
    const personal = messages.find((message) => !message.public)
    await require('./post-commit').finishSaved({
      interaction,
      result,
      badgeAccess,
      userId: input.actorId,
      payload:
        personal?.payload ||
        privateScreen(
          '🎃 Trick or Treat!',
          'Your Halloween mischief is heading into the channel…',
        ),
      hideAfterPublish: !personal,
      publish: async () => {
        if (notifications)
          return notifications.deliver(result.operationId, interaction.channel)
        else
          for (let index = 0; index < messages.length; index++)
            if (messages[index].public)
              await interaction.channel.send({
                ...require('./token-art').preparePayload(
                  messages[index].payload,
                  {
                    operationId: result.operationId,
                    ordinal: index,
                    now: clock(),
                  },
                ),
                nonce: `${interaction.id}:${index}`,
                enforceNonce: true,
              })
      },
    })
  }
  async function execute(interaction) {
    // Prevent two deliveries for the same interaction in this process.
    if (locks.has(interaction.id)) return locks.get(interaction.id)
    const work = (async () => {
      if (!interaction.deferred)
        await interaction.deferReply({ ephemeral: interaction.options.getSubcommand() !== 'leaderboard' })
      const input = {
        eventId: event.eventId,
        guildId: interaction.guildId,
        actorId: interaction.user.id,
      }
      let nudge = false
      if (
        interaction.guildId &&
        (!allowedChannelIds.length ||
          allowedChannelIds.includes(interaction.channelId))
      ) {
        try {
          nudge = await require('./private-nudges').claimNudge({
            economy,
            models,
            input,
            event,
            now: clock(),
          })
        } catch (error) {
          console.error('Spooky private nudge failed:', error.message)
        }
      }
      await executeCommand(interaction)
      if (nudge && typeof interaction.followUp === 'function') {
        const player = await balanceSnapshot(input)
        if (
          !player ||
          (nudge === 'bucket'
            ? player.candy < event.candy.capacity
            : player.candy < 50 || player.candy >= event.candy.capacity)
        )
          return
        await interaction
          .followUp({
            ...withBalances(
              privateScreen(
                nudge === 'bucket'
                  ? '🍬 Your Candy Bucket Is Overflowing!'
                  : '🍬 A Sweet Welcome Back!',
                nudge === 'bucket'
                  ? 'Your bucket is brimming with candy! Enjoy a trick or treat before more sweets tumble into the shadows.'
                  : 'Nice to see you! You have a lovely stash of sweets ready for some Halloween mischief. Enjoy a trick or treat whenever you feel like it.',
              ),
              player || {},
              clock(),
              event,
            ),
            ephemeral: true,
          })
          .catch(() => {})
      }
    })().catch(async (error) => {
      const player = await balanceSnapshot({
        eventId: event.eventId,
        guildId: interaction.guildId,
        actorId: interaction.user.id,
      }).catch(() => null)
      const payload = {
        ...withBalances(
          privateScreen('🎃 Spooky Unavailable', error.message),
          player || {},
          clock(),
          event,
        ),
        components: [],
      }
      if (interaction.deferred)
        await interaction.editReply(payload).catch(() => {})
      else
        await interaction.reply({ ...payload, ephemeral: true }).catch(() => {})
    })
    locks.set(interaction.id, work)
    work.finally(() => locks.delete(interaction.id)).catch(() => {})
    // Adapter lifetime must be bounded per request/session. Economy replay and
    // Discord enforced nonce handle durable mutation and public delivery retries.
    return work
  }
  async function balanceSnapshot(input) {
    return economy.read((transaction) =>
      balanceSnapshotInTransaction(input, transaction),
    )
  }
  async function balanceSnapshotInTransaction(input, transaction) {
    const player = await models.Participant.findOne({
      where: {
        eventId: input.eventId,
        guildId: input.guildId,
        userId: input.actorId,
      },
      transaction,
    })
    if (!player?.registeredAt) return null
    const candy =
      event.enabled && getEventState(clock(), event) === 'ACTIVE'
        ? require('./participants').calculateRefill({
            candy: player.candy,
            refillAnchor: player.refillAnchor,
            now: clock(),
            event,
          }).candy
        : player.candy
    return { candy, eyes: player.eyes }
  }
  return { execute }
}

module.exports = { createController }
