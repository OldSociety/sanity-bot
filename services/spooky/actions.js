const { config: defaultConfig } = require('./config')

function roll(random) {
  const value = random()
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Random value must be in [0, 1)')
  return value
}
function selectAction({ action, cursed = false, event = defaultConfig, random = Math.random }) {
  if (!['trick', 'treat'].includes(action)) throw new Error('Unknown spooky action')
  if (typeof cursed !== 'boolean') throw new Error('Curse state must be boolean')
  if (cursed && roll(random) < event.curse.overridePercent / 100) {
    return { action, overridden: true, outcome: action === 'trick' ? 'curse_distribute_two'
      : roll(random) < event.curse.treatSpreadPercent / 100 ? 'curse_spread' : 'curse_distribute_three' }
  }
  const value = roll(random) * 100
  let boundary = 0
  for (const outcome of event[`${action}Outcomes`]) {
    boundary += outcome.percent
    if (value < boundary) return { action, overridden: false, outcome: outcome.id }
  }
  throw new Error('Invalid spooky outcome table')
}

function createActions({ models, economy, participants, handlers, getCurseState, event = defaultConfig,
  random = Math.random, finalizeReceipt = async (_ctx, receipt) => receipt }) {
  if (typeof getCurseState !== 'function') throw new Error('Trusted curse state resolver is required')
  async function execute(input) {
    if (!['trick', 'treat'].includes(input.action)) throw new Error('Unknown spooky action')
    return economy.execute({ ...input, operationType: `spooky_${input.action}` }, async ctx => {
      const { participant } = await participants.prepare(ctx, input.actorId)
      if (!participant.registeredAt) throw new Error('Spooky action requires registration')
      const state = await models.EventState.findOne({ where: ctx.scope, transaction: ctx.transaction })
      if (state?.actionsPaused) throw new Error('Spooky actions are paused')
      const baseCost = event.candy.actionCost
      if (participant.candy < baseCost) throw new Error('Insufficient candy')
      const selected = selectAction({ action: input.action, cursed: await getCurseState(ctx, input.actorId), event, random })
      const handler = handlers?.[selected.outcome]
      if (typeof handler !== 'function') throw new Error(`Spooky outcome is not implemented: ${selected.outcome}`)
      const distributionLimit = selected.outcome === 'curse_distribute_three' ? 3 : selected.outcome === 'curse_distribute_two' ? 2 : 0
      await ctx.changeBalance(input.actorId, 'candy', -baseCost, { metadata: { reason: 'action_cost', outcome: selected.outcome } })
      // Handlers are database-only and share this root transaction. They must
      // validate targets before writes or return an explicit paid no-effect result.
      // Exceptions refund everything by rollback; never reroll an unavailable effect.
      const result = await handler(ctx, { ...selected, actorId: input.actorId,
        availableCandy: participant.candy - baseCost, distributionLimit })
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Outcome handler must return a receipt')
      const delivered = result.deliveredCandy ?? 0
      if (!Number.isSafeInteger(delivered) || delivered < 0 || (distributionLimit && delivered > distributionLimit)) throw new Error('Invalid delivered candy count')
      // Fetch fresh state: handlers may have credited the actor (e.g. theft).
      const after = await models.Participant.findByPk(participant.id, { transaction: ctx.transaction })
      after.lastActive = ctx.now
      await after.save({ transaction: ctx.transaction })
      return finalizeReceipt(ctx, { ...selected, candySpent: baseCost, candy: after.candy, result })
    })
  }
  return { execute }
}

module.exports = { selectAction, createActions }
