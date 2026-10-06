const { Transaction } = require('sequelize')

// A Sequelize SQLite instance uses one connection for :memory:. Serialize its
// operations to avoid overlapping BEGIN calls. IMMEDIATE transactions also obtain
// SQLite's writer lock before reads on disk-backed/shared database connections.
const queues = new WeakMap()
function serialize(sequelize, work) {
  const previous = queues.get(sequelize) || Promise.resolve()
  const current = previous.catch(() => {}).then(work)
  queues.set(sequelize, current.then(() => {}, () => {}))
  return current
}
function nonempty(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
}
function createEconomy({ sequelize, models, configVersion = 1, clock = () => new Date() }) {
  if (!Number.isSafeInteger(configVersion) || configVersion < 1) throw new Error('Invalid config version')

  async function execute(input, mutate) {
    for (const key of ['eventId', 'guildId', 'actorId', 'operationType']) nonempty(input[key], key)
    if ((input.interactionId === undefined) === (input.workerKey === undefined)) throw new Error('Supply exactly one interactionId or workerKey')
    const key = input.interactionId ?? input.workerKey
    nonempty(key, 'Operation key')
    const operationId = input.interactionId ? `discord:${key}` : `worker:${input.eventId}:${input.guildId}:${key}`
    return serialize(sequelize, () => sequelize.transaction({ type: Transaction.TYPES.IMMEDIATE }, async transaction => {
      const prior = await models.Operation.findByPk(operationId, { transaction })
      if (prior) {
        for (const field of ['eventId', 'guildId', 'actorId', 'operationType']) {
          if (prior[field] !== input[field]) throw new Error('Operation replay identity mismatch')
        }
        if (!prior.completedAt) throw new Error('Operation has no committed receipt')
        return { replayed: true, operationId, receipt: prior.receipt }
      }
      const now = clock()
      const operation = await models.Operation.create({
        operationId, interactionId: input.interactionId || null, eventId: input.eventId, guildId: input.guildId,
        actorId: input.actorId, operationType: input.operationType, createdAt: now,
      }, { transaction })
      const scope = { eventId: input.eventId, guildId: input.guildId }
      async function record({ userId, resource, delta, before = null, after = null, relatedUserId = null, metadata = {} }) {
        nonempty(userId, 'Ledger userId'); nonempty(resource, 'Ledger resource')
        if (!Number.isSafeInteger(delta) || (before !== null && !Number.isSafeInteger(before)) || (after !== null && !Number.isSafeInteger(after))) throw new Error('Ledger values must be safe integers')
        if (before !== null && after !== null && after - before !== delta) throw new Error('Ledger delta does not match balances')
        return models.Ledger.create({
          operationId, interactionId: input.interactionId || null, ...scope, userId,
          actorId: input.actorId, operationType: input.operationType, resource, delta, before, after,
          relatedUserId, metadata, configVersion, timestamp: now,
        }, { transaction })
      }
      async function changeBalance(userId, resource, delta, details = {}) {
        if (!['candy', 'eyes'].includes(resource)) throw new Error('Unsupported seasonal balance resource')
        if (!Number.isSafeInteger(delta)) throw new Error('Balance delta must be a safe integer')
        const participant = await models.Participant.findOne({ where: { ...scope, userId }, transaction })
        if (!participant) throw new Error('Participant balance has not been materialized')
        const before = participant[resource], after = before + delta
        if (!Number.isSafeInteger(after) || after < 0 || (resource === 'candy' && after > 80)) throw new Error('Balance outside allowed bounds')
        participant[resource] = after
        await participant.save({ transaction })
        await record({ ...details, userId, resource, delta, before, after })
        return participant
      }
      async function transfer(fromUserId, toUserId, resource, amount, metadata = {}) {
        if (fromUserId === toUserId) throw new Error('Cannot transfer to self')
        if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Transfer amount must be a positive integer')
        if (resource === 'eyes') {
          const source = await models.Participant.findOne({ where: { ...scope, userId: fromUserId }, transaction })
          if (!source || source.eyes - amount < 1) throw new Error('The last Evil Eye cannot be stolen')
        }
        await changeBalance(fromUserId, resource, -amount, { relatedUserId: toUserId, metadata })
        await changeBalance(toUserId, resource, amount, { relatedUserId: fromUserId, metadata })
      }
      // Callbacks must perform database work only and use this transaction for
      // every write. Discord delivery happens after a committed receipt returns.
      const receipt = await mutate({ transaction, scope, operationId, now, record, changeBalance, transfer })
      if (receipt === undefined) throw new Error('Operation must return a JSON receipt')
      const encoded = JSON.stringify(receipt)
      if (encoded === undefined) throw new Error('Operation must return a JSON receipt')
      const savedReceipt = JSON.parse(encoded)
      await operation.update({ receipt: savedReceipt, completedAt: now }, { transaction })
      return { replayed: false, operationId, receipt: savedReceipt }
    }))
  }
  // Administrator inspection shares the same connection queue so a read-only
  // snapshot cannot overlap a root SQLite transaction or observe half a repair.
  // It creates no operation, receipt, refill, or ledger rows.
  const read = work => serialize(sequelize, () => sequelize.transaction(
    { type: Transaction.TYPES.DEFERRED }, transaction => work(transaction),
  ))
  return { execute, read }
}

module.exports = { createEconomy, serialize }
