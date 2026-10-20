// Kylax-only packet defenses. Bleeding is deliberately excluded.
const isKylax = (fighter) => fighter?.kit === 'classic-kylax'
const config = () => require('./character-config').sheets.kylax
const wardActive = (fighter, round = fighter.combatRound) =>
  isKylax(fighter) && Number.isInteger(fighter.gravewardRound) && fighter.gravewardRound === round
function activate(fighter, round) {
  const removed = Number(Boolean(fighter.bleeding))
  delete fighter.bleeding
  fighter.gravewardRound = round
  fighter.combatRound = round
  return removed
}
function packet(damage, target, { critical = false, round, bleeding = false } = {}) {
  if (!isKylax(target) || bleeding)
    return { damage, original: damage, criticalPrevented: 0, wardPrevented: 0 }
  const { roundDamage } = require('./rules')
  const original = damage
  if (critical) damage = roundDamage(damage * (100 - config().passive.reductionPercent) / 100)
  const criticalPrevented = original - damage
  const beforeWard = damage
  if (wardActive(target, round))
    damage = roundDamage(damage * (100 - config().abilities.special1.reductionPercent) / 100)
  return { original, damage, criticalPrevented, wardPrevented: beforeWard - damage }
}
const mitigate = (damage, target, options) => packet(damage, target, options).damage
function executionPercent(fighter, target, slot) {
  if (!isKylax(fighter) || slot !== 'special2' || !target) return undefined
  const ability = require('./rules').kitFor(fighter)[slot]
  return ability.percent + (target.hp * 100 <= target.maxHp * ability.thresholdPercent ? ability.bonusPercent : 0)
}
module.exports = { isKylax, wardActive, activate, packet, mitigate, executionPercent }
