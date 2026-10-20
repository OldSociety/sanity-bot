const { pieces } = require('./config')

function collectionEntitlement(ownedPieces, event) {
  if (!Number.isSafeInteger(ownedPieces) || ownedPieces < 0 || ownedPieces > pieces.length) throw Error('Invalid unique piece count')
  return ownedPieces * event.fate.uniquePieceReward +
    (ownedPieces === pieces.length ? event.fate.completeCollectionBonus : 0)
}

// Share the caller's inventory/purchase transaction and existing bank ledger.
async function creditCollectionFate({ User, ctx, userId, amount, event, metadata }) {
  if (!Number.isSafeInteger(amount) || amount < 1) throw Error('Invalid collection Fate reward')
  if (event.fate.excludedUserIds?.includes(userId)) return { entitled: 0, credited: 0, capped: 0, excluded: true }
  const user = await User.findByPk(userId, { transaction: ctx.transaction })
  if (!user || !Number.isSafeInteger(user.bank) || user.bank < 0) throw Error('Invalid collection Fate wallet')
  const before = user.bank
  const credited = Math.max(0, Math.min(amount, event.fate.bankCapacity - before))
  if (credited) await user.update({ bank: before + credited }, { transaction: ctx.transaction, silent: true })
  await ctx.record({ userId, resource: 'bank', delta: credited, before, after: user.bank,
    metadata: { ...metadata, entitled: amount, credited, capped: amount - credited } })
  return { entitled: amount, credited, capped: amount - credited, bankBefore: before, bank: user.bank }
}

module.exports = { collectionEntitlement, creditCollectionFate }
