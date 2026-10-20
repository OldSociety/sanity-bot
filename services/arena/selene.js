const config = require('./build-profile').buildFor('selene')
const isSelene = (fighter) => fighter.kit === config.identity.kit
const multiplier = (fighter) =>
  isSelene(fighter)
    ? 1 +
      (Math.min(config.passive.maxStacks, fighter.alignmentStacks || 0) *
        config.passive.stackPercent) /
        100
    : 1
const healPercent = (fighter, ability) =>
  Math.max(
    ability?.minimumHealPercent ?? ability?.healPercent ?? 0,
    (ability?.healPercent || 0) -
      (fighter.lifeUses || 0) * (ability?.healDecay || 0)
  )
const healing = (fighter, ability) =>
  ability?.type === 'heal'
    ? Math.min(
        fighter.maxHp - fighter.hp,
        Math.ceil((fighter.maxHp * healPercent(fighter, ability)) / 100)
      )
    : 0
const wallActive = (defender, round = defender.combatRound || 1, attacker) =>
  Boolean(
    defender.windWall &&
      round >= defender.windWall.startRound &&
      round <= defender.windWall.endRound &&
      (!attacker || defender.windWall.targetKit === attacker.kit)
  )
function wallOutcome(outcome, defender, attacker, round, roll) {
  if (!wallActive(defender, round, attacker)) return outcome
  const p = roll()
  if (!Number.isFinite(p) || p < 0 || p >= 100)
    throw Error('Expected Wind Wall percentile')
  // Replace ordinary Block probability. Preserve native critical results only
  // when the independent wall check lets the attack through.
  return p < config.abilities.special2.blockChance
    ? 'block'
    : outcome === 'critical'
    ? 'critical'
    : 'hit'
}
function wallBranches(branches, defender, attacker, guaranteed = false) {
  if (guaranteed || !wallActive(defender, undefined, attacker)) return branches
  const critical = branches.reduce((n, [, crit, p]) => n + (crit ? p : 0), 0)
  const block = config.abilities.special2.blockChance / 100
  return [
    [0, false, block],
    [1, false, (1 - block) * (1 - critical)],
    [1, true, (1 - block) * critical],
  ]
}
function activateWall(fighter, target, round) {
  fighter.windWall = {
    activationRound: round,
    startRound:
      round + (config.abilities.special2.protectActivationRound ? 0 : 1),
    endRound: round + config.abilities.special2.duration,
    targetKit: target.kit,
  }
}
module.exports = {
  isSelene,
  multiplier,
  healPercent,
  healing,
  wallActive,
  wallOutcome,
  wallBranches,
  activateWall,
}
