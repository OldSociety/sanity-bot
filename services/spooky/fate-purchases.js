const { config: defaultConfig } = require('./config')

function createFatePurchases({ User, models, economy, collection, event = defaultConfig, canPurchase = () => true, finalizeReceipt = async (_ctx, receipt) => receipt }) {
  if (User.sequelize !== models.Participant.sequelize) throw new Error('Fate and seasonal models must share a connection')
  if (typeof canPurchase !== 'function') throw new Error('Fate purchase authorization is required')
  if (event.fate.paymentResource !== 'bank' || !Number.isSafeInteger(event.fate.quarterCost) || event.fate.quarterCost <= 0) throw new Error('Invalid bank-only quarter cost')

  async function purchase(input) {
    if (input.userId !== undefined && input.userId !== input.actorId) throw new Error('Fate purchase must belong to the actor')
    // Authorization receives trusted adapter data, never raw button/request role claims.
    // Keep it outside the transaction: future adapters can resolve Discord roles first.
    if (await canPurchase(input) !== true) throw new Error('Fate purchase is not permitted')
    return economy.execute({ ...input, operationType: 'fate_quarter_purchase' }, async ctx => {
      const userId = input.actorId
      const user = await User.findByPk(userId, { transaction: ctx.transaction })
      if (!user) throw new Error('Fate account does not exist')
      const before = user.bank, cost = event.fate.quarterCost
      if (!Number.isSafeInteger(before) || before < 0) throw new Error('Invalid fate bank balance')
      if (before < cost) throw new Error('Insufficient banked fate')
      const after = before - cost
      // Update only bank; never save a stale whole User instance over unrelated fields.
      const [changed] = await User.update({ bank: after }, {
        where: { user_id: userId, bank: before }, transaction: ctx.transaction,
      })
      if (changed !== 1) throw new Error('Fate bank changed during purchase')
      await ctx.record({ userId, resource: 'bank', delta: -cost, before, after, metadata: { reason: 'fate_quarter_purchase' } })
      const result = await collection.drawQuarter(ctx, userId)
      return finalizeReceipt(ctx, { ...result, userId, bankSpent: cost, bank: after })
    })
  }
  return { purchase }
}

module.exports = { createFatePurchases }
