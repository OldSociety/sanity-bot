const { config: defaultConfig, pieces, getEventState } = require('./config')
const { createEconomy } = require('./economy')
const { createParticipants } = require('./participants')
const { createEffects } = require('./effects')
const { createCollection } = require('./collection')
const { createTheft } = require('./theft')
const { createPlayful } = require('./playful')
const { createProgression } = require('./progression')
const { createFatePurchases } = require('./fate-purchases')
const { actionMessages, privateScreen, helpScreen } = require('./presentation')

function createController({ sequelize, User, models, delivery, fetchMembers, roleIds, event = defaultConfig,
  clock = () => new Date(), random = Math.random, allowedChannelIds = [], notifications = null, badges = null, badgeAccess = null }) {
  if (User.sequelize !== sequelize) throw new Error('User and seasonal database must match')
  const economy = createEconomy({ sequelize, models, configVersion: event.version, clock })
  const participants = createParticipants({ models, economy, event })
  const effects = createEffects({ models, participants, event })
  const collection = createCollection({ models, participants, event, random, badges })
  const locks = new Map()
  async function completed(ctx, userId) {
    const player = await models.Participant.findOne({ where: { ...ctx.scope, userId }, transaction: ctx.transaction })
    if (!player) return []
    const rows = await models.Inventory.findAll({ where: { participantId: player.id }, transaction: ctx.transaction })
    const owned = new Set(rows.map(row => row.pieceId))
    return [...new Set(pieces.map(piece => piece.characterId))].filter(id => pieces.filter(piece => piece.characterId === id).every(piece => owned.has(piece.id)))
  }
  async function executeCommand(interaction) {
    if (!interaction.deferred) await interaction.deferReply({ ephemeral: true })
    const subcommand = interaction.options.getSubcommand()
    const input = { eventId: event.eventId, guildId: interaction.guildId, actorId: interaction.user.id, interactionId: interaction.id }
    if (!interaction.guildId) throw new Error('Spooky requires a server')
    if (allowedChannelIds.length && !allowedChannelIds.includes(interaction.channelId)) throw new Error('Use the configured Spooky or bot-test channel')
    if (['help','welcome'].includes(subcommand)) return interaction.editReply(helpScreen())
    if (subcommand === 'register') {
      const result = await economy.execute({ ...input, operationType: 'spooky_register' }, async ctx => {
        let user = await User.findByPk(input.actorId, { transaction: ctx.transaction })
        if (!user) {
          user = await User.create({ user_id: input.actorId, user_name: interaction.user.username }, { transaction: ctx.transaction })
          await ctx.record({ userId: input.actorId, resource: 'fate_account', delta: 0, metadata: { reason: 'registration_account' } })
        }
        const prepared = await participants.prepare(ctx, input.actorId, { register: true })
        return { candy: prepared.participant.candy, newlyRegistered: prepared.newlyRegistered }
      })
      return interaction.editReply(privateScreen('🎃 Spooky Registration', `${result.receipt.newlyRegistered ? 'Welcome!' : 'Already registered.'} **${result.receipt.candy} candy**. Use /spooky help for rules.`))
    }
    if (['status','collection'].includes(subcommand)) {
      if (event.enabled && getEventState(clock(), event) === 'ACTIVE') await participants.refill({ ...input, workerKey: undefined })
      const player = await models.Participant.findOne({ where: { eventId: event.eventId, guildId: input.guildId, userId: input.actorId } })
      if (!player?.registeredAt) return interaction.editReply(privateScreen('🎃 Join Spooky', 'Use /spooky register to join.'))
      if (subcommand === 'status') return interaction.editReply(privateScreen('🎃 Your Spooky Status', `**Candy:** ${player.candy}/80\n**Evil Eyes:** ${player.eyes}\nRefill: +10 every three hours.\nUse /spooky collection to view quarters.`))
      const rows = await models.Inventory.findAll({ where: { participantId: player.id } })
      const text = [...new Set(pieces.map(piece => piece.characterId))].map(id => {
        const character = pieces.filter(piece => piece.characterId === id)
        return `**${character[0].characterName}:** ${character.filter(piece => rows.some(row => row.pieceId === piece.id)).length}/4`
      }).join('\n')
      return interaction.editReply(privateScreen('🧩 Your Collection', text))
    }
    if (!['trick','treat','fate'].includes(subcommand)) throw new Error('Unknown spooky command')
    // Discord fetches occur before any root database transaction; failures abort.
    const snapshot = await fetchMembers(interaction.guildId, { actorId: input.actorId, actorOnly: subcommand === 'fate' })
    if (!Array.isArray(snapshot) || !snapshot.some(member => member.userId === input.actorId)) throw new Error('Complete membership snapshot unavailable')
    const finalizeReceipt = async (ctx, receipt) => {
      const registered = await models.Participant.findAll({ where: ctx.scope, transaction: ctx.transaction })
      const messages = actionMessages(receipt, { actorId: input.actorId, members: snapshot,
        registeredIds: new Set(registered.filter(row => row.registeredAt).map(row => row.userId)) })
      if (notifications) await notifications.enqueue(ctx, interaction.channelId, messages)
      return { ...receipt, messages }
    }
    const theft = createTheft({ models, participants, collection, event, random, listMembers: () => snapshot })
    const playful = createPlayful({ models, participants, effects, collection, delivery, event, random, roleIds, listMembers: () => snapshot })
    const progression = createProgression({ User, models, event, isUnwanted: (_ctx, userId) => {
      const member = snapshot.find(member => member.userId === userId)
      if (!Array.isArray(member?.roleIds)) throw new Error('Role snapshot unavailable')
      return member.roleIds.includes(roleIds.unwanted)
    } })
    const raw = progression.wrapHandlers({ ...playful.handlers, ...theft.handlers })
    const handlers = Object.fromEntries(Object.entries(raw).map(([key, handler]) => [key, async (ctx, plan) => {
      const before = await completed(ctx, input.actorId), result = await handler(ctx, plan)
      return { ...result, newlyCompletedCharacters: (result.completeCharacters || []).filter(id => !before.includes(id)) }
    }]))
    let result
    if (subcommand === 'fate') {
      const wrapped = { drawQuarter: async (ctx, userId) => {
        const before = await completed(ctx, userId), reward = await collection.drawQuarter(ctx, userId)
        return { ...reward, newlyCompletedCharacters: reward.completeCharacters.filter(id => !before.includes(id)) }
      } }
      result = await createFatePurchases({ User, models, economy, collection: wrapped, event, finalizeReceipt }).purchase(input)
    } else result = await require('./actions').createActions({ models, economy, participants, event, random, handlers,
      getCurseState: effects.getCurseState, finalizeReceipt }).execute({ ...input, action: subcommand })
    // Root operation retains exact visibility/mention/render plan on replay.
    const messages = result.receipt.messages
    await require('./post-commit').finishSaved({ interaction, result, badgeAccess, userId: input.actorId,
      payload: messages.find(message => !message.public)?.payload || privateScreen('🎃 Action Recorded', `Your event result is saved and queued for the channel. **Operation: ${result.operationId}**`),
      publish: async () => {
      if (notifications) await notifications.deliver(result.operationId, interaction.channel)
      else for (let index = 0; index < messages.length; index++) if (messages[index].public) await interaction.channel.send({ ...require('./token-art').preparePayload(messages[index].payload), nonce: `${interaction.id}:${index}`, enforceNonce: true })
    } })
  }
  async function execute(interaction) {
    // Prevent two deliveries for the same interaction in this process.
    if (locks.has(interaction.id)) return locks.get(interaction.id)
    const work = executeCommand(interaction).catch(async error => {
      const payload = privateScreen('🎃 Spooky Unavailable', error.message)
      if (interaction.deferred) await interaction.editReply(payload).catch(() => {})
      else await interaction.reply({ ...payload, ephemeral: true }).catch(() => {})
    })
    locks.set(interaction.id, work)
    work.finally(() => locks.delete(interaction.id)).catch(() => {})
    // Adapter lifetime must be bounded per request/session. Economy replay and
    // Discord enforced nonce handle durable mutation and public delivery retries.
    return work
  }
  return { execute }
}

module.exports = { createController }
