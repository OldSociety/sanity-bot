// Arena-only test progression. Character rank has no mechanical effect yet.
const { rageValue, healthCost } = require('./resources')
const balance = require('./balance-config').loadBalance()
const specialMultipliers = Object.freeze([
  1, 1.1, 1.2, 1.3, 1.4, 1.45, 1.5, 1.55, 1.6, 1.65,
])
const exhaustedStressMultiplier = 1.25
const activeTickMs = 3500
const idleTickMs = 1000
const sessionTimeoutMs = 15000
const opportunityBonusPercent = 2
const playerCriticalMultiplier = 2
const enemyAttackStats = Object.freeze({
  accuracy: 85,
  criticalChance: 5,
  criticalMultiplier: 2,
})
const specialSlots = Object.freeze(['special1', 'special2', 'special3'])
// Other prototype characters retain their previous fallback kit.
const abilities = Object.freeze(balance.fallbackAbilities)
const passives = Object.freeze(balance.passives)
const buildKits = (characters, costs) =>
  Object.fromEntries(
    Object.entries(characters).map(([key, entries]) => [
      key,
      Object.freeze({
        ...Object.fromEntries(
          specialSlots.map((slot) => [
            slot,
            Object.freeze({
              ...entries[slot],
              stressCost: entries[slot].stressCost ?? costs[slot].stress,
              hopeCost: entries[slot].hopeCost ?? costs[slot].hope,
            }),
          ])
        ),
        passive: abilities.passive,
      }),
    ])
  )
const kits = buildKits(balance.characters, balance.costs)
const aiKits = buildKits(balance.ai.characters, balance.ai.costs)
function kitFor(fighter) {
  return (fighter.isAI ? aiKits : kits)[fighter.kit] || abilities
}
function levelIndex(level) {
  return Math.max(0, Math.min(9, level - 1))
}
function levelFinisherPercent(level, choice) {
  const [min, max] = balance.finisher.rangeByLevel[levelIndex(level)]
  return choice === 0
    ? min * balance.finisher.timeoutMultiplier
    : min + ((max - min) * (choice - 1)) / 4
}
function specialPercent(fighter, slot, choice = 0) {
  const definition = kitFor(fighter)[slot]
  if (fighter.isAI && definition.aiPercent !== undefined)
    return definition.aiPercent
  if (definition.type === 'playerFinisher')
    return (
      rageValue(fighter) * (definition.ragePercent || 0) +
      balance.playerFinisher.basePercent +
      choice * balance.playerFinisher.choicePercent
    )
  if (definition.type === 'aiFinisher')
    return (
      (balance.ai.finisherRange[0] + balance.ai.finisherRange[1]) / 2 +
      rageValue(fighter) * (definition.ragePercent || 0)
    )
  if (definition.type === 'finisher')
    return levelFinisherPercent(fighter.level, choice)
  if (definition.type === 'legacyFinisher') return 50 + choice * 10
  return (
    (definition.percentByLevel?.[levelIndex(fighter.level)] ??
      definition.percent) +
    rageValue(fighter) * (definition.ragePercent || 0)
  )
}
function finisherPercent(fighter, choice) {
  return specialPercent(fighter, 'special3', choice)
}
function eligible(fighter, slot, resource) {
  const definition = kitFor(fighter)[slot]
  return (
    abilityAvailable(fighter, slot) &&
    (!healthCost(fighter, definition) ||
      fighter.hp > healthCost(fighter, definition)) &&
    (definition.type !== 'rage' || rageValue(fighter) < 3) &&
    (definition.type !== 'heal' || fighter.hp < fighter.maxHp) &&
    fighter.stress >= (definition.stressCost || 0) &&
    resource >= (definition.hopeCost || 0) &&
    (fighter.basicHits || 0) >= (definition.requiredHits || 0) &&
    (fighter.focusHits || 0) >= (definition.requiredRecharge || 0)
  )
}
function canUse(fighter, slot) {
  return eligible(fighter, slot, fighter.hope)
}
function selectEnemySpecial(
  fighter,
  fear,
  roll,
  allowed = new Set(specialSlots)
) {
  const chances = [
    [
      'special3',
      allowed.has('special3') && eligible(fighter, 'special3', fear)
        ? balance.ai.special3Chance
        : 0,
    ],
    [
      'special2',
      allowed.has('special2') && eligible(fighter, 'special2', fear)
        ? balance.ai.special2ChanceByFear[
            Math.min(balance.ai.special2ChanceByFear.length - 1, fear)
          ]
        : 0,
    ],
    [
      'special1',
      allowed.has('special1') && eligible(fighter, 'special1', fear)
        ? balance.ai.stressChanceByAvailable[
            kitFor(fighter).special1.type === 'rage'
              ? balance.ai.stressChanceByAvailable.length - 1
              : fighter.stress
          ]
        : 0,
    ],
  ]
  if (!chances.some(([, chance]) => chance > 0)) return null
  const value = roll()
  if (!Number.isFinite(value) || value < 0 || value >= 100)
    throw Error('Expected ability percentile from 0 to below 100')
  let threshold = 0
  for (const [slot, chance] of chances) {
    threshold += ((100 - threshold) * chance) / 100
    if (value < threshold) return slot
  }
  return null
}
function statsForLevel(level = 1, kit) {
  if (!Number.isInteger(level) || level < 1 || level > 60)
    throw new RangeError('Arena level must be an integer from 1 to 60')
  const base = balance.baseStats[kit] || { attack: 300, hp: 300 }
  const gain = 30 * (level - 1),
    hp = base.hp + gain
  return { level, rank: 1, hp, maxHp: hp, attack: base.attack + gain }
}
function enemyAttackOutcome(fighter, rollAccuracy, rollCritical) {
  const percentile = (roll) => {
    const value = roll()
    if (!Number.isInteger(value) || value < 0 || value > 99)
      throw new Error('Expected enemy attack percentile from 0 to 99')
    return value
  }
  if (percentile(rollAccuracy) >= fighter.accuracy)
    return balance.attackOutcomes === 'block-immediate-critical'
      ? 'block'
      : 'miss'
  return percentile(rollCritical) < fighter.criticalChance ? 'critical' : 'hit'
}
function abilityAvailable(fighter, ability) {
  const definition = kitFor(fighter)[ability]
  return Boolean(
    definition &&
      (fighter.kit !== 'hellfed-marq' || Boolean(kits['hellfed-marq'])) &&
      definition.implemented !== false &&
      (ability !== 'passive' ||
        ['not-good-enough', 'on-the-brink', 'hellfed'].includes(
          fighter.passive
        ))
  )
}
function damageFor(attack, percent, upgradeRank = 1, vulnerability = 1) {
  if (!Number.isInteger(upgradeRank) || upgradeRank < 1 || upgradeRank > 10)
    throw new RangeError('Special upgrade rank must be from 1 to 10')
  // Integer coefficients avoid floating-point errors at exact integer boundaries.
  const rankPercent = Math.round(specialMultipliers[upgradeRank - 1] * 100)
  const modifierUnits = Math.round(vulnerability * 10000)
  return Math.ceil((attack * percent * rankPercent * modifierUnits) / 100000000)
}
module.exports = {
  balance,
  abilities,
  passives,
  specialSlots,
  kitFor,
  specialPercent,
  levelFinisherPercent,
  finisherPercent,
  selectEnemySpecial,
  canUse,
  specialMultipliers,
  activeTickMs,
  idleTickMs,
  sessionTimeoutMs,
  exhaustedStressMultiplier,
  opportunityBonusPercent,
  playerCriticalMultiplier,
  enemyAttackStats,
  enemyAttackOutcome,
  statsForLevel,
  abilityAvailable,
  damageFor,
}
