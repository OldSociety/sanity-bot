const { rules } = require('./community-leveling/config')
function payment(bank, fate, { kind = 'purchase', cost = rules.rerollCost } = {}) {
  if (![bank, fate, cost].every(Number.isSafeInteger) || bank < 0 || fate < 0 || fate > rules.fateCap || cost <= 0 || !['reroll', 'purchase'].includes(kind)) throw new Error('Invalid Fate payment')
  const bankSpent = kind === 'reroll' ? Math.min(bank, cost) : 0, fateSpent = cost - bankSpent
  if (fate < fateSpent) throw new Error('Insufficient Fate Points')
  return { bankBefore: bank, bank: bank - bankSpent, fateBefore: fate, fatePoints: fate - fateSpent, bankSpent, fateSpent }
}
function reward(bank, fate, amount, { exceptional = false, bankCap = 100 } = {}) {
  if (![bank, fate, amount, bankCap].every(Number.isSafeInteger) || bank < 0 || fate < 0 || fate > rules.fateCap || amount < 0 || bankCap < 0) throw new Error('Invalid Fate reward')
  const fatePoints = Math.min(rules.fateCap, fate + amount), overflow = Math.max(0, fate + amount - rules.fateCap)
  return { fatePoints, bank: exceptional ? Math.max(bank, Math.min(bankCap, bank + overflow)) : bank }
}
module.exports = { payment, reward }
