// One combat resource, with role-specific storage retained for saved sessions
// and interface compatibility. Dice faces still have their own Hope/Fear names.
const field = (fighter) => (fighter.isAI ? 'fear' : 'hope')
const value = (fighter) => fighter[field(fighter)] ?? 0
const label = (fighter) => (fighter.isAI ? 'Fear' : 'Hope')
const capacity = (fighter) =>
  fighter.maxDuality ??
  (fighter.isAI ? fighter.maxFear : fighter.maxHope) ??
  Infinity
const cost = (ability) => ability?.dualityCost ?? ability?.hopeCost ?? 0
const fields = (fighter, amount) => ({ [field(fighter)]: amount })
const withValue = (fighter, amount) => ({
  ...fighter,
  ...fields(fighter, amount),
})
function spend(fighter, amount) {
  if (!Number.isInteger(amount) || amount < 0 || amount > value(fighter))
    throw Error('Insufficient Duality or invalid cost')
  return withValue(fighter, value(fighter) - amount)
}
function grant(fighter, amount) {
  const granted = Math.max(
    0,
    Math.min(amount, capacity(fighter) - value(fighter))
  )
  let next = withValue(fighter, value(fighter) + granted)
  if (fighter.passive === 'celestial-alignment') {
    const { maxStacks } =
      require('./build-profile').buildFor('selene').passive
    next.alignmentStacks = Math.min(
      maxStacks,
      (fighter.alignmentStacks || 0) + granted
    )
    next.dualityEarned = (fighter.dualityEarned || 0) + granted
  }
  return { fighter: next, granted }
}
module.exports = {
  field,
  fields,
  value,
  label,
  capacity,
  cost,
  withValue,
  grant,
  spend,
}
