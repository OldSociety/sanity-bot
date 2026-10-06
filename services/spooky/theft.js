const { config: defaultConfig } = require('./config')
const { calculateRefill } = require('./participants')
const { Op } = require('sequelize')

function randomTargets(candidates, count, random = Math.random) {
  const pool = [...candidates], chosen = []
  while (pool.length && chosen.length < count) {
    const value = random()
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Random value must be in [0, 1)')
    chosen.push(pool.splice(Math.floor(value * pool.length), 1)[0])
  }
  return chosen
}
// Names are attribution text only. The Discord adapter must also disable mentions.
function attribution(name) {
  return String(name || 'a server member').replace(/@/g, '＠').replace(/[<>`\r\n]/g, '').slice(0, 80)
}

function createTheft({ models, participants, collection, effects, delivery, listMembers, event = defaultConfig, random = Math.random }) {
  const combat = require('./combat').createCombat({ models, participants, effects, delivery, event })
  if (typeof listMembers !== 'function') throw new Error('Trusted membership snapshot is required')
  async function candidates(ctx, actorId, resource) {
    if (!['candy', 'eyes', 'eye_gift'].includes(resource)) throw new Error('Unsupported theft resource')
    // Resolve membership outside the root transaction in the future Discord adapter;
    // this injected callback returns a trusted snapshot, not a network request.
    const members = await listMembers(ctx)
    if (!Array.isArray(members)) throw new Error('Invalid membership snapshot')
    const unique = new Map()
    for (const member of members) {
      if (typeof member.userId !== 'string' || !member.userId.trim() || typeof member.bot !== 'boolean') throw new Error('Invalid member identity')
      if (member.userId !== actorId && !member.bot && !unique.has(member.userId)) unique.set(member.userId, member)
    }
    const rows = await models.Participant.findAll({ where: ctx.scope, transaction: ctx.transaction })
    const byUser = new Map(rows.map(row => [row.userId, row]))
    return [...unique.values()].filter(member => {
      const row = byUser.get(member.userId)
      if (resource === 'eye_gift') return Boolean(row?.registeredAt && row.eyes < event.eyes.quarterCost - 1)
      if (resource === 'eyes') return Boolean(row?.registeredAt && row.eyes >= 1)
      // Preview lazily: selecting a victim must not enroll/materialize the guild.
      return (row ? calculateRefill({ candy: row.candy, refillAnchor: row.refillAnchor, now: ctx.now, event }).candy : event.candy.starting) >= 1
    })
  }
  async function actor(ctx, actorId) {
    const { participant } = await participants.prepare(ctx, actorId)
    if (!participant.registeredAt) throw new Error('Theft requires registration')
    const state = await models.EventState.findOne({ where: ctx.scope, transaction: ctx.transaction })
    if (state?.actionsPaused) throw new Error('Spooky actions are paused')
    return participant
  }
  async function candy(ctx, plan, limit) {
    const caller = await actor(ctx, plan.actorId)
    const room = event.candy.capacity - caller.candy
    if (room <= 0) return { stolen: 0, victims: [], noEffect: 'candy_capacity' }
    const targets = randomTargets(await candidates(ctx, plan.actorId, 'candy'), Math.min(limit, room), random)
    if (!targets.length) return { stolen: 0, victims: [], noEffect: 'no_funded_candy_target' }
    const victims = []
    for (const member of targets) {
      const { participant } = await participants.prepare(ctx, member.userId)
      const stolen = await combat.transfer(ctx, member.userId, plan.actorId, 1, { outcome: plan.outcome })
      victims.push({ userId: member.userId, candy: stolen, name: attribution(member.displayName), registered: Boolean(participant.registeredAt) })
    }
    const stolen = victims.reduce((sum, victim) => sum + victim.candy, 0)
    return combat.receipt(ctx, { stolen, victims, ...(!stolen ? { noEffect: 'shield_blocks_attack' } : {}) })
  }
  async function bonusCandy(ctx, userId, requested, reason) {
    const { participant } = await participants.prepare(ctx, userId)
    const amount = Math.max(0, Math.min(requested, event.candy.capacity - participant.candy))
    if (amount) await ctx.changeBalance(userId, 'candy', amount, { metadata: { reason } })
    return amount
  }
  async function eyes(ctx, plan) {
    await actor(ctx, plan.actorId)
    const pool = await candidates(ctx, plan.actorId, 'eyes')
    const rows = pool.length ? await models.Participant.findAll({ where: { ...ctx.scope, userId: pool.map(member => member.userId) }, transaction: ctx.transaction }) : []
    // Existing negative transfer entries identify who lost an Eye and to whom.
    // Query only this pool/recent window; no full-ledger scan or network call.
    const recent = pool.length ? await models.Ledger.findAll({ where: { ...ctx.scope, resource: 'eyes',
      userId: pool.map(member => member.userId), delta: { [Op.lt]: 0 }, 'metadata.reason': 'eye_theft',
      timestamp: { [Op.gt]: new Date(+ctx.now - event.eyes.theftProtectionMs) } },
      attributes: ['userId', 'timestamp'], transaction: ctx.transaction }) : []
    const available = new Set(rows.filter(row => row.eyes > 1 && !recent.some(loss => loss.userId === row.userId && +new Date(loss.timestamp) >= +new Date(row.registeredAt))).map(row => row.userId))
    const stealable = pool.filter(member => available.has(member.userId))
    const [target] = randomTargets(stealable.length ? stealable : pool, 1, random)
    if (target && !available.has(target.userId)) return {
      stolen: 0, found: 0, watchedUserId: target.userId,
      candyReward: await bonusCandy(ctx, plan.actorId, event.eyes.watchedCandyReward, 'eyes_watching'),
    }
    if (target && await combat.intercept(ctx, target.userId)) return combat.receipt(ctx, { stolen: 0, found: 0, victims: [{ userId: target.userId, registered: true }], noEffect: 'shield_blocks_attack' })
    const reward = await collection.creditEyes(ctx, plan.actorId, 1, {
      fromUserId: target?.userId ?? null, metadata: { outcome: plan.outcome, reason: target ? 'eye_theft' : 'eye_find' },
    })
    return { ...reward, stolen: target ? 1 : 0, found: target ? 0 : 1,
      victims: target ? [{ userId: target.userId, name: attribution(target.displayName), registered: true }] : [] }
  }
  async function eyeCandy(ctx, plan) {
    await actor(ctx, plan.actorId)
    const pool = await candidates(ctx, plan.actorId, 'eye_gift')
    const rows = pool.length ? await models.Participant.findAll({ where: { ...ctx.scope, userId: pool.map(member => member.userId) }, transaction: ctx.transaction }) : []
    const empty = new Set(rows.filter(row => row.eyes === 0).map(row => row.userId))
    const preferred = pool.filter(member => empty.has(member.userId))
    const [recipient] = randomTargets(preferred.length ? preferred : pool, 1, random)
    const candyReward = await bonusCandy(ctx, plan.actorId, event.eyes.giftCandyReward, 'eye_candy')
    // Solo play never turns this social gift into another personal Eye.
    if (!recipient) return { candyReward, eyeGiftUnavailable: true }
    const reward = await collection.creditEyes(ctx, recipient.userId, 1, { metadata: { outcome: plan.outcome, reason: 'eye_candy', giverUserId: plan.actorId } })
    const receiver = await models.Participant.findOne({ where: { ...ctx.scope, userId: recipient.userId }, transaction: ctx.transaction })
    return { ...reward, candyReward, giftedEyes: 1, eyeRecipientId: recipient.userId, collectionUserId: recipient.userId,
      collectionBalance: { candy: receiver.candy, eyes: receiver.eyes },
      newlyCompletedCharacters: reward.awards.filter(award => !award.duplicate && award.ownedPositions.length === 4).map(award => award.characterId) }
  }
  return { candidates, handlers: {
    steal_candy: (ctx, plan) => candy(ctx, plan, 1),
    great_heist: (ctx, plan) => candy(ctx, plan, 3),
    steal_or_find_eye: eyes,
    eye_candy: eyeCandy,
  } }
}

module.exports = { createTheft, randomTargets }
