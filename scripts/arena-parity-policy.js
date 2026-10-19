const { specialSlots, kitFor, canUse } = require('../services/arena/rules')
const { healthCost } = require('../services/arena/resources')
const { survive } = require('../services/arena/passives')

// Outcome adapters can account for additional survival effects without adding
// character-specific exceptions to action selection. No future RNG is read.
function currentSurvivalOutcome(target) {
  const probe = { ...target, hp: 0 }
  const restored = survive(probe)
  return {
    goal: restored ? 'consume-survival' : 'defeat',
    previewTarget: { ...probe, hp: target.hp },
  }
}
function createPolicy(tactics, survivalOutcome = currentSurvivalOutcome) {
  const fallback = tactics.decide
  return function decide(
    fighter,
    target,
    {
      resource = fighter.isAI ? fighter.fear : fighter.hope,
      choice = 3,
      context = {},
    } = {}
  ) {
    const actor = {
      ...fighter,
      hope: resource,
      ...(fighter.isAI ? { fear: resource } : {}),
    }
    const outcome = survivalOutcome(target)
    const choices = [
      null,
      ...specialSlots.filter((slot) => canUse(actor, slot)),
    ].map((slot) => {
      const definition = slot ? kitFor(actor)[slot] : null
      return {
        slot,
        ...tactics.preview(actor, outcome.previewTarget, slot, choice),
        resourceCost: definition?.hopeCost || 0,
        stressCost: definition?.stressCost || 0,
        hpCost: healthCost(actor, definition),
      }
    })
    const bestChance = Math.max(...choices.map((item) => item.knockout))
    // Avoid chasing tiny unbounded-Combo tails. Prefer maximum immediate
    // outcome reliability; among equally reliable options minimize resource
    // cost, then Stress, then HP, then overkill. Same ordering for both roles.
    if (bestChance >= 0.5) {
      const matching = choices
        .filter((item) => Math.abs(item.knockout - bestChance) < 1e-9)
        .sort(
          (a, b) =>
            a.resourceCost - b.resourceCost ||
            a.stressCost - b.stressCost ||
            a.hpCost - b.hpCost ||
            a.expected - b.expected
        )
      return {
        slot: matching[0].slot,
        reason: `cheapest-reliable-${outcome.goal}`,
        goal: outcome.goal,
        reliability: bestChance,
      }
    }
    return {
      ...fallback(actor, target, {
        resource,
        choice,
        context,
        roll: () => 99.999,
      }),
      goal: 'damage-or-build',
    }
  }
}
module.exports = { createPolicy, currentSurvivalOutcome }
