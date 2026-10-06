const { config: defaultConfig, pieces, requireApprovedRarity } = require('./config')

function createCollection({ models, participants, event = defaultConfig, random = Math.random, allowPaused = false, badges = null }) {
  const byId = new Map(pieces.map(piece => [piece.id, piece]))
  function roll() {
    const value = random()
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Random value must be in [0, 1)')
    return value
  }
  function select(list) { return list[Math.floor(roll() * list.length)] }
  function canDuplicate(piece, owned) {
    return event.duplicates.allowDuplicates !== false && (!event.duplicates.requireCompletedCharacter ||
      pieces.filter(item => item.characterId === piece.characterId).every(item => owned.has(item.id)))
  }
  function ordinaryPiece(percent = event.ordinaryRarity.percent, owned = new Map(), spotlight = null) {
    requireApprovedRarity(event)
    const candidates = pieces.filter(piece => !owned.has(piece.id) || canDuplicate(piece, owned))
    if (!candidates.length) throw new Error('Your collection is complete; no more quarters are needed.')
    const available = ['common', 'rare', 'legendary'].filter(rarity => candidates.some(piece => piece.rarity === rarity))
    if (!spotlight || !candidates.some(piece => piece.characterId === spotlight.characterId)) {
      const value = roll() * available.reduce((sum, rarity) => sum + percent[rarity], 0)
      let threshold = 0
      for (const rarity of available) {
        threshold += percent[rarity]
        if (value < threshold) return select(candidates.filter(piece => piece.rarity === rarity))
      }
      throw new Error('Invalid ordinary rarity weights')
    }
    const weighted = require('./spotlight').pieceWeights(candidates, percent, spotlight?.characterId)
    const rarityWeight = rarity => weighted.filter(item => item.piece.rarity === rarity).reduce((sum, item) => sum + item.weight, 0)
    const value = roll() * available.reduce((sum, rarity) => sum + rarityWeight(rarity), 0)
    let threshold = 0
    for (const rarity of available) {
      threshold += rarityWeight(rarity)
      if (value < threshold) {
        const pool = weighted.filter(item => item.piece.rarity === rarity)
        const pick = roll() * rarityWeight(rarity)
        let cumulative = 0
        for (const item of pool) { cumulative += item.weight; if (pick < cumulative) return item.piece }
        return pool.at(-1).piece
      }
    }
    throw new Error('Invalid ordinary rarity weights')
  }
  async function player(ctx, userId) {
    const { participant } = await participants.prepare(ctx, userId)
    if (!participant.registeredAt) throw new Error('Collection requires registration')
    const state = await models.EventState.findOne({ where: ctx.scope, transaction: ctx.transaction })
    // Only the trusted administrator repair composition opts out of pause.
    // Its participant adapter still enforces scope, registration and lifecycle.
    if (state?.actionsPaused && !allowPaused) throw new Error('Spooky actions are paused')
    return participant
  }
  async function inventory(ctx, participant) {
    const rows = await models.Inventory.findAll({ where: { participantId: participant.id }, transaction: ctx.transaction })
    for (const row of rows) {
      if (!byId.has(row.pieceId) || !Number.isSafeInteger(row.quantity) || row.quantity < 1) throw new Error('Invalid collection inventory')
    }
    return new Map(rows.map(row => [row.pieceId, row]))
  }
  async function add(ctx, participant, owned, piece, reason) {
    const existing = owned.get(piece.id), before = existing?.quantity ?? 0
    if (before && !canDuplicate(piece, owned)) throw new Error('This quarter is already owned; complete its character before receiving duplicates.')
    if (!Number.isSafeInteger(before + 1)) throw new Error('Inventory quantity overflow')
    if (existing) await existing.update({ quantity: before + 1 }, { transaction: ctx.transaction })
    else owned.set(piece.id, await models.Inventory.create({ participantId: participant.id, pieceId: piece.id, quantity: 1 }, { transaction: ctx.transaction }))
    await ctx.record({ userId: participant.userId, resource: `quarter:${piece.id}`, delta: 1, before, after: before + 1, metadata: { reason, rarity: piece.rarity } })
    // Snapshot each acquisition inside its transaction, before a later draw or
    // duplicate exchange can change the circle shown for this particular award.
    const ownedPositions = pieces.filter(item => item.characterId === piece.characterId && owned.has(item.id)).map(item => item.position)
    const newlyAwardedBadge = badges && ownedPositions.length === 4 ? await badges.award(ctx, participant.userId, piece.characterId) : null
    return { ...piece, duplicate: before > 0, source: reason, ownedPositions,
      // Keep the count at this acquisition, before an automatic exchange consumes
      // five extras. Saved reveals must not read today's inventory on replay.
      duplicates: [...owned.values()].reduce((sum, row) => sum + row.quantity - 1, 0),
      ...(badges ? { newlyAwardedBadge, badgeAlreadyOwned: ownedPositions.length === 4 && !newlyAwardedBadge } : {}) }
  }
  async function exchange(ctx, participant, owned) {
    const awards = []
    if (event.duplicates.allowDuplicates === false) return awards
    while (true) {
      const missing = pieces.filter(piece => !owned.has(piece.id))
      const extras = [...owned.values()].reduce((sum, row) => sum + row.quantity - 1, 0)
      if (!missing.length || extras < event.duplicates.exchangeCost) break
      let remaining = event.duplicates.exchangeCost
      const consumed = []
      // Stable order makes automatic consumption auditable; all first copies survive.
      for (const piece of pieces) {
        const row = owned.get(piece.id)
        const amount = Math.min(remaining, (row?.quantity ?? 1) - 1)
        if (!amount) continue
        const before = row.quantity
        await row.update({ quantity: before - amount }, { transaction: ctx.transaction })
        await ctx.record({ userId: participant.userId, resource: `quarter:${piece.id}`, delta: -amount, before, after: before - amount, metadata: { reason: 'duplicate_exchange' } })
        consumed.push({ pieceId: piece.id, quantity: amount })
        remaining -= amount
        if (!remaining) break
      }
      awards.push({ ...await add(ctx, participant, owned, select(missing), 'duplicate_exchange'), consumed })
    }
    return awards
  }
  function summary(owned, awards) {
    const completeCharacters = [...new Set(pieces.map(piece => piece.characterId))]
      .filter(id => pieces.filter(piece => piece.characterId === id).every(piece => owned.has(piece.id)))
    return { awards, completeCharacters, ...(badges ? {
      newlyAwardedBadges: awards.map(award => award.newlyAwardedBadge).filter(Boolean),
      alreadyOwnedBadges: [...new Set(awards.filter(award => award.badgeAlreadyOwned).map(award => `spooky-2026:${award.characterId}`))],
    } : {}), ownedPieces: owned.size,
      duplicates: [...owned.values()].reduce((sum, row) => sum + row.quantity - 1, 0) }
  }
  async function grantQuarter(ctx, userId, pieceId) {
    const piece = byId.get(pieceId)
    if (!piece) throw new Error('Unknown quarter ID')
    const participant = await player(ctx, userId), owned = await inventory(ctx, participant)
    const award = await add(ctx, participant, owned, piece, 'grant')
    return summary(owned, [award, ...await exchange(ctx, participant, owned)])
  }
  async function drawQuarter(ctx, userId) {
    requireApprovedRarity(event)
    const participant = await player(ctx, userId), owned = await inventory(ctx, participant)
    const spotlight = await require('./spotlight').ensureSpotlight(ctx, models, event)
    const award = await add(ctx, participant, owned, ordinaryPiece(event.ordinaryRarity.percent, owned, spotlight), 'ordinary_draw')
    return summary(owned, [award, ...await exchange(ctx, participant, owned)])
  }
  async function drawFateQuarter(ctx, userId) {
    requireApprovedRarity(event)
    const participant = await player(ctx, userId), owned = await inventory(ctx, participant)
    const spotlight = await require('./spotlight').ensureSpotlight(ctx, models, event)
    const award = await add(ctx, participant, owned, ordinaryPiece(event.fate.rarityPercent, owned, spotlight), 'fate_draw')
    return summary(owned, [award, ...await exchange(ctx, participant, owned)])
  }
  async function creditEyes(ctx, userId, amount, { fromUserId = null, metadata = {} } = {}) {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Eye credit must be a positive integer')
    requireApprovedRarity(event)
    const participant = await player(ctx, userId)
    if (fromUserId !== null) {
      await player(ctx, fromUserId)
      await ctx.transfer(fromUserId, userId, 'eyes', amount, metadata)
    } else await ctx.changeBalance(userId, 'eyes', amount, { metadata })
    const balance = await models.Participant.findByPk(participant.id, { transaction: ctx.transaction })
    const owned = await inventory(ctx, participant), awards = []
    while (balance.eyes >= event.eyes.quarterCost && (event.duplicates.allowDuplicates !== false || owned.size < pieces.length)) {
      const spotlight = await require('./spotlight').ensureSpotlight(ctx, models, event)
      await ctx.changeBalance(userId, 'eyes', -event.eyes.quarterCost, { metadata: { reason: 'automatic_quarter' } })
      balance.eyes -= event.eyes.quarterCost
      awards.push(await add(ctx, participant, owned, ordinaryPiece(event.ordinaryRarity.percent, owned, spotlight), 'eye_draw'))
      awards.push(...await exchange(ctx, participant, owned))
    }
    return { ...summary(owned, awards), eyes: balance.eyes }
  }
  async function exchangeDuplicates(ctx, userId) {
    const participant = await player(ctx, userId), owned = await inventory(ctx, participant)
    return summary(owned, await exchange(ctx, participant, owned))
  }
  // Internal transaction APIs: callers authorize and charge actions/fate/grants.
  // No nested execute or Discord calls; caller persists this result in its receipt.
  return { creditEyes, drawQuarter, drawFateQuarter, grantQuarter, exchangeDuplicates }
}

module.exports = { createCollection }
