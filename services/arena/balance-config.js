const base = require('../../config/arena/arena-balance.json')
function currentRulesEnabled(environment = process.env.NODE_ENV) {
  const settings = require('../../config/arena/arena-testing.json')
  return (
    environment === 'development' ||
    (environment === 'production' &&
      settings.productionEnabled === true &&
      settings.productionCurrentRules === true)
  )
}
function merge(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value))
      merge((target[key] ??= {}), value)
    else target[key] = structuredClone(value)
  }
  return target
}
function loadBalance(environment = process.env.NODE_ENV) {
  if (environment === 'production' && currentRulesEnabled(environment))
    return structuredClone(
      require('../../config/arena/arena-balance-production.json')
    )
  const balance = structuredClone(base)
  if (environment !== 'development') return balance
  const development = merge(
    balance,
    require('../../config/arena/arena-balance-development.json')
  )
  const { sheets } = require('./character-config')
  for (const sheet of Object.values(sheets)) {
    if (!sheet.enabled) continue
    const key = sheet.identity.kit
    // Stress/Rage use the shared resource rules; these fields feed level scaling.
    const stats = structuredClone(sheet.baseStats)
    delete stats.stress
    development.baseStats[key] = stats
    development.characters[key] = structuredClone(sheet.abilities)
    if (sheet.identity.passive && sheet.passive)
      development.passives[sheet.identity.passive] = structuredClone(
        sheet.passive
      )
  }
  // Both roles read the same build. Only AI resolution metadata can differ.
  for (const name of [
    'template',
    'azulis',
    'hellfed-marq',
    'spooky-marq',
    'maxim',
    'hendrix',
    'selene',
    'kylax',
  ]) {
    const sheet = sheets[name]
    if (!sheet.enabled) continue
    const enemy = structuredClone(sheet.abilities)
    enemy.special3.type = 'aiFinisher'
    merge(enemy, sheet.aiOverrides || {})
    development.ai.characters[sheet.identity.kit] = enemy
  }
  development.damageRules = structuredClone(
    require('./damage-types').proposedRules
  )
  if (development.superMoveResistance?.enabled)
    development.damageRules.final_special_damage.blockedMultiplier =
      development.superMoveResistance.damageMultiplier
  development.damageRounding = 'floor'
  development.manualOpponentSelection = true
  development.offensiveSpecialBasics = true
  development.attackOutcomes = 'block-immediate-critical'
  return development
}
module.exports = { loadBalance, currentRulesEnabled }
