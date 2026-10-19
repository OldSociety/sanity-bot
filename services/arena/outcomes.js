const { balance } = require('./rules')
const ruleset = 'block-immediate-critical'
const enabled = () => balance.attackOutcomes === ruleset
const isAttack = (definition, slot) =>
  Boolean(
    definition &&
      (['direct', 'combo'].includes(definition.type) || slot === 'special3')
  )
const blockDamage = (normalDamage) => Math.ceil(normalDamage / 4)
const onHitAllowed = (landed, requiresHit = true) => !requiresHit || landed
module.exports = { ruleset, enabled, isAttack, blockDamage, onHitAllowed }
