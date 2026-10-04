const { config: defaultConfig, getEventState } = require('./config')

const types = new Set(['curse', 'theft_protection', 'reversed_nickname', 'bag_hole'])
function createEffects({ models, participants, event = defaultConfig }) {
  async function active(ctx, userId, effectType) {
    if (!types.has(effectType)) throw new Error('Unknown spooky effect')
    if (!event.enabled || ctx.scope.eventId !== event.eventId || getEventState(ctx.now, event) !== 'ACTIVE') return null
    const participant = await models.Participant.findOne({ where: { ...ctx.scope, userId }, transaction: ctx.transaction })
    if (!participant) return null
    const state = await models.EventState.findOne({ where: ctx.scope, transaction: ctx.transaction })
    if (state?.archivedAt) return null
    const effect = await models.Effect.findOne({ where: { participantId: participant.id, effectType }, transaction: ctx.transaction })
    return effect && new Date(effect.expiresAt) > ctx.now ? effect : null
  }
  async function put(ctx, userId, effectType, { expiresAt, metadata = {} }) {
    if (!types.has(effectType)) throw new Error('Unknown spooky effect')
    const expiry = new Date(Math.min(new Date(expiresAt).getTime(), Date.parse(event.endsAt)))
    if (!Number.isFinite(expiry.getTime()) || expiry <= ctx.now) throw new Error('Invalid effect expiry')
    const { participant } = await participants.prepare(ctx, userId)
    const state = await models.EventState.findOne({ where: ctx.scope, transaction: ctx.transaction })
    if (state?.actionsPaused) throw new Error('Spooky actions are paused')
    const where = { participantId: participant.id, effectType }
    if (effectType === 'curse' || effectType === 'theft_protection') {
      const other = await models.Effect.findOne({ where: { participantId: participant.id,
        effectType: effectType === 'curse' ? 'theft_protection' : 'curse' }, transaction: ctx.transaction })
      if (other && new Date(other.expiresAt) > ctx.now) throw new Error('Curse and protection are mutually exclusive')
    }
    const existing = await models.Effect.findOne({ where, transaction: ctx.transaction })
    // Reapplications update one durable row; callers decide renewal policy.
    if (existing) await existing.update({ expiresAt: expiry, metadata }, { transaction: ctx.transaction })
    else await models.Effect.create({ ...where, expiresAt: expiry, metadata }, { transaction: ctx.transaction })
    await ctx.record({ userId, resource: `effect:${effectType}`, delta: existing ? 0 : 1,
      before: existing ? 1 : 0, after: 1, metadata: { expiresAt: expiry.toISOString(), ...metadata } })
    return { userId, effectType, expiresAt: expiry.toISOString(), metadata }
  }
  async function remove(ctx, userId, effectType) {
    if (!types.has(effectType)) throw new Error('Unknown spooky effect')
    if (ctx.scope.eventId !== event.eventId) throw new Error('Effect event mismatch')
    const participant = await models.Participant.findOne({ where: { ...ctx.scope, userId }, transaction: ctx.transaction })
    if (!participant) return null
    const effect = await models.Effect.findOne({ where: { participantId: participant.id, effectType }, transaction: ctx.transaction })
    if (!effect) return null
    const receipt = { userId, effectType, metadata: effect.metadata }
    await effect.destroy({ transaction: ctx.transaction })
    await ctx.record({ userId, resource: `effect:${effectType}`, delta: -1, before: 1, after: 0 })
    return receipt
  }
  return { active, put, remove, getCurseState: async (ctx, userId) => Boolean(await active(ctx, userId, 'curse')) }
}

module.exports = { createEffects }
