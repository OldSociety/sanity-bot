const base = require('../../config/arena-balance.json')
function currentRulesEnabled(environment = process.env.NODE_ENV) {
  const settings = require('../../config/arena-testing.json')
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
  // Freeze the approved production kit independently of later development edits.
  if (environment === 'production' && currentRulesEnabled(environment))
    return structuredClone(
      require('../../config/arena-balance-production.json')
    )
  const balance = structuredClone(base)
  // The owner-authorized production test shares the current development kit.
  // Disabling its rollout flag restores the established production profile.
  if (environment === 'development') {
    const development = merge(
      merge(balance, require('../../config/arena-balance-development.json')),
      require('../../config/arena-hellfed-development.json')
    )
    const azulis = require('../../config/arena-azulis-development.json')
    merge(development, azulis)
    const templates = require('../../config/arena-templates-development.json')
    for (const { kit } of templates.characters) {
      development.baseStats[kit] = structuredClone(templates.baseStats)
      development.characters[kit] = structuredClone(templates.abilities)
      development.ai.characters[kit] = structuredClone(templates.abilities)
      development.ai.characters[kit].special3.type = 'aiFinisher'
    }
    development.ai.characters['classic-azulis'] = structuredClone(
      azulis.characters['classic-azulis']
    )
    development.ai.characters['hellfed-marq'] = structuredClone(
      development.characters['hellfed-marq']
    )
    development.ai.characters['hellfed-marq'].special3.type = 'aiFinisher'
    // Retire old enemy-only damage compensation; retain AI resolution metadata.
    for (const [key, enemy] of Object.entries(development.ai.characters)) {
      const player = development.characters[key]
      if (!player) continue
      for (const slot of ['special1', 'special2', 'special3'])
        for (const field of [
          'percent',
          'flatPercent',
          'percentByLevel',
          'ragePercent',
        ]) {
          if (Object.hasOwn(player[slot], field))
            enemy[slot][field] = structuredClone(player[slot][field])
          else delete enemy[slot][field]
        }
    }
    const hendrix = require('../../config/arena-hendrix-development.json')
    if (hendrix.enabled) {
      const key = hendrix.identity.kit
      development.baseStats[key] = {
        hp: hendrix.baseStats.hp,
        attack: hendrix.baseStats.attack,
      }
      development.characters[key] = structuredClone(hendrix.abilities)
      development.ai.characters[key] = structuredClone(hendrix.abilities)
      development.ai.characters[key].special3.type = 'aiFinisher'
    }
    development.damageRules = structuredClone(
      require('./damage-types').proposedRules
    )
    development.damageRounding = 'floor'
    development.manualOpponentSelection = true
    development.offensiveSpecialBasics = true
    development.attackOutcomes = 'block-immediate-critical'
    return development
  }
  return balance
}
module.exports = { loadBalance, currentRulesEnabled }
