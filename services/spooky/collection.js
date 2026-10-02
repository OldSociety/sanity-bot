const { config: defaultConfig, pieces, requireApprovedRarity } = require('./config')

function createCollection({ models, participants, event = defaultConfig, random = Math.random, allowPaused = false, badges = null }) {
  const byId = new Map(pieces.map(piece => [piece.id, piece]))
  function roll() {
    const value = random()
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Random value must be in [0, 1)')
    return value
  }
  function select(list) { return list[Math.floor(roll() * list.length)] }
  function ordinaryPiece() {
    requireApprovedRarity(event)
    const value = roll() * 100
    let threshold = 0
    for (const rarity of ['common', 'rare', 'legendary']) {
      threshold += event.ordinaryRarity.percent[rarity]
      if (value < threshold) return select(pieces.filter(piece => piece.rarity === rarity))
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
    if (!Number.isSafeInteger(before + 1)) throw new Error('Inventory quantity overflow')
    if (existing) await existing.update({ quantity: before + 1 }, { transaction: ctx.transaction })
    else owned.set(piece.id, await models.Inventory.create({ participantId: participant.id, pieceId: piece.id, quantity: 1 }, { transaction: ctx.transaction }))
    await ctx.record({ userId: participant.userId, resource: `quarter:${piece.id}`, delta: 1, before, after: before + 1, metadata: { reason, rarity: piece.rarity } })
    // Snapshot each acquisition inside its transaction, before a later draw or
    // duplicate exchange can change the circle shown for this particular award.
    const ownedPositions = pieces.filter(item => item.characterId === piece.characterId && owned.has(item.id)).map(item => item.position)
    const newlyAwardedBadge = badges && ownedPositions.length === 4 ? await badges.award(ctx, participant.userId, piece.characterId) : null
    return { ...piece, duplicate: before > 0, source: reason, ownedPositions,
      ...(badges ? { newlyAwardedBadge, badgeAlreadyOwned: ownedPositions.length === 4 && !newlyAwardedBadge } : {}) }
  }
  async function exchange(ctx, participant, owned) {
    const awards = []
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
    const award = await add(ctx, participant, owned, ordinaryPiece(), 'ordinary_draw')
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
    while (balance.eyes >= event.eyes.quarterCost) {
      await ctx.changeBalance(userId, 'eyes', -event.eyes.quarterCost, { metadata: { reason: 'automatic_quarter' } })
      balance.eyes -= event.eyes.quarterCost
      awards.push(await add(ctx, participant, owned, ordinaryPiece(), 'eye_draw'))
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
  return { creditEyes, drawQuarter, grantQuarter, exchangeDuplicates }
}

module.exports = { createCollection }
