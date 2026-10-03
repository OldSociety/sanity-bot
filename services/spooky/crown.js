const { Op } = require('sequelize')

// One authoritative holder per event/guild; the existing ledger is the durable
// state. Role writes are desired-state projections performed only after commit.
function createCrown({ models, delivery, roleId }) {
  async function state(ctx, members = []) {
    const row = await models.Ledger.findOne({ where: { ...ctx.scope, resource: 'crown_holder' },
      order: [['id', 'DESC']], transaction: ctx.transaction })
    if (row) {
      if (row.metadata?.roleId !== roleId || !(row.metadata.holderId === null || typeof row.metadata.holderId === 'string')) throw new Error('Invalid Crown ownership evidence')
      return row.metadata.holderId
    }
    return members.filter(member => member.roleIds?.includes(roleId)).map(member => member.userId).sort()[0] || null
  }
  async function bootstrap(ctx, actualHolderIds) {
    if (await models.Ledger.findOne({ where: { ...ctx.scope, resource: 'crown_holder' }, transaction: ctx.transaction })) return { initialized: false }
    const intents = await models.Delivery.findAll({ where: { ...ctx.scope, kind: 'sweet_tooth_role' }, transaction: ctx.transaction })
    const released = new Set(intents.filter(row => row.status === 'pending' && row.payload?.present === false).map(row => row.userId))
    const candidates = [...new Set([...actualHolderIds.filter(id => !released.has(id)), ...intents.filter(row => row.status === 'pending' && row.payload?.present).map(row => row.userId)])]
    const awarded = candidates.length ? await models.Ledger.findOne({ where: { ...ctx.scope, resource: 'crown_award', userId: { [Op.in]: candidates } },
      order: [['id', 'DESC']], transaction: ctx.transaction }) : null
    const holderId = awarded?.userId || candidates.sort()[0] || null
    await ctx.record({ userId: holderId || 'system', resource: 'crown_holder', delta: 0,
      metadata: { holderId, roleId, reason: 'exclusive_bootstrap' } })
    for (const userId of new Set([...actualHolderIds, ...candidates, ...intents.map(row => row.userId)])) await delivery.enqueue(ctx, userId, 'sweet_tooth_role', {
      roleId, present: userId === holderId, ...(userId === holderId ? { exclusive: true } : {}) })
    return { initialized: true, holderId }
  }
  async function capture(ctx, actorId, previousHolderId) {
    if (actorId === previousHolderId) throw new Error('You already wear the Sweet Tooth Crown. Nothing was spent.')
    const saved = await models.Ledger.findOne({ where: { ...ctx.scope, resource: 'crown_holder' }, order: [['id', 'DESC']], transaction: ctx.transaction })
    if (saved && await state(ctx) !== previousHolderId) throw new Error('The Crown changed hands. Nothing was spent; try again.')
    if (previousHolderId) await delivery.enqueue(ctx, previousHolderId, 'sweet_tooth_role', { roleId, present: false })
    await ctx.record({ userId: actorId, resource: 'crown_holder', delta: 0,
      metadata: { holderId: actorId, previousHolderId, roleId, reason: previousHolderId ? 'crown_stolen' : 'crown_found' } })
    await delivery.enqueue(ctx, actorId, 'sweet_tooth_role', { roleId, present: true, exclusive: true })
  }
  async function release(ctx, userId) {
    if (await state(ctx) !== userId) return
    await ctx.record({ userId, resource: 'crown_holder', delta: 0, metadata: { holderId: null, roleId, reason: 'testing_reset' } })
  }
  return { state, bootstrap, capture, release }
}
module.exports = { createCrown }
