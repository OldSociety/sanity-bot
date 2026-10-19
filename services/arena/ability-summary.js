const {
  kitFor,
  specialPercent,
  finisherPercent,
  opportunityBonusPercent,
  damageFor,
} = require('./rules')
const { healthCost } = require('./resources')
const { brinkHealth } = require('./passives')

function abilityCost(fighter, definition) {
  if (definition.hpCostPercentByRage)
    return `${definition.hpCostPercentByRage.join(' / ')}% max HP`
  const hp = healthCost(fighter, definition)
  const costs = [
    hp && `${hp} HP`,
    definition.stressCost && `${definition.stressCost} Stress`,
    definition.hopeCost && `${definition.hopeCost} Hope`,
  ].filter(Boolean)
  return costs.join(' + ') || 'Free'
}

function abilitySummary(fighter, slot) {
  if (require('./hendrix').isHendrix(fighter)) {
    if (slot === 'special1')
      return 'Apply or refresh Bleeding before three basic strikes. Bleeding lasts 2–4 rounds including this round; remaining duration is hidden. Each strike adds 1% Attack as Bleeding, ignoring Block and doubling on a critical.'
    if (slot === 'special2')
      return 'Six basic strikes total, each 1% Attack with a 2 HP direct-damage minimum after Block, plus a guaranteed noncritical 6% Attack bonus. Active Bleeding adds 1% per strike. A main critical guarantees only the first strike; other strikes resolve independently.'
  }
  const definition = kitFor(fighter)[slot]
  const percent = specialPercent(fighter, slot)
  const damage = damageFor(fighter.attack, percent)
  if (definition.type === 'heal')
    return `Restore ${definition.healPercent}% max HP (${Math.ceil(
      (fighter.maxHp * definition.healPercent) / 100
    )}), capped at missing HP. Includes a basic; healing works even if it is blocked.`
  if (definition.type === 'rage') {
    const costs = (definition.hpCostPercentByRage || []).map((p) =>
      Math.ceil((fighter.maxHp * p) / 100)
    )
    return `Pay ${
      costs.length ? costs.join(' / ') : healthCost(fighter, definition)
    } HP for the next Rage bar; gain 1 Rage (max 3) and make a guaranteed basic. Requires HP above the cost.`
  }
  if (definition.type === 'buff')
    return `Your next ${definition.hits} landed basics gain +${percent}% Attack. Blocked basics keep charges. No basic on activation.`
  if (definition.type === 'combo')
    return `Deal ${
      definition.flatPercent || 0
    }% Attack + ${percent}% per pip. Roll d4s until a roll is lower than the previous; count every roll.`
  if (slot === 'special3') {
    const timeout = finisherPercent(fighter, 0),
      low = finisherPercent(fighter, 1),
      high = finisherPercent(fighter, 5)
    return `Guaranteed Finisher: buttons 1–5 deal ${low}–${high}% Attack; timeout ${timeout}%. Choose within ${
      (definition.responseMs || 5000) / 1000
    }s.${
      definition.ragePercent
        ? ` Add ${definition.ragePercent}% Attack per Rage; Rage is kept.`
        : ''
    }`
  }
  const base = definition.ragePercent
    ? `Deal ${definition.percent}% Attack + ${definition.ragePercent}% per Rage.`
    : `Deal ${percent}% Attack (${damage} damage).`
  return (
    base +
    (definition.stressRemovalChance
      ? ` On hit: ${definition.stressRemovalChance}% chance to remove 1 Stress.`
      : '') +
    (definition.requiredRecharge
      ? ` Recharge: ${definition.requiredRecharge} landed basics; starts ready.`
      : '')
  )
}

function passiveSummary(character, fighter) {
  if (character.passive === 'on-the-brink')
    return `Once per fight, survive lethal damage with 10% max HP (${brinkHealth(
      fighter
    )} HP).`
  if (character.passive === 'not-good-enough')
    return `After an opponent's basic fails, your next landed basic gains +${opportunityBonusPercent}% Attack. Does not stack.`
  if (character.passive === 'hellfed')
    return 'Uses Rage instead of Stress; no Stress vulnerability. Failed basics lose 1 Rage.'
  return ''
}
module.exports = { abilityCost, abilitySummary, passiveSummary }
