// Named packet rules. Production keeps its frozen profile until deployed.
const basic_damage = 'basic_damage'
const special_damage = 'special_damage'
const final_special_damage = 'final_special_damage'
const bleed_damage = 'bleed_damage'
const proposedRules = Object.freeze({
  [basic_damage]: Object.freeze({ blockedMultiplier: 0.75, canCritical: true }),
  [special_damage]: Object.freeze({
    blockedMultiplier: 0.5,
    canCritical: false,
  }),
  [final_special_damage]: Object.freeze({
    blockedMultiplier: 1,
    canCritical: false,
  }),
  [bleed_damage]: Object.freeze({ blockedMultiplier: 1, canCritical: true }),
})
function blockedDamage(damage, type = special_damage) {
  if (!Object.hasOwn(proposedRules, type)) throw Error('Unknown damage type')
  const profile = require('./rules').balance.damageRules
  const multiplier =
    profile?.[type]?.blockedMultiplier ??
    ([bleed_damage, final_special_damage].includes(type) ? 1 : 0.25)
  return require('./rules').roundDamage(damage * multiplier)
}
module.exports = {
  basic_damage,
  special_damage,
  final_special_damage,
  bleed_damage,
  proposedRules,
  blockedDamage,
}
