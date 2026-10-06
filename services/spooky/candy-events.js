const { config: defaultEvent } = require('./config')
const { randomTargets } = require('./theft')
const { calculateRefill } = require('./participants')
function createCandyEvents({ models, participants, effects, delivery, listMembers, event = defaultEvent, random = Math.random }) {
  const combat = require('./combat').createCombat({ models, participants, effects, delivery, event })
  const ordinaryTheft = require('./theft').createTheft({ models, participants, effects, delivery, event, random, listMembers })
  async function registered(ctx, actorId, { funded = false, exclude = [] } = {}) {
    const roster = await listMembers(ctx), rows = await models.Participant.findAll({ where: ctx.scope, transaction: ctx.transaction })
    const byId = new Map(rows.filter(row => row.registeredAt).map(row => [row.userId, row]))
    // Eligibility reads one batch without refilling every player merely because
    // they were considered. Only selected transfers materialize the refill.
    return [...new Map(roster.filter(member => !member.bot && member.userId !== actorId && !exclude.includes(member.userId) && byId.has(member.userId))
      .map(member => [member.userId, { ...member, previewCandy: calculateRefill({ ...byId.get(member.userId).get({ plain: true }), now: ctx.now, event }).candy }])).values()]
      .filter(member => !funded || member.previewCandy > 0)
  }
  async function balance(ctx, userId) { return (await participants.prepare(ctx, userId)).participant.candy }
  function upperHalf(maximum) {
    const maximumAllowed = Math.min(event.candy.eventMaximum, maximum)
    if (maximumAllowed < 3) return maximumAllowed
    const value = random()
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Invalid Candy amount roll')
    const minimum = Math.floor(maximumAllowed / 2) + 1
    return minimum + Math.floor(value * (maximumAllowed - minimum + 1))
  }
  async function fallback(ctx, plan) {
    const result = await ordinaryTheft.handlers.steal_candy(ctx, plan)
    if (!result.stolen && !ctx.shieldHits?.size) {
      const error = new Error('Nobody can receive this trick right now. Nothing was spent.')
      error.code = 'NO_CANDY_TARGET'
      throw error
    }
    return { ...result, fallback: 'ordinary_theft', fallbackFrom: plan.outcome }
  }
  async function target(ctx, plan, predicate = async () => true) {
    const candidates = []
    for (const member of await registered(ctx, plan.actorId, { funded: true })) if (await predicate(member)) candidates.push(member)
    return randomTargets(candidates, 1, random)[0]
  }
  async function theft(ctx, plan, amount) {
    const member = await target(ctx, plan)
    if (!member) return fallback(ctx, plan)
    const requested = upperHalf(typeof amount === 'function' ? amount(await balance(ctx, member.userId)) : amount)
    const stolen = await combat.transfer(ctx, member.userId, plan.actorId, requested, { outcome: plan.outcome })
    return { stolen, victims: [{ userId: member.userId, registered: true }], ...(!stolen ? { noEffect: 'shield_blocks_attack' } : {}) }
  }
  const handlers = {
    candy_raid: (ctx, plan) => theft(ctx, plan, candy => Math.max(1, Math.min(event.candy.eventMaximum, Math.floor(candy / 4)))),
    candy_shakedown: (ctx, plan) => theft(ctx, plan, candy => Math.max(2, Math.min(event.candy.eventMaximum, Math.floor(candy / 10)))),
    candy_ransom: async (ctx, plan) => {
      const room = event.candy.capacity - await balance(ctx, plan.actorId)
      const member = room >= 3 && await target(ctx, plan, async member => member.previewCandy >= 5)
      if (!member) return fallback(ctx, plan)
      const stolen = await combat.transfer(ctx, member.userId, plan.actorId, upperHalf(3), { outcome: plan.outcome })
      const ransomTaken = stolen ? Math.min(event.candy.eventMaximum, stolen + 2) : 0
      return { stolen, ransomTaken, ransomReturned: ransomTaken - stolen, victims: [{ userId: member.userId, registered: true }], ...(!stolen ? { noEffect: 'shield_blocks_attack' } : {}) }
    },
    bag_swap: async (ctx, plan) => {
      const member = await target(ctx, plan)
      if (!member) return fallback(ctx, plan)
      const a = await balance(ctx, plan.actorId), b = await balance(ctx, member.userId)
      const difference = Math.abs(a - b)
      if (!difference) return { swapTargetUserId: member.userId, noEffect: 'equal_bags' }
      const swapped = difference <= event.candy.eventMaximum
      const amount = swapped ? difference : upperHalf(event.candy.eventMaximum)
      const from = a > b ? plan.actorId : member.userId, to = a > b ? member.userId : plan.actorId
      const moved = await combat.transfer(ctx, from, to, amount, { hole: false, outcome: plan.outcome })
      return { swapTargetUserId: member.userId, swapped, redistributed: moved, ...(!moved ? { noEffect: 'shield_blocks_attack' } : {}) }
    },
    reverse_robbery: async (ctx, plan) => {
      const candidates = []
      for (const member of await registered(ctx, plan.actorId)) if (member.previewCandy < event.candy.capacity) candidates.push(member)
      const member = randomTargets(candidates, 1, random)[0]
      if (!member || !await balance(ctx, plan.actorId)) return fallback(ctx, plan)
      const lost = await combat.transfer(ctx, plan.actorId, member.userId, upperHalf(3), { outcome: plan.outcome })
      return { lost, robberyTargetUserId: member.userId, ...(lost ? { failure: 'reverse_robbery' } : { noEffect: 'shield_blocks_attack' }) }
    },
    sticky_fingers: async (ctx, plan) => {
      const first = await target(ctx, plan)
      if (!first) return fallback(ctx, plan)
      let stolen = await combat.transfer(ctx, first.userId, plan.actorId, upperHalf(3), { outcome: plan.outcome })
      const victims = [{ userId: first.userId, registered: true }]
      const roll = random(); if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error('Invalid follow-up roll')
      if (roll < .5) {
        const second = randomTargets(await registered(ctx, plan.actorId, { funded: true, exclude: [first.userId] }), 1, random)[0]
        if (second) { stolen += await combat.transfer(ctx, second.userId, plan.actorId, 1, { outcome: plan.outcome }); victims.push({ userId: second.userId, registered: true }) }
      }
      return { stolen, victims, ...(!stolen ? { noEffect: 'shield_blocks_attack' } : {}) }
    },
    trick_chain: async (ctx, plan) => {
      const pool = await registered(ctx, plan.actorId, { funded: true }), victims = []
      if (!pool.length) return fallback(ctx, plan)
      let stolen = 0
      for (let hop = 0; hop < 3 && pool.length; hop++) {
        const member = randomTargets(pool, 1, random)[0]; pool.splice(pool.indexOf(member), 1)
        stolen += await combat.transfer(ctx, member.userId, plan.actorId, hop ? 1 : 2, { outcome: plan.outcome })
        victims.push({ userId: member.userId, registered: true })
        if (hop === 2) break
        const roll = random(); if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error('Invalid chain roll')
        if (roll >= (hop ? .2 : .4)) break
      }
      return { stolen, victims, ...(!stolen ? { noEffect: 'shield_blocks_attack' } : {}) }
    },
    marked_for_mischief: async (ctx, plan) => {
      const status = await effects.snapshot(ctx)
      const member = await target(ctx, plan, async member => !status.active(member.userId, 'bag_hole'))
      if (!member) return fallback(ctx, plan)
      if (await combat.intercept(ctx, member.userId)) return { holeTargetUserId: member.userId, noEffect: 'shield_blocks_attack' }
      await effects.put(ctx, member.userId, 'bag_hole', { expiresAt: new Date(ctx.now.getTime() + event.combat.holeDurationMs), metadata: { appliedAt: ctx.now.toISOString() } })
      return { holeTargetUserId: member.userId }
    },
  }
  for (const outcome of ['bag_explosion', 'boo']) handlers[outcome] = async (ctx, plan) => {
    const source = await target(ctx, plan)
    if (!source) return fallback(ctx, plan)
    const pool = []
    for (const member of await registered(ctx, plan.actorId, { exclude: [source.userId] })) if (member.previewCandy < event.candy.capacity) pool.push(member)
    const recipients = randomTargets(pool, outcome === 'boo' ? 2 : 4, random).map(member => member.userId)
    if (outcome === 'boo') recipients.unshift(plan.actorId)
    if (!recipients.length) return fallback(ctx, plan)
    let scattered = 0
    for (const id of recipients) scattered += await combat.transfer(ctx, source.userId, id, 1, { outcome })
    return { scattered, explosionTargetUserId: source.userId, ...(!scattered ? { noEffect: 'shield_blocks_attack' } : {}) }
  }
  return { handlers, combat }
}
module.exports = { createCandyEvents }
