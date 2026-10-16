// Arena-only test progression. Character rank has no mechanical effect yet.
const specialMultipliers = Object.freeze([1, 1.1, 1.2, 1.3, 1.4, 1.45, 1.5, 1.55, 1.6, 1.65])
const exhaustedStressMultiplier = 1.25
const activeTickMs = 4000
const idleTickMs = 1000
const opportunityMultiplier = 1.1
const playerCriticalMultiplier = 2
const enemyAttackStats = Object.freeze({ accuracy: 75, criticalChance: 5, criticalMultiplier: 2 })
const abilities = Object.freeze({
  combo: Object.freeze({ unlockLevel: 1, percent: 1, hopeCost: 0 }),
  hope: Object.freeze({ unlockLevel: 5, percent: 20, hopeCost: 1 }),
  third: Object.freeze({ unlockLevel: 20, percent: 40, hopeCost: 2 }),
  passive: Object.freeze({ unlockLevel: 1 }),
})
function statsForLevel(level = 1) {
  if (!Number.isInteger(level) || level < 1 || level > 60) throw new RangeError('Arena level must be an integer from 1 to 60')
  const stat = 300 + 30 * (level - 1)
  return { level, rank: 1, hp: stat, maxHp: stat, attack: stat }
}
function enemyAttackOutcome(fighter, rollAccuracy, rollCritical) {
  const percentile = roll => {
    const value = roll()
    if (!Number.isInteger(value) || value < 0 || value > 99) throw new Error('Expected enemy attack percentile from 0 to 99')
    return value
  }
  if (percentile(rollAccuracy) >= fighter.accuracy) return 'miss'
  return percentile(rollCritical) < fighter.criticalChance ? 'critical' : 'hit'
}
function abilityAvailable(fighter, ability) {
  const definition = abilities[ability]
  return Boolean(definition && definition.implemented !== false && fighter.level >= definition.unlockLevel &&
    (ability !== 'passive' || fighter.passive === 'opportunity'))
}
function damageFor(attack, percent, upgradeRank = 1, vulnerability = 1) {
  if (!Number.isInteger(upgradeRank) || upgradeRank < 1 || upgradeRank > 10) throw new RangeError('Special upgrade rank must be from 1 to 10')
  // Integer coefficients avoid floating-point errors at exact integer boundaries.
  const rankPercent = Math.round(specialMultipliers[upgradeRank - 1] * 100)
  const modifierUnits = Math.round(vulnerability * 10000)
  return Math.ceil(attack * percent * rankPercent * modifierUnits / 100000000)
}
module.exports = { abilities, specialMultipliers, activeTickMs, idleTickMs, exhaustedStressMultiplier, opportunityMultiplier, playerCriticalMultiplier, enemyAttackStats, enemyAttackOutcome, statsForLevel, abilityAvailable, damageFor }
