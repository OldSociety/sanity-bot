const config = require('../../config/arena-hendrix-development.json')
const {
  damageFor,
  exhaustedStressMultiplier,
  specialPercent,
  kitFor,
} = require('./rules')
const { exhausted } = require('./resources')
const { blockedDamage, basic_damage } = require('./damage-types')
const isHendrix = (fighter) => fighter.kit === config.identity.kit
function duration(roll) {
  const p = roll()
  if (!Number.isFinite(p) || p < 0 || p >= 100)
    throw Error('Expected Bleeding percentile')
  return p < 40 ? 2 : p < 80 ? 3 : 4
}
function nativeOutcome(fighter, rollDuality, rollAccuracy, rollCritical) {
  if (fighter.isAI) {
    const accuracy = rollAccuracy()
    if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy >= 100)
      throw Error('Expected strike accuracy percentile')
    if (accuracy >= fighter.accuracy) return 'block'
    const critical = rollCritical()
    if (!Number.isFinite(critical) || critical < 0 || critical >= 100)
      throw Error('Expected strike critical percentile')
    return critical < fighter.criticalChance ? 'critical' : 'hit'
  }
  const h = rollDuality(),
    f = rollDuality()
  if (![h, f].every((n) => Number.isInteger(n) && n >= 1 && n <= 12))
    throw Error('Expected strike d12')
  return h === f ? 'critical' : h + f >= 12 ? 'hit' : 'block'
}
function strike(fighter, outcome, bleeding, multiplier = 1) {
  if (!['hit', 'block', 'critical'].includes(outcome))
    throw Error('Unknown strike outcome')
  const critical = outcome === 'critical' ? 2 : 1
  const raw = damageFor(
    fighter.attack,
    config.basic.percentPerStrike,
    1,
    multiplier * critical
  )
  const direct = outcome === 'block' ? blockedDamage(raw, basic_damage) : raw
  const bleed = bleeding
    ? damageFor(
        fighter.attack,
        config.bleeding.percentPerStrike,
        1,
        multiplier * critical
      )
    : 0
  return {
    outcome,
    direct,
    bleed,
    damage: direct + bleed,
    prevented: raw - direct,
  }
}
// One main roll controls resources. Independent draws return damage only.
function sequence(fighter, target, slot, mainCritical, targetStress, rolls) {
  const bleeding = slot === 'special1' || (target.bleeding?.remaining || 0) > 0
  const multiplier = exhausted(target, targetStress)
    ? exhaustedStressMultiplier
    : 1
  const count =
    config.basic.strikes +
    (slot === 'special2' ? config.abilities.special2.additionalStrikes : 0)
  const strikes = Array.from({ length: count }, (_, i) =>
    strike(
      fighter,
      i === 0 && mainCritical
        ? 'critical'
        : nativeOutcome(fighter, rolls.duality, rolls.accuracy, rolls.critical),
      bleeding,
      multiplier
    )
  )
  return {
    strikes,
    bleeding,
    direct: strikes.reduce((n, x) => n + x.direct, 0),
    bleed: strikes.reduce((n, x) => n + x.bleed, 0),
    prevented: strikes.reduce((n, x) => n + x.prevented, 0),
    damage: strikes.reduce((n, x) => n + x.damage, 0),
  }
}
const distributions = new Map()
function distribution(fighter) {
  const key = fighter.isAI
    ? `enemy:${fighter.accuracy}:${fighter.criticalChance}`
    : 'player'
  if (distributions.has(key)) return distributions.get(key)
  let result
  if (fighter.isAI)
    result = [
      ['block', 1 - fighter.accuracy / 100],
      ['critical', (fighter.accuracy * fighter.criticalChance) / 10000],
      ['hit', (fighter.accuracy / 100) * (1 - fighter.criticalChance / 100)],
    ]
  else {
    const counts = { block: 0, hit: 0, critical: 0 }
    for (let h = 1; h <= 12; h++)
      for (let f = 1; f <= 12; f++)
        counts[h === f ? 'critical' : h + f >= 12 ? 'hit' : 'block']++
    result = Object.entries(counts).map(([k, n]) => [k, n / 144])
  }
  if (distributions.size >= 1000) distributions.clear()
  result = Object.freeze(result.map((row) => Object.freeze(row)))
  distributions.set(key, result)
  return result
}
// Exact convolution conditional on the main critical; independent strike rolls
// never change the target's Stress or the attack's resource income.
const previews = new Map()
function preview(fighter, target, slot, choice, mainBranches) {
  const key = JSON.stringify([
    fighter.attack,
    fighter.isAI,
    fighter.accuracy,
    fighter.criticalChance,
    fighter.level,
    fighter.abilityRanks?.[slot],
    target.hp,
    target.stress,
    target.maxStress,
    Boolean(target.bleeding),
    target.passive,
    target.brinkUsed,
    slot,
    choice,
  ])
  if (previews.has(key)) return previews.get(key)
  const count = config.basic.strikes + (slot === 'special2' ? 3 : 0)
  const bleeding = slot === 'special1' || (target.bleeding?.remaining || 0) > 0
  let expected = 0,
    knockout = 0,
    minimum = Infinity
  for (const [, mainCritical, mainChance] of mainBranches) {
    const stress =
      mainCritical && target.maxStress > 0
        ? Math.max(0, target.stress - 1)
        : target.stress
    const multiplier = exhausted(target, stress) ? exhaustedStressMultiplier : 1
    const strikeOutcomes = distribution(fighter).map(([outcome, chance]) => [
      strike(fighter, outcome, bleeding, multiplier).damage,
      chance,
    ])
    const guaranteedCritical = [
      [strike(fighter, 'critical', bleeding, multiplier).damage, 1],
    ]
    let mass = new Map([[0, 1]])
    for (let i = 0; i < count; i++) {
      const next = new Map()
      for (const [total, p] of mass)
        for (const [strikeDamage, chance] of i === 0 && mainCritical
          ? guaranteedCritical
          : strikeOutcomes) {
          if (!chance) continue
          const damage = total + strikeDamage
          next.set(damage, (next.get(damage) || 0) + p * chance)
        }
      mass = next
    }
    const definition = slot ? kitFor(fighter)[slot] : null
    const percents =
      slot === 'special3' && fighter.isAI && definition.aiPercent === undefined
        ? Array.from({ length: 11 }, (_, i) => 35 + i)
        : [
            slot === 'special3'
              ? specialPercent(fighter, slot, choice)
              : slot === 'special2'
              ? 6
              : 0,
          ]
    for (const percent of percents)
      for (const [total, p] of mass) {
        const damage =
          total +
          damageFor(
            fighter.attack,
            percent,
            fighter.abilityRanks?.[slot] || 1,
            multiplier
          )
        minimum = Math.min(minimum, damage)
        expected += (damage * p * mainChance) / percents.length
        knockout +=
          (Number(damage >= target.hp) * p * mainChance) / percents.length
      }
  }
  if (require('./passives').brinkAvailable(target)) knockout = 0
  const result = Object.freeze({
    slot,
    expected,
    minimum,
    knockout: Math.min(1, knockout),
    guaranteed: knockout >= 1 - 1e-12,
  })
  if (previews.size >= 50000) previews.clear()
  previews.set(key, result)
  return result
}
module.exports = {
  isHendrix,
  duration,
  nativeOutcome,
  strike,
  sequence,
  distribution,
  preview,
}
