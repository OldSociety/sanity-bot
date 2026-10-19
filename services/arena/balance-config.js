const base = require('../../config/arena-balance.json')
function merge(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value))
      merge((target[key] ??= {}), value)
    else target[key] = structuredClone(value)
  }
  return target
}
function loadBalance(environment = process.env.NODE_ENV) {
  const balance = structuredClone(base)
  // Production and ordinary tests always retain the established base config.
  if (environment === 'development') {
    const development = merge(
      merge(balance, require('../../config/arena-balance-development.json')),
      require('../../config/arena-hellfed-development.json')
    )
    const azulis = require('../../config/arena-azulis-development.json')
    merge(development, azulis)
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
    development.manualOpponentSelection = true
    development.attackOutcomes = 'block-immediate-critical'
    return development
  }
  return balance
}
module.exports = { loadBalance }
