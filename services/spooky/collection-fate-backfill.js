const { pieces } = require('./config')
const { collectionEntitlement, creditCollectionFate } = require('./collection-fate')

function createCollectionFateBackfill({ User, models, economy, event, guildId }) {
  if (!guildId || User.sequelize !== models.Participant.sequelize) throw Error('Invalid backfill scope/connection')
  const scope = { eventId: event.eventId, guildId }
  const input = { ...scope, actorId: 'system:collection-fate-backfill',
    workerKey: 'collection-fate-backfill-2026-10-20-v1', operationType: 'collection_fate_backfill' }
  const operationId = `worker:${scope.eventId}:${guildId}:${input.workerKey}`
  const valid = new Set(pieces.map(piece => piece.id))
  async function inspect(transaction) {
    const players = await models.Participant.findAll({ where: scope, order: [['userId', 'ASC']], transaction })
    const prior = await models.Ledger.findAll({ where: { ...scope, resource: 'bank' }, transaction })
    const targets = []
    for (const player of players) {
      const inventory = await models.Inventory.findAll({ where: { participantId: player.id }, transaction })
      if (!inventory.length) continue
      if (inventory.some(row => !valid.has(row.pieceId) || !Number.isSafeInteger(row.quantity) || row.quantity < 1)) throw Error('Invalid backfill inventory')
      const pieceIds = [...new Set(inventory.map(row => row.pieceId))].sort()
      const user = await User.findByPk(player.userId, { transaction })
      if (!user || !Number.isSafeInteger(user.bank) || user.bank < 0) throw Error('Missing/invalid backfill wallet')
      const earned = prior.filter(row => row.userId === player.userId && row.metadata?.reason === 'spooky_unique_piece')
        .reduce((sum, row) => sum + row.metadata.entitled, 0)
      const entitlement = collectionEntitlement(pieceIds.length, event)
      if (!Number.isSafeInteger(earned) || earned < 0 || earned > entitlement) throw Error('Collection rewards exceed inventory entitlement')
      const amount = entitlement - earned
      const credited = Math.max(0, Math.min(amount, event.fate.bankCapacity - user.bank))
      targets.push({ userId: player.userId, participantId: player.id, pieceIds, uniquePieces: pieceIds.length,
        completionBonus: pieceIds.length === pieces.length ? event.fate.completeCollectionBonus : 0,
        entitlement, previouslyEntitled: earned, amount, credited, capped: amount - credited,
        bankBefore: user.bank, bank: user.bank + credited, fatePoints: user.fate_points })
    }
    return { targets, players: targets.filter(target => target.amount > 0).length,
      uniquePieces: targets.reduce((sum, target) => sum + target.uniquePieces, 0),
      completionBonuses: targets.reduce((sum, target) => sum + target.completionBonus, 0),
      credited: targets.reduce((sum, target) => sum + target.credited, 0),
      capped: targets.reduce((sum, target) => sum + target.capped, 0) }
  }
  async function plan() {
    return economy.read(async transaction => {
      const prior = await models.Operation.findByPk(operationId, { transaction })
      return prior ? { replayed: true, operationId, receipt: prior.receipt } : inspect(transaction)
    })
  }
  const apply = () => economy.execute(input, async ctx => {
    // Re-read inside the writer transaction: live play may have progressed since plan.
    const report = await inspect(ctx.transaction)
    for (const target of report.targets) {
      if (!target.amount) continue
      await creditCollectionFate({ User, ctx, event, userId: target.userId, amount: target.amount,
        metadata: { reason: 'spooky_collection_backfill', participantId: target.participantId,
          pieceIds: target.pieceIds, completionBonus: target.completionBonus, previouslyEntitled: target.previouslyEntitled } })
    }
    return report
  })
  return { plan, apply, operationId }
}

module.exports = { createCollectionFateBackfill }
