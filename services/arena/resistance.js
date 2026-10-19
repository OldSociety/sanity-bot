const { balance, roundDamage } = require('./rules')
const selene = require('./selene')

const enabled = () => balance.superMoveResistance?.enabled === true
const retainedDamage = () => balance.superMoveResistance?.damageMultiplier ?? 1
const playerBlockRates = new Map()
// Native Block belongs to the defender, but its odds come from the incoming
// attack's normal resolution: enemy accuracy, or the player's Duality dice.
function probability(attacker, defender, round) {
  if (!enabled()) return 0
  if (selene.wallActive(defender, round, attacker))
    return (
      require('../../config/arena/characters/arena-spooky-selene-development.json')
        .abilities.special2.blockChance / 100
    )
  if (attacker.isAI) return 1 - attacker.accuracy / 100
  const difficulty = defender.difficulty ?? 12
  if (!playerBlockRates.has(difficulty)) {
    let blocked = 0
    for (let hope = 1; hope <= 12; hope++)
      for (let fear = 1; fear <= 12; fear++)
        blocked += Number(hope !== fear && hope + fear < difficulty)
    playerBlockRates.set(difficulty, blocked / 144)
  }
  return playerBlockRates.get(difficulty)
}
const damage = (amount, resisted) =>
  resisted ? roundDamage(amount * retainedDamage()) : amount
function branches(attacker, defender, round) {
  const chance = probability(attacker, defender, round)
  return [
    [false, 1 - chance],
    [true, chance],
  ].filter(([, weight]) => weight > 0)
}
function resolve(result, attacker, defender, round, roll) {
  if (result.slot !== 'special3' || !enabled()) return
  const chance = probability(attacker, defender, round)
  const value = roll()
  if (!Number.isFinite(value) || value < 0 || value >= 100)
    throw Error('Expected Super Move resistance percentile')
  result.resisted = value < chance * 100
  result.resistanceChance = chance
  result.resistanceSource = selene.wallActive(defender, round, attacker)
    ? 'wind-wall'
    : 'native-block'
  result.damageBeforeResistance = result.damage
  result.damage = damage(result.damage, result.resisted)
  result.resistancePrevented = result.damageBeforeResistance - result.damage
}
module.exports = {
  enabled,
  retainedDamage,
  probability,
  damage,
  branches,
  resolve,
}
