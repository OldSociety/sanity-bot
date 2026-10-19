const { balance } = require('./rules')
const ruleset = 'block-immediate-critical'
const enabled = () => balance.attackOutcomes === ruleset
const healingOnly = (definition) =>
  definition?.type === 'heal' && definition.rollBasic === false
const isAttack = (definition, slot) =>
  Boolean(
    definition &&
      (['direct', 'combo'].includes(definition.type) || slot === 'special3')
  )
const blockDamage = (normalDamage, type) =>
  require('./damage-types').blockedDamage(normalDamage, type)
const onHitAllowed = (landed, requiresHit = true) => !requiresHit || landed
module.exports = { ruleset, enabled, healingOnly, isAttack, blockDamage, onHitAllowed }
