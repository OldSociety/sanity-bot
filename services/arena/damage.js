const {
  balance,
  kitFor,
  specialPercent,
  damageFor,
  opportunityBonusPercent,
  playerCriticalMultiplier,
  exhaustedStressMultiplier,
} = require('./rules')

const { exhausted, rageValue } = require('./resources')
const { multiplier: alignmentMultiplier } = require('./selene')

// Shared by exchange resolution and tactical previews. New Slayer charges never
// affect the exchange that activates them.
function basicDamage(
  fighter,
  target,
  {
    critical = false,
    buff = true,
    landed = true,
    targetStress = target.stress,
  } = {}
) {
  const opportunity =
    landed && fighter.passive === 'not-good-enough' && fighter.opportunityReady
  const percent =
    (fighter.isAI ? balance.aiBasicPercent : balance.playerBasicPercent) +
    (opportunity ? opportunityBonusPercent : 0) +
    (landed && buff && fighter.slayerCharges > 0
      ? kitFor(fighter).special2.percent
      : 0)
  const multiplier =
    alignmentMultiplier(fighter) *
    (exhausted(target, targetStress) ? exhaustedStressMultiplier : 1) *
    (critical
      ? fighter.isAI
        ? fighter.criticalMultiplier
        : playerCriticalMultiplier
      : 1)
  return damageFor(fighter.attack, percent, 1, multiplier)
}

function specialDamage(
  fighter,
  slot,
  {
    total = 0,
    choice = 3,
    multiplier = 1,
    criticalMultiplier = 1,
    rank = fighter.abilityRanks?.[slot] || 1,
    percent: rolledPercent,
  } = {}
) {
  const definition = kitFor(fighter)[slot]
  const percent =
    (rolledPercent === undefined
      ? undefined
      : rolledPercent +
        (fighter.isAI
          ? rageValue(fighter) * (definition.ragePercent || 0)
          : 0)) ??
    (definition.type === 'combo'
      ? total * specialPercent(fighter, slot) + (definition.flatPercent || 0)
      : specialPercent(fighter, slot, choice))
  const appliedCritical =
    require('./outcomes').enabled() || slot === 'special3'
      ? 1
      : criticalMultiplier
  return {
    percent,
    damage: ['buff', 'heal', 'bleeding', 'windWall'].includes(definition.type)
      ? 0
      : damageFor(
          fighter.attack,
          percent,
          rank,
          multiplier * appliedCritical * alignmentMultiplier(fighter)
        ),
  }
}

const specialAlwaysHits = (fighter, slot) =>
  Boolean(
    slot &&
      (require('./outcomes').enabled()
        ? slot === 'special3'
        : !fighter.isAI || slot === 'special3')
  )
module.exports = { basicDamage, specialDamage, specialAlwaysHits }
