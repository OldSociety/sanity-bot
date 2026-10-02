const { calculateRefill } = require('./participants')
const { getEventState } = require('./config')
const COOLDOWN = 48 * 3600000
function eligible(player, now, event) {
  if (!player?.registeredAt || !event.enabled || getEventState(now, event) !== 'ACTIVE') return false
  const candy = calculateRefill({ candy: player.candy, refillAnchor: player.refillAnchor, now, event }).candy
  if (candy === event.candy.capacity) return 'bucket'
  const elapsed = player.lastActive ? new Date(now) - new Date(player.lastActive) : Infinity
  return elapsed >= 3600000 && elapsed <= 24 * 3600000 && candy >= 50 ? 'stash' : false
}
async function claimNudge({ economy, models, input, event, now }) {
  const scope = { eventId: input.eventId, guildId: input.guildId, userId: input.actorId }
  const player = await economy.read(transaction => models.Participant.findOne({ where: scope, transaction }))
  if (!eligible(player, now, event)) return false
  const result = await economy.execute({ ...input, interactionId: undefined,
    workerKey: `private-nudge:${input.actorId}:${Math.floor(new Date(now).getTime() / 3600000)}`,
    operationType: 'private_candy_nudge' }, async ctx => {
    const current = await models.Participant.findOne({ where: scope, transaction: ctx.transaction })
    const state = await models.EventState.findOne({ where: ctx.scope, transaction: ctx.transaction })
    const kind = eligible(current, ctx.now, event)
    if (state?.actionsPaused || state?.archivedAt || !kind) return { show: false }
    const resource = `private_candy_nudge:${kind}`
    const previous = await models.Ledger.findOne({ where: { ...scope, resource },
      order: [['id', 'DESC']], transaction: ctx.transaction })
    const cooldown = kind === 'bucket' ? 7 * 86400000 : COOLDOWN
    const legacy = kind === 'bucket' ? await models.Operation.findOne({ where: { ...ctx.scope, actorId: input.actorId, operationType: 'candy_bucket_reminder' }, order: [['createdAt', 'DESC']], transaction: ctx.transaction }) : null
    if ((previous && ctx.now - new Date(previous.timestamp) < cooldown) || (legacy && ctx.now - new Date(legacy.createdAt) < cooldown)) return { show: false }
    await ctx.record({ userId: input.actorId, resource, delta: 0 })
    return { show: kind }
  })
  // A failed ephemeral delivery consumes the cooldown; replay cannot nag again.
  return !result.replayed && result.receipt.show
}
module.exports = { eligible, claimNudge, COOLDOWN }
