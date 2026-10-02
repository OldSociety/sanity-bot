const { createHash } = require('node:crypto')
const { pieces, getEventState } = require('./config')
function createAdminBadges({ models, economy, event, scope, checkAccess, badges, finalizeRepair }) {
  async function recomputeBadges(input) {
    await checkAccess(input)
    if (!badges) throw new Error('Permanent badge service is not configured')
    if (typeof input.userId !== 'string' || !input.userId.trim()) throw new Error('Player ID is required')
    if (typeof input.interactionId !== 'string' || !input.interactionId.trim()) throw new Error('Interaction ID is required')
    if (input.confirm !== true) throw new Error('Badge recompute requires explicit confirmation')
    if (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.trim().length > 500) throw new Error('A reason of 1–500 characters is required')
    const request = { userId: input.userId.trim(), reason: input.reason.trim(), confirm: true, channelId: input.channelId ?? null }
    const digest = createHash('sha256').update(JSON.stringify(request)).digest('hex')
    return economy.execute({ ...scope, actorId: input.actorId, interactionId: input.interactionId,
      operationType: `admin_badges:${digest}` }, async original => {
      const ctx = { ...original, record: entry => original.record({ ...entry,
        metadata: { ...entry.metadata, adminReason: request.reason, repairAction: 'recompute-badges' } }) }
      // This reconciles already-earned eligibility after October too. It does
      // not reopen acquisitions/redemption or modify the archived winner proof.
      if (getEventState(ctx.now, event) === 'UPCOMING') throw new Error('Badge recompute requires an opened event')
      const player = await models.Participant.findOne({ where: { ...ctx.scope, userId: request.userId }, transaction: ctx.transaction })
      const registered = Date.parse(player?.registeredAt)
      if (!player || !Number.isFinite(registered) || registered < Date.parse(event.startsAt) || registered >= Date.parse(event.endsAt)) throw new Error('Badge recompute requires an event-registered participant')
      const rows = await models.Inventory.findAll({ where: { participantId: player.id }, transaction: ctx.transaction })
      if (rows.some(row => !pieces.some(piece => piece.id === row.pieceId) || !Number.isSafeInteger(row.quantity) || row.quantity < 1)) throw new Error('Invalid collection inventory')
      const owned = new Set(rows.map(row => row.pieceId))
      const eligibleCharacters = [...new Set(pieces.map(piece => piece.characterId))].filter(character => pieces.filter(piece => piece.characterId === character).every(piece => owned.has(piece.id)))
      const retainedBadges = await badges.owned(ctx.scope.guildId, request.userId, ctx.transaction)
      const newlyAwardedBadges = [], newlyCompletedCharacters = []
      for (const character of eligibleCharacters) {
        const awarded = await badges.award(ctx, request.userId, character)
        if (awarded) { newlyAwardedBadges.push(awarded); newlyCompletedCharacters.push(character) }
      }
      const badgeOwnership = await badges.owned(ctx.scope.guildId, request.userId, ctx.transaction)
      await ctx.record({ userId: request.userId, resource: 'badge_eligibility_recompute', delta: 0,
        metadata: { eligibleCharacters, retainedBadges, newlyAwardedBadges } })
      const receipt = { request, eligibleCharacters, retainedBadges, badgeOwnership,
        result: { awards: [], newlyAwardedBadges, newlyCompletedCharacters } }
      return finalizeRepair ? finalizeRepair(ctx, receipt, input) : receipt
    })
  }
  return { recomputeBadges }
}
module.exports = { createAdminBadges }
