// Ordered encounter data is separate from fighter sheets and Arena balance.
const firstTower = require('../../config/arena/campaign/tower-01.json')
const TOTAL_TOWERS = 50
function validateTower(tower) {
  if (!tower || !Number.isInteger(tower.number) || tower.number < 1 || tower.number > TOTAL_TOWERS ||
      typeof tower.id !== 'string' || !tower.id || typeof tower.name !== 'string' || tower.name.length > 80 || !tower.name ||
      typeof tower.description !== 'string' || tower.description.length > 500 ||
      !Array.isArray(tower.encounters) || !tower.encounters.length || tower.encounters.length > 10)
    throw Error('Invalid campaign tower')
  const ids = new Set()
  for (const [index, encounter] of tower.encounters.entries()) {
    if (!encounter || typeof encounter.id !== 'string' || !encounter.id || ids.has(encounter.id) ||
        typeof encounter.enemyId !== 'string' || !encounter.enemyId ||
        typeof encounter.name !== 'string' || !encounter.name || encounter.name.length > 80 ||
        !Number.isInteger(encounter.health) || encounter.health < 1 ||
        !Number.isInteger(encounter.damage) || encounter.damage < 0 ||
        encounter.boss !== (index === tower.encounters.length - 1))
      throw Error('Invalid campaign encounter; only the last encounter must be a boss')
    ids.add(encounter.id)
  }
  return tower
}
function loadCatalog(authored = [firstTower]) {
  const numbers = new Set(), ids = new Set()
  for (const tower of authored) {
    validateTower(tower)
    if (numbers.has(tower.number) || ids.has(tower.id)) throw Error('Duplicate campaign tower')
    numbers.add(tower.number)
    ids.add(tower.id)
  }
  return Array.from({ length: TOTAL_TOWERS }, (_, index) => {
    const tower = authored.find(item => item.number === index + 1)
    return tower ? { ...structuredClone(tower), available: true } : {
      id: `tower-${String(index + 1).padStart(2, '0')}`, number: index + 1,
      name: `Tower ${index + 1}`, description: 'Coming soon', available: false, encounters: [],
    }
  })
}
module.exports = { TOTAL_TOWERS, validateTower, loadCatalog }
