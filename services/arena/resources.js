// Resource adapters keep Rage independent from Stress and exhaustion.
/** @param {{ kit?: string }} fighter */
const usesRage = (fighter) => fighter.kit === 'hellfed-marq'
const hasStress = (fighter) => !usesRage(fighter)
const exhausted = (fighter, stress = fighter.stress) =>
  hasStress(fighter) && stress === 0
const rageValue = (fighter) => Math.max(0, Math.min(3, fighter.rage || 0))
/** @returns {number} Whole HP sacrificed, calculated from maximum HP. */
const healthCost = (fighter, definition) =>
  definition?.hpCostPercentByRage || definition?.hpCostPercent
    ? Math.ceil(
        (fighter.maxHp *
          (definition.hpCostPercentByRage?.[Math.min(2, rageValue(fighter))] ??
            definition.hpCostPercent)) /
          100
      )
    : definition?.hpCost || 0
/** @returns {{ label: string, value: number, max: number }} */
const resourceMeter = (fighter) =>
  usesRage(fighter)
    ? { label: 'Rage', value: rageValue(fighter), max: 3 }
    : { label: 'Stress', value: fighter.stress, max: fighter.maxStress }
module.exports = {
  usesRage,
  hasStress,
  exhausted,
  rageValue,
  resourceMeter,
  healthCost,
}
