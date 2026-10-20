async function correctOwnerCollectionFate({ User, models, economy, event, guildId, userId }) {
  if (!event.fate.excludedUserIds.includes(userId)) throw Error('Owner must be excluded before correction')
  return economy.execute({ eventId: event.eventId, guildId, actorId: 'system:owner-collection-correction',
    workerKey: `owner-collection-exclusion-2026-10-20:${userId}`, operationType: 'collection_fate_correction' }, async ctx => {
    const rewards = await models.Ledger.findAll({ where: { ...ctx.scope, userId, resource: 'bank' }, transaction: ctx.transaction })
    const relevant = rewards.filter(row => ['spooky_unique_piece', 'spooky_collection_backfill'].includes(row.metadata?.reason))
    const amount = relevant.reduce((sum, row) => sum + row.delta, 0)
    if (!Number.isSafeInteger(amount) || amount < 0) throw Error('Invalid historical collection rewards')
    const user = await User.findByPk(userId, { transaction: ctx.transaction })
    if (!user || !Number.isSafeInteger(user.bank) || user.bank < amount) throw Error('Historical collection credit is not available to reverse')
    const before = user.bank
    if (amount) {
      await user.update({ bank: before - amount }, { transaction: ctx.transaction, silent: true })
      await ctx.record({ userId, resource: 'bank', delta: -amount, before, after: user.bank,
        metadata: { reason: 'owner_collection_exclusion_correction', originalLedgerIds: relevant.map(row => row.id) } })
    }
    return { userId, reversed: amount, bankBefore: before, bank: user.bank, fatePoints: user.fate_points,
      originalLedgerIds: relevant.map(row => row.id), crownUntouched: true }
  })
}
module.exports = { correctOwnerCollectionFate }
