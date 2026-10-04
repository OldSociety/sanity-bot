const { config: defaultEvent, getEventState } = require('./config')
const { QueryTypes } = require('sequelize')

// DB-only cleanup/closure shares one root operation. Archive is a durable freeze
// marker, not deletion: inventory, wallet, scores and history remain available.
function createLifecycle({ models, economy, playful, delivery, guildId, event = defaultEvent, winnerSnapshots = null, clock = () => new Date() }) {
  if (typeof guildId !== 'string' || !guildId.trim()) throw new Error('Lifecycle guild ID is required')
  const scope = { eventId: event.eventId, guildId }
  async function maintain(key, { reconcile = true } = {}) {
    if (!event.enabled) return { skipped: 'disabled' }
    if (typeof key !== 'string' || !key.trim()) throw new Error('Maintenance key is required')
    const idle = await economy.read(async transaction => {
      const state = await models.EventState.findOne({ where: scope, transaction })
      if (!state?.archivedAt) return null
      const previous = await models.Operation.findByPk(`worker:${scope.eventId}:${scope.guildId}:maintenance:${key}`, { transaction })
      if (previous) return null // Preserve ordinary receipt replay for existing keys.
      const players = await models.Participant.findAll({ attributes: ['id'], where: scope, transaction })
      if (players.length && await models.Effect.count({ where: { participantId: players.map(row => row.id) }, transaction })) return null
      if (winnerSnapshots && !await models.Operation.findByPk(require('./winner-snapshot').snapshotOperationId(scope.eventId, scope.guildId), { transaction })) return null
      // Reuse and validate the frozen proof; never recompute closed scores.
      const winnerSnapshot = winnerSnapshots ? await winnerSnapshots.freeze({ scope, transaction, now: new Date(event.endsAt) }) : null
      return { phase: 'CLOSED', newlyArchived: false, archivedAt: state.archivedAt, cleared: [], ...(winnerSnapshot && { winnerSnapshot }) }
    })
    // Keep projection/final-award workers running after closure, without
    // writing another maintenance operation for each empty minute.
    if (idle) return { skipped: 'closed_idle', replayed: false, receipt: idle, deliveries: reconcile ? await delivery.reconcile(scope) : [] }
    // Check the clock inside the transaction; a queued pre-close request must
    // close if it actually starts after the boundary. Slot keys may differ, but
    // the archive write itself is idempotent and always audited exactly once.
    const result = await economy.execute({ ...scope, actorId: 'system',
      workerKey: `maintenance:${key}`, operationType: 'event_maintenance' }, async ctx => {
      const phase = getEventState(ctx.now, event)
      if (phase === 'UPCOMING') return { phase, newlyArchived: false, archivedAt: null, cleared: [] }
      const cleanup = await playful.cleanup(ctx)
      const winnerSnapshot = phase === 'CLOSED' && winnerSnapshots ? await winnerSnapshots.freeze(ctx) : null
      let state = await models.EventState.findOne({ where: scope, transaction: ctx.transaction })
      let newlyArchived = false
      if (phase === 'CLOSED' && !state?.archivedAt) {
        if (!state) state = await models.EventState.create({ ...scope, configVersion: event.version }, { transaction: ctx.transaction })
        await state.update({ archivedAt: ctx.now }, { transaction: ctx.transaction })
        await ctx.record({ userId: 'system', resource: 'event_archive', delta: 1, before: 0, after: 1,
          metadata: { endsAt: event.endsAt, archivedAt: ctx.now.toISOString(), preservesInventory: true } })
        newlyArchived = true
      }
      return { phase, newlyArchived, archivedAt: state?.archivedAt ?? null, ...(winnerSnapshot && { winnerSnapshot }), ...cleanup }
    })
    // Replay still reconciles committed intents: a crash after commit or a
    // permission failure must not strand restoration until another command.
    const deliveries = !reconcile || result.receipt.phase === 'UPCOMING' ? [] : await delivery.reconcile(scope)
    return { ...result, deliveries }
  }
  async function beforeCommand(key) {
    if (!event.enabled) return { skipped: 'disabled' }
    // Compare instants, not text: raw Date replacements can use the host's
    // Pacific offset while stored model dates use UTC. No cached effect state.
    const needed = await economy.read(async transaction => {
      const now = clock(), phase = getEventState(now, event)
      if (phase === 'UPCOMING') return false
      const rows = await models.Effect.sequelize.query(`SELECT e.id FROM SpookyEffects e
        JOIN SpookyParticipants p ON p.id = e.participantId
        WHERE p.eventId = :eventId AND p.guildId = :guildId
          ${phase === 'CLOSED' ? '' : 'AND julianday(e.expiresAt) <= julianday(:now)'} LIMIT 1`,
      { replacements: { ...scope, now: now.toISOString() }, type: QueryTypes.SELECT, transaction })
      if (rows.length) return true
      if (phase !== 'CLOSED') return false
      const state = await models.EventState.findOne({ where: scope, transaction })
      return !state?.archivedAt || (winnerSnapshots && !await models.Operation.findByPk(
        require('./winner-snapshot').snapshotOperationId(scope.eventId, scope.guildId), { transaction }))
    })
    // Network projections and scheduled reminders remain in the minute worker;
    // a stale unrelated REST request must never hold up a player command.
    return needed ? maintain(key, { reconcile: false }) : { skipped: 'no_cleanup_due' }
  }
  return { maintain, beforeCommand }
}

// An injected scheduler is testable without a Discord client, global DB or sleep.
// Single-process busy guard complements the durable root-operation replay keys.
function createMaintenanceScheduler({ getService, event = defaultEvent, clock = () => new Date(),
  isReady = () => true, intervalMs = 60000, setTimer = setInterval, clearTimer = clearInterval,
  onError = () => {} }) {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1000) throw new Error('Invalid maintenance interval')
  let timer = null, running = false, stopped = false
  async function tick() {
    if (stopped || !event.enabled || !isReady()) return { skipped: stopped ? 'stopped' : !event.enabled ? 'disabled' : 'not_ready' }
    if (running) return { skipped: 'busy' }
    running = true
    try {
      const now = new Date(clock()).getTime()
      if (!Number.isFinite(now)) throw new Error('Invalid maintenance clock')
      const key = `v${event.version}:slot:${Math.floor(now / intervalMs)}`
      return await getService().maintenance(key)
    } catch (error) {
      onError(error)
      return { failed: true }
    } finally { running = false }
  }
  function start() {
    if (timer !== null || stopped) return Promise.resolve({ skipped: stopped ? 'stopped' : 'already_started' })
    if (!event.enabled) return Promise.resolve({ skipped: 'disabled' })
    timer = setTimer(() => { void tick() }, intervalMs)
    timer.unref?.()
    return tick()
  }
  function stop() {
    stopped = true
    if (timer !== null) clearTimer(timer)
    timer = null
  }
  return { start, stop, tick }
}

module.exports = { createLifecycle, createMaintenanceScheduler }
