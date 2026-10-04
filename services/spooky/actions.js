const { config: defaultConfig } = require('./config')
const { Op } = require('sequelize')
const nonCandyOutcomes = new Set(['reverse_nickname', 'curse_target', 'curse_backfire', 'temporary_immunity', 'break_curse', 'sweet_tooth', 'steal_crown', 'find_eye', 'steal_or_find_eye', 'curse_spread'])

function roll(random) {
  const value = random()
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Random value must be in [0, 1)')
  return value
}
function selectAction({ action, cursed = false, previousOutcome = null, crownHolderId = null, actorId = null, event = defaultConfig, random = Math.random }) {
  if (!['trick', 'treat'].includes(action)) throw new Error('Unknown spooky action')
  if (typeof cursed !== 'boolean') throw new Error('Curse state must be boolean')
  if (cursed && roll(random) < event.curse.overridePercent / 100) {
    return { action, overridden: true, outcome: action === 'trick' ? 'curse_distribute_two'
      : roll(random) < event.curse.treatSpreadPercent / 100 ? 'curse_spread' : 'curse_distribute_three' }
  }
  // Soften only the immediately repeated spell family. Older configurations
  // retain their historical broad buffer; committed outcomes are never rerolled.
  const families = [['reverse_nickname'], ['curse_target', 'curse_backfire', 'curse_spread'], ['temporary_immunity'], ['break_curse'], ['marked_for_mischief']]
  const family = families.find(ids => ids.includes(previousOutcome)) || []
  const targeted = event.actionBuffer.mode === 'same-spell'
  const buffered = targeted ? family.length > 0 : nonCandyOutcomes.has(previousOutcome)
  const weights = event[`${action}Outcomes`].map(outcome => {
    const id = outcome.id === 'sweet_tooth' && crownHolderId ? 'standard_gift'
      : outcome.id === 'steal_crown' && (!crownHolderId || crownHolderId === actorId) ? (targeted ? 'steal_candy' : 'caught_stealing') : outcome.id
    return { id, original: outcome.percent, weight: outcome.percent * (buffered && (targeted ? family.includes(id) : nonCandyOutcomes.has(id)) ? event.actionBuffer.specialWeightPercent / 100 : 1) }
  })
  if (targeted && buffered) {
    const candy = new Set(action === 'treat' ? ['standard_gift', 'double_gift'] : ['steal_candy', 'great_heist', 'candy_raid', 'bag_explosion', 'sticky_fingers', 'candy_ransom', 'boo', 'candy_shakedown', 'trick_chain'])
    const freed = weights.reduce((sum, row) => sum + row.original - row.weight, 0)
    const pool = weights.filter(row => candy.has(row.id)).reduce((sum, row) => sum + row.weight, 0)
    if (freed && !pool) throw new Error('Repeated spell has no candy redistribution pool')
    for (const row of weights) if (candy.has(row.id)) row.weight += freed * row.weight / pool
  }
  const value = roll(random) * weights.reduce((sum, outcome) => sum + outcome.weight, 0)
  let boundary = 0
  for (const outcome of weights) {
    boundary += outcome.weight
    if (value < boundary) return { action, overridden: false, outcome: outcome.id }
  }
  throw new Error('Invalid spooky outcome table')
}

function createActions({ models, economy, participants, handlers, getCurseState, event = defaultConfig,
  random = Math.random, prepareChoice = null, getCrownHolder = async () => null, clock = () => new Date(), finalizeReceipt = async (_ctx, receipt) => receipt }) {
  if (typeof getCurseState !== 'function') throw new Error('Trusted curse state resolver is required')
  async function previousAction(ctx, actorId, registeredAt) {
    return models.Operation.findOne({ where: { ...ctx.scope, actorId,
      operationType: { [Op.in]: ['spooky_trick', 'spooky_treat'] }, completedAt: { [Op.gte]: registeredAt } },
      order: [['completedAt', 'DESC'], ['operationId', 'DESC']], transaction: ctx.transaction })
  }
  async function execute(input) {
    if (!['trick', 'treat'].includes(input.action)) throw new Error('Unknown spooky action')
    let planned = null
    if (prepareChoice) {
      // Read/roll before the private choice, never hold SQLite's writer lock
      // while a human or Discord responds. Nothing is charged until commit.
      planned = await economy.read(async transaction => {
        if (await models.Operation.findByPk(`discord:${input.interactionId}`, { transaction })) return null
        const ctx = { transaction, scope: { eventId: input.eventId, guildId: input.guildId }, now: clock() }
        if (!event.enabled || require('./config').getEventState(ctx.now, event) !== 'ACTIVE') throw new Error('Spooky is not active')
        const participant = await models.Participant.findOne({ where: { ...ctx.scope, userId: input.actorId }, transaction })
        const state = await models.EventState.findOne({ where: ctx.scope, transaction })
        if (!participant?.registeredAt) throw new Error('Spooky action requires registration')
        if (state?.actionsPaused || state?.archivedAt) throw new Error('Spooky actions are paused or closed')
        const candy = require('./participants').calculateRefill({ ...participant.get({ plain: true }), now: ctx.now, event }).candy
        if (candy < event.candy.actionCost) throw new Error('Insufficient candy')
        const cursed = await getCurseState(ctx, input.actorId)
        const previous = await previousAction(ctx, input.actorId, participant.registeredAt)
        const crownHolderId = await getCrownHolder(ctx)
        const selected = selectAction({ action: input.action, cursed, crownHolderId, actorId: input.actorId, previousOutcome: previous?.receipt?.outcome, event, random })
        return { selected, cursed, crownHolderId, previousId: previous?.operationId || null, balances: { candy, eyes: participant.eyes }, candidates: await prepareChoice.candidates(ctx, { ...selected, actorId: input.actorId }) }
      })
      if (planned?.candidates.length) planned.selected.targetUserId = await prepareChoice.choose(planned.selected, planned.candidates, planned.balances)
    }
    return economy.execute({ ...input, operationType: `spooky_${input.action}` }, async ctx => {
      const { participant } = await participants.prepare(ctx, input.actorId)
      if (!participant.registeredAt) throw new Error('Spooky action requires registration')
      const state = await models.EventState.findOne({ where: ctx.scope, transaction: ctx.transaction })
      if (state?.actionsPaused) throw new Error('Spooky actions are paused')
      const baseCost = event.candy.actionCost
      if (participant.candy < baseCost) throw new Error('Insufficient candy')
      const cursed = await getCurseState(ctx, input.actorId)
      if (planned && planned.cursed !== cursed) throw new Error('Your curse changed during the choice. Nothing was spent; try again.')
      const previous = await previousAction(ctx, input.actorId, participant.registeredAt)
      if (planned && planned.previousId !== (previous?.operationId || null)) throw new Error('Another action finished during the choice. Nothing was spent; try again.')
      const crownHolderId = await getCrownHolder(ctx)
      if (planned && ['sweet_tooth', 'steal_crown'].includes(planned.selected.outcome) && planned.crownHolderId !== crownHolderId) throw new Error('The Crown changed hands. Nothing was spent; try again.')
      const selected = planned?.selected || selectAction({ action: input.action, cursed, crownHolderId, actorId: input.actorId, previousOutcome: previous?.receipt?.outcome, event, random })
      const handler = handlers?.[selected.outcome]
      if (typeof handler !== 'function') throw new Error(`Spooky outcome is not implemented: ${selected.outcome}`)
      const distributionLimit = selected.outcome === 'curse_distribute_three' ? 3 : selected.outcome === 'curse_distribute_two' ? 2 : 0
      await ctx.changeBalance(input.actorId, 'candy', -baseCost, { metadata: { reason: 'action_cost', outcome: selected.outcome } })
      // Handlers are database-only and share this root transaction. They must
      // validate targets before writes or return an explicit paid no-effect result.
      // Exceptions refund everything by rollback; never reroll an unavailable effect.
      const rawResult = await handler(ctx, { ...selected, actorId: input.actorId,
        availableCandy: participant.candy - baseCost, distributionLimit })
      if (!rawResult || typeof rawResult !== 'object' || Array.isArray(rawResult)) throw new Error('Outcome handler must return a receipt')
      const result = require('./combat').combatReceipt(ctx, rawResult)
      const delivered = result.deliveredCandy ?? 0
      if (!Number.isSafeInteger(delivered) || delivered < 0 || (distributionLimit && delivered > distributionLimit)) throw new Error('Invalid delivered candy count')
      // Fetch fresh state: handlers may have credited the actor (e.g. theft).
      const after = await models.Participant.findByPk(participant.id, { transaction: ctx.transaction })
      after.lastActive = ctx.now
      await after.save({ transaction: ctx.transaction })
      return finalizeReceipt(ctx, { ...selected, candySpent: baseCost, candy: after.candy, eyes: after.eyes, result })
    })
  }
  return { execute }
}

module.exports = { selectAction, createActions }
