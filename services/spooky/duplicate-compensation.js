// One-time scoped correction. It creates no public notification or gameplay
// action, never refills candy, and leaves first copies/badges/scores intact.
function createDuplicateCompensation({ models, economy, event = require('./config').config }) {
  async function run(scope) {
    if (scope.eventId !== event.eventId || event.duplicates.allowDuplicates !== false) throw Error('Unique-piece cutover required')
    const known = new Set(require('./config').pieces.map(piece => piece.id))
    return economy.execute({ ...scope, actorId: 'system', workerKey: 'unique-pieces-v20', operationType: 'duplicate_compensation' }, async ctx => {
      const players = await models.Participant.findAll({ where: scope, transaction: ctx.transaction })
      const converted = []
      for (const player of players) {
        const rows = await models.Inventory.findAll({ where: { participantId: player.id }, transaction: ctx.transaction })
        let extras = 0
        for (const row of rows) {
          if (!known.has(row.pieceId) || !Number.isSafeInteger(row.quantity) || row.quantity < 1) throw Error('Invalid duplicate inventory')
          const amount = row.quantity - 1
          if (!amount) continue
          await row.update({ quantity: 1 }, { transaction: ctx.transaction })
          await ctx.record({ userId: player.userId, resource: `quarter:${row.pieceId}`, delta: -amount,
            before: amount + 1, after: 1, metadata: { reason: 'unique_piece_cutover', eyesPerExtra: 4 } })
          extras += amount
        }
        if (extras) {
          const eyes = extras * 4
          if (!Number.isSafeInteger(eyes)) throw Error('Compensation overflow')
          const updated = await ctx.changeBalance(player.userId, 'eyes', eyes, { metadata: { reason: 'duplicate_compensation', extras, eyesPerExtra: 4 } })
          converted.push({ userId: player.userId, extras, eyesCredited: eyes, eyesAfter: updated.eyes })
        }
      }
      return { converted, extras: converted.reduce((sum, row) => sum + row.extras, 0), eyesCredited: converted.reduce((sum, row) => sum + row.eyesCredited, 0) }
    })
  }
  return { run }
}
module.exports = { createDuplicateCompensation }
