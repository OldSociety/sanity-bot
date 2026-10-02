const { config: defaultConfig } = require('./config')

function createProgression({ User, models, event = defaultConfig, isUnwanted }) {
  if (User.sequelize !== models.Participant.sequelize) throw new Error('Fate and seasonal models must share a connection')
  if (typeof isUnwanted !== 'function') throw new Error('Trusted Unwanted eligibility resolver is required')
  async function sweetToothBonus(ctx, userId, crownWon = false) {
    const eligible = crownWon || await isUnwanted(ctx, userId)
    if (typeof eligible !== 'boolean') throw new Error('Invalid Unwanted eligibility')
    if (!eligible) return { fateBonus: 0, fateEligible: false }
    const user = await User.findByPk(userId, { transaction: ctx.transaction })
    if (!user) throw new Error('Eligible fate account does not exist')
    const before = user.bank
    if (!Number.isSafeInteger(before) || before < 0) throw new Error('Invalid fate bank balance')
    const bonus = Math.max(0, Math.min(crownWon ? event.crown.fateBonus : event.fate.sweetToothBonus, event.fate.bankCapacity - before))
    if (bonus) {
      const after = before + bonus
      const [changed] = await User.update({ bank: after }, { where: { user_id: userId, bank: before }, transaction: ctx.transaction })
      if (changed !== 1) throw new Error('Fate bank changed during reward')
      await ctx.record({ userId, resource: 'bank', delta: bonus, before, after, metadata: { reason: 'sweet_tooth_bonus' } })
    }
    // Freeze display balances with the reward; replay must not read a later bank.
    return { fateBonus: bonus, fateEligible: true, bankBefore: before, bank: before + bonus, fatePoints: user.fate_points }
  }
  async function prestige(ctx, plan, result) {
    if (event.prestige?.status !== 'approved') throw new Error('Prestige scoring is provisional')
    const score = event.prestige
    const base = plan.overridden ? score.curseReplacement
      : ['lost_candy', 'caught_stealing'].includes(plan.outcome) ? score.failure
      : result.noEffect ? score.noEffect : score.success
    const bonus = !plan.overridden && !result.noEffect
      ? result.crownWon ? event.crown.prestigeBonus : result.stolen > 0 ? event.prestigeBonuses?.[plan.outcome] || 0 : 0 : 0
    const delta = base + bonus
    if (!Number.isSafeInteger(delta)) throw new Error('Invalid prestige delta')
    const resource = plan.action === 'treat' ? 'treatPrestige' : plan.action === 'trick' ? 'trickPrestige' : null
    if (!resource) throw new Error('Invalid prestige action')
    const participant = await models.Participant.findOne({ where: { ...ctx.scope, userId: plan.actorId }, transaction: ctx.transaction })
    if (!participant?.registeredAt) throw new Error('Prestige requires registration')
    const before = participant[resource], after = before + delta
    if (!Number.isSafeInteger(after)) throw new Error('Prestige overflow')
    await participant.update({ [resource]: after }, { transaction: ctx.transaction })
    await ctx.record({ userId: plan.actorId, resource, delta, before, after,
      metadata: { outcome: plan.outcome, scoringVersion: score.version, participantId: participant.id, ...(bonus && { bonus, base }) } })
    return { delta, score: after, track: plan.action }
  }
  function wrapHandlers(handlers) {
    return Object.fromEntries(Object.entries(handlers).map(([outcome, handler]) => [outcome, async (ctx, plan) => {
      if (ctx.scope.eventId !== event.eventId) throw new Error('Progression event mismatch')
      const result = await handler(ctx, plan)
      const bonus = outcome === 'sweet_tooth' && plan.action === 'treat' && !plan.overridden
        ? await sweetToothBonus(ctx, plan.actorId, result.crownWon === true) : {}
      // Receipt data is for audit/admin consumers; player rendering hides exact weights.
      return { ...result, ...bonus, prestige: await prestige(ctx, plan, result) }
    }]))
  }
  async function leaders(ctx) {
    const participants = await models.Participant.findAll({ where: ctx.scope, transaction: ctx.transaction })
    const result = {}
    for (const [track, resource] of [['treat', 'treatPrestige'], ['trick', 'trickPrestige']]) {
      const entries = await models.Ledger.findAll({ where: { ...ctx.scope, resource }, transaction: ctx.transaction })
      const activeIds = new Set(entries.map(entry => entry.userId))
      const eligible = participants.filter(player => player.registeredAt && activeIds.has(player.userId))
      const score = eligible.length ? Math.max(...eligible.map(player => player[resource])) : null
      result[track] = { score, userIds: eligible.filter(player => player[resource] === score).map(player => player.userId).sort() }
    }
    return result
  }
  return { sweetToothBonus, prestige, wrapHandlers, leaders }
}

module.exports = { createProgression }
