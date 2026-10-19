const brinkAvailable = (fighter) =>
  fighter.passive === 'on-the-brink' && !fighter.brinkUsed
const brinkHealth = (fighter) => Math.max(1, Math.ceil(fighter.maxHp * 0.25))
function survive(fighter) {
  if (fighter.hp > 0 || !brinkAvailable(fighter)) return 0
  fighter.hp = brinkHealth(fighter)
  fighter.brinkUsed = true
  return fighter.hp
}
module.exports = { brinkAvailable, brinkHealth, survive }
