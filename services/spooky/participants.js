const { config: defaultConfig, getEventState } = require('./config')

function timestamp(value) {
  if (value === null || value === undefined) throw new Error('Invalid refill timestamp')
  const result = new Date(value).getTime()
  if (!Number.isFinite(result)) throw new Error('Invalid refill timestamp')
  return result
}

// A full balance cannot bank elapsed or partial intervals for use after spending.
function calculateRefill({ candy, refillAnchor, now, event = defaultConfig }) {
  const { capacity, refillAmount, refillIntervalMs } = event.candy
  if (!Number.isSafeInteger(candy) || candy < 0 || candy > capacity) throw new Error('Invalid candy balance')
  const anchor = timestamp(refillAnchor)
  const eligibleNow = Math.min(timestamp(now), timestamp(event.endsAt))
  const start = Math.max(anchor, timestamp(event.startsAt))
  if (eligibleNow <= start) return { candy, delta: 0, refillAnchor: new Date(anchor) }
  const intervals = Math.floor((eligibleNow - start) / refillIntervalMs)
  const after = Math.min(capacity, candy + intervals * refillAmount)
  return {
    candy: after, delta: after - candy,
    refillAnchor: new Date(after === capacity ? eligibleNow : start + intervals * refillIntervalMs),
  }
}

function createParticipants({ models, economy, event = defaultConfig }) {
  async function prepare(ctx, userId, { register = false } = {}) {
    if (ctx.scope.eventId !== event.eventId) throw new Error('Participant event mismatch')
    if (typeof userId !== 'string' || !userId.trim()) throw new Error('Participant userId is required')
    if (!event.enabled) throw new Error('Spooky event is disabled')
    if (getEventState(ctx.now, event) !== 'ACTIVE') throw new Error('Spooky event is not active')
    const state = await models.EventState.findOne({ where: ctx.scope, transaction: ctx.transaction })
    if (state?.archivedAt) throw new Error('Spooky event is archived')
    if (register && state?.actionsPaused) throw new Error('Spooky actions are paused')
    const where = { ...ctx.scope, userId }
    let participant = await models.Participant.findOne({ where, transaction: ctx.transaction })
    let created = false
    if (!participant) {
      created = true
      participant = await models.Participant.create({ ...where, registeredAt: null, candy: event.candy.starting, refillAnchor: ctx.now }, { transaction: ctx.transaction })
      await ctx.record({ userId, resource: 'candy', delta: event.candy.starting, before: 0, after: event.candy.starting, metadata: { reason: 'initial_balance' } })
    }
    const refill = calculateRefill({ candy: participant.candy, refillAnchor: participant.refillAnchor, now: ctx.now, event })
    if (refill.delta) await ctx.record({ userId, resource: 'candy', delta: refill.delta, before: participant.candy, after: refill.candy, metadata: { reason: 'elapsed_refill' } })
    participant.candy = refill.candy
    participant.refillAnchor = refill.refillAnchor
    const newlyRegistered = register && !participant.registeredAt
    if (newlyRegistered) {
      participant.registeredAt = ctx.now
      await ctx.record({ userId, resource: 'registration', delta: 1, before: 0, after: 1 })
    }
    await participant.save({ transaction: ctx.transaction })
    return { participant, created, newlyRegistered: Boolean(newlyRegistered), refilled: refill.delta }
  }

  function execute(input, register) {
    const userId = input.userId ?? input.actorId
    if (register && userId !== input.actorId) throw new Error('Registration must belong to the actor')
    // Include target in replay identity: a key cannot silently be reused for another victim.
    return economy.execute({ ...input, operationType: `${register ? 'register' : 'refill'}:${userId}` }, async ctx => {
      const result = await prepare(ctx, userId, { register })
      return { userId, created: result.created, newlyRegistered: result.newlyRegistered, refilled: result.refilled,
        candy: result.participant.candy, registeredAt: result.participant.registeredAt,
        refillAnchor: result.participant.refillAnchor }
    })
  }
  // Future gameplay calls prepare within its root economy transaction, before spending.
  return { prepare, register: input => execute(input, true), refill: input => execute(input, false) }
}

module.exports = { calculateRefill, createParticipants }
