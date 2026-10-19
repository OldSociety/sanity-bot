const { balance } = require('./rules')
// Legacy and frozen production profiles retain their established 10% rescue.
const brinkPercent = () => balance.passives['on-the-brink']?.revivePercent ?? 10
const brinkAvailable = (fighter) =>
  fighter.passive === 'on-the-brink' && !fighter.brinkUsed
const brinkHealth = (fighter) =>
  Math.max(1, Math.ceil((fighter.maxHp * brinkPercent()) / 100))
function survive(fighter) {
  if (fighter.hp > 0 || !brinkAvailable(fighter)) return 0
  fighter.hp = brinkHealth(fighter)
  fighter.brinkUsed = true
  return fighter.hp
}
module.exports = { brinkAvailable, brinkHealth, brinkPercent, survive }
