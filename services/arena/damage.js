const { balance, kitFor, specialPercent, damageFor, opportunityBonusPercent, playerCriticalMultiplier, exhaustedStressMultiplier } = require('./rules')

// Shared by exchange resolution and tactical previews. New Slayer charges never
// affect the exchange that activates them.
function basicDamage(fighter, target, { critical = false, buff = true, targetStress = target.stress } = {}) {
  const opportunity = fighter.passive === 'not-good-enough' && fighter.opportunityReady
  const percent = (fighter.isAI ? balance.aiBasicPercent : 2) + (opportunity ? opportunityBonusPercent : 0) +
    (buff && fighter.slayerCharges > 0 ? kitFor(fighter).special2.percent : 0)
  const multiplier = (targetStress === 0 ? exhaustedStressMultiplier : 1) *
    (critical ? fighter.isAI ? fighter.criticalMultiplier : playerCriticalMultiplier : 1)
  return damageFor(fighter.attack, percent, 1, multiplier)
}

function specialDamage(fighter, slot, { total = 0, choice = 3, multiplier = 1, criticalMultiplier = 1, rank = fighter.abilityRanks?.[slot] || 1 } = {}) {
  const definition = kitFor(fighter)[slot]
  const percent = definition.type === 'combo' ? total * specialPercent(fighter, slot) + (definition.flatPercent || 0) : specialPercent(fighter, slot, choice)
  const appliedCritical = slot === 'special3' ? 1 : criticalMultiplier
  return { percent, damage: definition.type === 'buff' ? 0 : damageFor(fighter.attack, percent, rank, multiplier * appliedCritical) }
}

const specialAlwaysHits = (fighter, slot) => Boolean(slot && (!fighter.isAI || slot === 'special3'))
module.exports = { basicDamage, specialDamage, specialAlwaysHits }
