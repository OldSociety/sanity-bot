const { Op, QueryTypes } = require('sequelize')
const { config: defaultConfig, pieces, getEventState } = require('./config')

function createAdmin({ sequelize, models, User, economy, authorize, guildId,
  event = defaultConfig, environment, clock = () => new Date(), random = Math.random, finalizeRepair = null,
  delivery = null, roleIds = {}, developmentStorage, readMessage = null, readMember = null, badges = null }) {
  if (!guildId || typeof authorize !== 'function') throw new Error('Trusted admin authorization and guild are required')
  if (User.sequelize !== sequelize) throw new Error('Admin account and seasonal database must match')
  if (!['development', 'production', 'test'].includes(environment)) throw new Error('Explicit runtime environment is required')
  const scope = { eventId: event.eventId, guildId }
  const plain = row => row?.get({ plain: true }) ?? null
  function bounds(input) {
    const limit = input.limit ?? 20
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error('Limit must be an integer from 1 to 50')
    if (input.beforeId !== undefined && (!Number.isSafeInteger(input.beforeId) || input.beforeId < 1)) throw new Error('Cursor must be a positive integer')
    return { limit, ...(input.beforeId !== undefined && { id: { [Op.lt]: input.beforeId } }) }
  }
  async function checkAccess(input) {
    // Check scope and authorization on every request, even while play is disabled.
    // Authorization must come from a freshly fetched member, not supplied roles.
    if (input.guildId !== guildId || typeof input.actorId !== 'string' || !input.actorId) throw new Error('Administrator scope mismatch')
    if (await authorize({ guildId, actorId: input.actorId }) !== true) throw new Error('Administrator permission required')
  }
  async function inspect(input) {
    await checkAccess(input)
    const { limit, id } = bounds(input)
    if (input.userId !== undefined && (typeof input.userId !== 'string' || !input.userId.trim())) throw new Error('Player ID is required')
    if (!['player', 'transactions', 'config', 'deliveries'].includes(input.view)) throw new Error('Unknown administrator inspection')
    if (input.view === 'player' && !input.userId) throw new Error('Player ID is required')
    return economy.read(async transaction => {
      const state = await models.EventState.findOne({ where: scope, transaction })
      if (input.view === 'config') {
        const { snapshotOperationId } = require('./winner-snapshot')
        const frozen = await models.Operation.findByPk(snapshotOperationId(scope.eventId, scope.guildId), { transaction })
        if (frozen && (frozen.eventId !== scope.eventId || frozen.guildId !== scope.guildId || frozen.operationType !== 'winner_snapshot')) throw new Error('Winner snapshot scope mismatch')
        return { environment, lifecycle: getEventState(clock(), event),
          configuration: event, reminders: require('../../config/spooky-reminders.json'), winners: require('../../config/spooky-winners.json'),
          winnerSnapshot: frozen?.receipt ?? null, persistedState: plain(state), badgeService: badges ? 'permanent ownership enabled' : 'not configured',
          badgeCatalog: require('../../config/badges.json'), badgeAccess: require('../../config/badge-access.json') }
      }
      if (input.view === 'player') {
        const participant = await models.Participant.findOne({ where: { ...scope, userId: input.userId }, transaction })
        const account = await User.findByPk(input.userId, { attributes: ['user_id', 'bank', 'fate_points'], transaction })
        const badgeOwnership = badges ? await badges.details(scope.guildId, input.userId, transaction) : null
        if (!participant) return { userId: input.userId, participant: null, wallet: plain(account), inventory: [], effects: [], eligibleCharacters: [], badgeOwnership }
        const inventory = await models.Inventory.findAll({ where: { participantId: participant.id }, order: [['pieceId', 'ASC']], transaction })
        const effects = await models.Effect.findAll({ where: { participantId: participant.id }, order: [['id', 'ASC']], transaction })
        const owned = new Set(inventory.filter(row => row.quantity > 0).map(row => row.pieceId))
        const eligibleCharacters = [...new Set(pieces.map(piece => piece.characterId))]
          .filter(character => pieces.filter(piece => piece.characterId === character).every(piece => owned.has(piece.id)))
        return { participant: plain(participant), wallet: plain(account), inventory: inventory.map(plain), effects: effects.map(plain),
          eligibleCharacters, badgeOwnership, balancesAreStored: true }
      }
      if (input.view === 'transactions') {
        const rows = await models.Ledger.findAll({ where: { ...scope, ...(id && { id }), ...(input.userId && { userId: input.userId }) },
          limit, order: [['id', 'DESC']], transaction })
        const operationIds = [...new Set(rows.map(row => row.operationId))]
        const operations = operationIds.length ? await models.Operation.findAll({ where: { ...scope, operationId: { [Op.in]: operationIds } }, transaction }) : []
        return { ledger: rows.map(plain), operations: operations.map(plain),
          nextBeforeId: rows.length === limit ? rows[rows.length - 1].id : null }
      }
      const deliveries = await models.Delivery.findAll({ where: { ...scope, ...(id && { id }), ...(input.userId && { userId: input.userId }) },
        limit, order: [['id', 'DESC']], transaction })
      // Notifications have operation ownership, not their own event/guild fields.
      // Join the owner before filtering/limiting; never leak another event/guild.
      const notifications = await sequelize.query(`SELECT n.* FROM SpookyNotifications n
        INNER JOIN SpookyOperations o ON o.operationId = n.operationId
        WHERE o.eventId = :eventId AND o.guildId = :guildId
          ${input.userId ? 'AND o.actorId = :userId' : ''}
          ${id ? 'AND n.id < :beforeId' : ''}
        ORDER BY n.id DESC LIMIT :limit`, { replacements: { ...scope, userId: input.userId ?? null,
          beforeId: input.beforeId ?? null, limit }, type: QueryTypes.SELECT, transaction })
      // Parse JSON as the Sequelize model does; SQLite query results return text.
      for (const row of notifications) if (typeof row.payload === 'string') row.payload = JSON.parse(row.payload)
      return { deliveries: deliveries.map(plain), notifications,
        nextDeliveryBeforeId: deliveries.length === limit ? deliveries[deliveries.length - 1].id : null,
        nextNotificationBeforeId: notifications.length === limit ? notifications[notifications.length - 1].id : null,
        policy: 'Inspection only. Sending/uncertain notifications must not be blindly resent.' }
    })
  }
  const { repair } = require('./admin-repairs').createAdminRepairs({ models, economy, event, scope, checkAccess, random, finalizeRepair, badges })
  const { control } = require('./admin-controls').createAdminControls({ sequelize, models, economy, event, scope, checkAccess,
    environment, developmentStorage, delivery, roleIds, badges })
  const { resolve } = require('./admin-resolution').createAdminResolution({ models, economy, event, scope, checkAccess, readMessage, readMember })
  const { recomputeBadges } = require('./admin-badges').createAdminBadges({ models, economy, event, scope, checkAccess, badges, finalizeRepair })
  return { inspect, repair, control, resolve, recomputeBadges }
}

module.exports = { createAdmin }
