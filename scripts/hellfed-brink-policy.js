// Diagnostic player policy only; no future RNG and no live combat changes.
const { canUse, exhaustedStressMultiplier } = require('../services/arena/rules')
const { basicDamage, specialDamage } = require('../services/arena/damage')
const { exhausted } = require('../services/arena/resources')
const { choose } = require('./hellfed-rage-report')

function chooseBrinkAware(battle, policy = 'narrow') {
  const p = battle.player,
    e = battle.enemy
  const baseline = choose(battle, 'B')
  const ready = (slot) => canUse(p, slot)
  const basic = basicDamage(p, e, { critical: Boolean(p.criticalReady) })
  const multiplier = exhausted(e) ? exhaustedStressMultiplier : 1
  const s2 = specialDamage(p, 'special2', { multiplier }).damage
  const s3 = specialDamage(p, 'special3', { choice: 3, multiplier }).damage
  // A landed basic is enough: spend no Hope. Stoke guarantees that hit when
  // legal; otherwise accept normal basic accuracy rather than an overkill S3.
  if (basic >= e.hp)
    return {
      action: ready('special1') ? 'special1' : 'basic',
      reason: 'cheap-basic-lethal',
      baseline,
    }
  if (ready('special2') && s2 >= e.hp)
    return { action: 'special2', reason: 'cheap-s2-lethal', baseline }
  const unusedBrink = e.passive === 'on-the-brink' && !e.brinkUsed
  if (
    policy === 'aware' &&
    baseline === 'special3' &&
    unusedBrink &&
    s3 >= e.hp
  ) {
    // Whittle with a cheaper action; allow S3 normally after Brink is spent.
    return {
      action: ready('special2')
        ? 'special2'
        : ready('special1')
        ? 'special1'
        : 'basic',
      reason: 'save-finisher-from-brink',
      baseline,
    }
  }
  return { action: baseline, reason: 'baseline', baseline }
}
module.exports = { chooseBrinkAware }
