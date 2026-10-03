const { config: defaultConfig } = require('./config')
function planFatePayment(bank, fate, cost) {
  if (![bank, fate, cost].every(Number.isSafeInteger) || bank < 0 || fate < 0 || cost <= 0 || !Number.isSafeInteger(bank + fate)) throw new Error('Invalid fate balance')
  if (bank + fate < cost) throw new Error('Insufficient Fate Points')
  const bankSpent = Math.min(bank, cost), fateSpent = cost - bankSpent
  return { bankBefore: bank, bank: bank - bankSpent, fateBefore: fate, fatePoints: fate - fateSpent, bankSpent, fateSpent }
}

function createFatePurchases({ User, models, economy, collection, event = defaultConfig, canPurchase = () => true, finalizeReceipt = async (_ctx, receipt) => receipt }) {
  if (User.sequelize !== models.Participant.sequelize) throw new Error('Fate and seasonal models must share a connection')
  if (typeof canPurchase !== 'function') throw new Error('Fate purchase authorization is required')
  if (event.fate.paymentResource !== 'bank-then-fate' || !Number.isSafeInteger(event.fate.quarterCost) || event.fate.quarterCost <= 0) throw new Error('Invalid Fate quarter cost')

  async function purchase(input) {
    if (input.userId !== undefined && input.userId !== input.actorId) throw new Error('Fate purchase must belong to the actor')
    // Authorization receives trusted adapter data, never raw button/request role claims.
    // Keep it outside the transaction: future adapters can resolve Discord roles first.
    if (await canPurchase(input) !== true) throw new Error('Fate purchase is not permitted')
    return economy.execute({ ...input, operationType: 'fate_quarter_purchase' }, async ctx => {
      const userId = input.actorId
      const user = await User.findByPk(userId, { transaction: ctx.transaction })
      if (!user) throw new Error('Fate account does not exist')
      if (input.expectedWallet && (user.bank !== input.expectedWallet.bank || user.fate_points !== input.expectedWallet.fatePoints)) throw new Error('Your balances changed. Use /spooky spend-fate again to review them.')
      const payment = planFatePayment(user.bank, user.fate_points, event.fate.quarterCost)
      // Claim both balances atomically. Changes since confirmation never silently
      // switch a Bank-only preview into spending the player's unbanked Fate.
      const [changed] = await User.update({ bank: payment.bank, fate_points: payment.fatePoints }, {
        where: { user_id: userId, bank: payment.bankBefore, fate_points: payment.fateBefore }, transaction: ctx.transaction,
      })
      if (changed !== 1) throw new Error('Fate bank changed during purchase')
      for (const [resource, amount, before, after] of [['bank',payment.bankSpent,payment.bankBefore,payment.bank], ['fate_points',payment.fateSpent,payment.fateBefore,payment.fatePoints]]) {
        if (amount) await ctx.record({ userId, resource, delta: -amount, before, after, metadata: { reason: 'fate_quarter_purchase' } })
      }
      const result = await collection.drawFateQuarter(ctx, userId)
      return finalizeReceipt(ctx, { ...result, userId, ...payment })
    })
  }
  return { purchase }
}

module.exports = { createFatePurchases, planFatePayment }
