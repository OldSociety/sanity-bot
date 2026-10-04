const { createHash } = require('node:crypto')
const { pieces, getEventState } = require('./config')
const { createCollection } = require('./collection')

function createAdminRepairs({ models, economy, event, scope, checkAccess, random, finalizeRepair, badges = null }) {
  const byId = new Map(pieces.map(piece => [piece.id, piece]))
  async function existing(ctx, userId, registered = false) {
    if (ctx.scope.eventId !== scope.eventId || ctx.scope.guildId !== scope.guildId) throw new Error('Repair scope mismatch')
    // Repairs can work during a pause/disabled flag, but cannot extend October
    // acquisition or mutate archived state. Never enroll/refill a repair target.
    if (getEventState(ctx.now, event) !== 'ACTIVE') throw new Error('Economy repairs require the active October interval')
    const state = await models.EventState.findOne({ where: ctx.scope, transaction: ctx.transaction })
    if (state?.archivedAt) throw new Error('Spooky event is archived')
    const participant = await models.Participant.findOne({ where: { ...ctx.scope, userId }, transaction: ctx.transaction })
    if (!participant) throw new Error('Repair requires an existing seasonal player')
    if (registered && !participant.registeredAt) throw new Error('Collection repair requires registration')
    return participant
  }
  const collection = createCollection({ models, event, random, allowPaused: true, badges,
    participants: { prepare: async (ctx, userId) => ({ participant: await existing(ctx, userId, true) }) } })
  async function inventory(ctx, participant) {
    const rows = await models.Inventory.findAll({ where: { participantId: participant.id }, transaction: ctx.transaction })
    if (rows.some(row => !byId.has(row.pieceId) || !Number.isSafeInteger(row.quantity) || row.quantity < 1)) throw new Error('Invalid collection inventory')
    const owned = new Set(rows.map(row => row.pieceId))
    return { rows, completeCharacters: [...new Set(pieces.map(piece => piece.characterId))]
      .filter(id => pieces.filter(piece => piece.characterId === id).every(piece => owned.has(piece.id))) }
  }
  function request(input) {
    if (typeof input.userId !== 'string' || !input.userId.trim()) throw new Error('Player ID is required')
    if (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.trim().length > 500) throw new Error('A reason of 1–500 characters is required')
    if (typeof input.interactionId !== 'string' || !input.interactionId.trim()) throw new Error('Repair interaction ID is required')
    const result = { action: input.action, userId: input.userId, reason: input.reason.trim(), channelId: input.channelId ?? null }
    if (input.action === 'balance') {
      if (!['candy', 'eyes'].includes(input.resource)) throw new Error('Repair resource must be candy or eyes')
      const bound = input.resource === 'candy' ? 80 : 100
      if (!Number.isSafeInteger(input.delta) || input.delta === 0 || Math.abs(input.delta) > bound) throw new Error(`Repair delta must be a nonzero integer within ±${bound}`)
      return { ...result, resource: input.resource, delta: input.delta }
    }
    if (!['grant-quarter', 'remove-quarter'].includes(input.action)) throw new Error('Unknown administrator repair')
    if (!byId.has(input.pieceId)) throw new Error('Unknown quarter ID')
    if (input.allowLastCopy !== undefined && typeof input.allowLastCopy !== 'boolean') throw new Error('Last-copy permission must be boolean')
    return { ...result, pieceId: input.pieceId, allowLastCopy: input.action === 'remove-quarter' && input.allowLastCopy === true }
  }
  async function repair(input) {
    await checkAccess(input)
    const wanted = request(input)
    // The root executor checks actor/scope/type on replay. Bind the complete
    // normalized repair request so a reused ID cannot change target or amount.
    const digest = createHash('sha256').update(JSON.stringify(wanted)).digest('hex')
    return economy.execute({ ...scope, actorId: input.actorId, interactionId: input.interactionId,
      operationType: `admin_repair:${digest}` }, async original => {
      const metadata = { adminReason: wanted.reason, repairAction: wanted.action }
      const ctx = { ...original,
        record: entry => original.record({ ...entry, metadata: { ...entry.metadata, ...metadata } }),
        changeBalance: (userId, resource, delta, details = {}) => original.changeBalance(userId, resource, delta,
          { ...details, metadata: { ...details.metadata, ...metadata } }) }
      const player = await existing(ctx, wanted.userId, wanted.resource === 'eyes' || wanted.action !== 'balance')
      const beforeInventory = await inventory(ctx, player)
      const retainedBadges = badges ? await badges.owned(ctx.scope.guildId, wanted.userId, ctx.transaction) : null
      let result = { awards: [] }
      if (wanted.action === 'balance') {
        if (wanted.resource === 'eyes' && wanted.delta > 0) result = await collection.creditEyes(ctx, wanted.userId, wanted.delta)
        else {
          const before = player[wanted.resource]
          const updated = await ctx.changeBalance(wanted.userId, wanted.resource, wanted.delta)
          // A full candy balance discards elapsed surplus before being reduced;
          // filling to cap also starts a fresh anchor. Preserve partial time otherwise.
          if (wanted.resource === 'candy' && (before === event.candy.capacity || updated.candy === event.candy.capacity)) {
            const oldAnchor = updated.refillAnchor
            await updated.update({ refillAnchor: ctx.now }, { transaction: ctx.transaction })
            await ctx.record({ userId: wanted.userId, resource: 'refill_anchor', delta: 0,
              metadata: { before: oldAnchor, after: ctx.now, reason: 'admin_cap_correction' } })
          }
        }
      } else if (wanted.action === 'grant-quarter') result = await collection.grantQuarter(ctx, wanted.userId, wanted.pieceId)
      else {
        const row = beforeInventory.rows.find(row => row.pieceId === wanted.pieceId)
        if (!row) throw new Error('Player does not own this quarter')
        if (row.quantity === 1 && !wanted.allowLastCopy) throw new Error('Removing the only copy requires explicit last-copy permission')
        const before = row.quantity
        if (before === 1) await row.destroy({ transaction: ctx.transaction })
        else await row.update({ quantity: before - 1 }, { transaction: ctx.transaction })
        await ctx.record({ userId: wanted.userId, resource: `quarter:${wanted.pieceId}`, delta: -1, before, after: before - 1,
          metadata: { reason: 'admin_remove', removedLastCopy: before === 1 } })
        // Removal corrects one copy only. It does not buy, exchange, or revoke
        // any future permanent badge; duplicate consumption still keeps first copies.
      }
      const afterInventory = await inventory(ctx, player)
      const fresh = await models.Participant.findByPk(player.id, { transaction: ctx.transaction })
      const receipt = { request: wanted, candy: fresh.candy, eyes: fresh.eyes,
        result: { ...result, completeCharacters: afterInventory.completeCharacters,
          newlyCompletedCharacters: afterInventory.completeCharacters.filter(id => !beforeInventory.completeCharacters.includes(id)),
          ownedPieces: afterInventory.rows.length, duplicates: afterInventory.rows.reduce((sum, row) => sum + row.quantity - 1, 0) },
        retainedBadges, badgeOwnership: badges ? await badges.owned(ctx.scope.guildId, wanted.userId, ctx.transaction) : null }
      return finalizeRepair ? finalizeRepair(ctx, receipt, input) : receipt
    })
  }
  return { repair }
}

module.exports = { createAdminRepairs }
