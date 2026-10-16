const { randomInt } = require('node:crypto')
const { abilities, statsForLevel, abilityAvailable, damageFor, exhaustedStressMultiplier, opportunityMultiplier, playerCriticalMultiplier, enemyAttackStats, enemyAttackOutcome } = require('./rules')
const percentile = () => randomInt(0, 100)

const newBattle = (hope = 0, { mode = 'active', character, level = 1 } = {}) => ({ tick: 0, mode,
  marq: { ...statsForLevel(level), passive: character?.passive || null, opportunityReady: false, criticalReady: false,
    abilityRanks: { combo: 1, hope: 1, third: 1 }, stress: 6, maxStress: 6, hope, maxHope: 6, name: character?.name || 'Marq', label: character?.label || 'Marq [Spooky]' },
  warrior: { ...statsForLevel(level), ...enemyAttackStats, passive: 'opportunity', opportunityReady: false,
    stress: 6, maxStress: 6, name: 'Maxim', difficulty: 12, fear: 0 }, status: 'playing', rolls: [], bonus: 0,
  duality: null, marqDamage: 0, maximDamage: 0, hopeDamage: 0, thirdDamage: 0, hopeSpent: 0, hopeGained: 0,
  fearGained: 0, fearSpent: 0, fearAttack: null, enemyOutcome: null, stressLost: 0, stressRestored: 0, tiedVictory: false,
  latestCombo: null, recentRolls: [], actions: [], history: [] })

function dualityDice(difficulty = 12, roll = () => randomInt(1, 13)) {
  const hope = roll(), fear = roll()
  if (![hope, fear].every(value => Number.isInteger(value) && value >= 1 && value <= 12)) throw new Error('Expected d12 results from 1 to 12')
  const total = hope + fear, critical = hope === fear
  const success = critical || total >= difficulty
  return { hope, fear, total, difficulty, critical, success, withHope: hope >= fear, withFear: fear > hope }
}

function comboDice(roll = () => randomInt(1, 5)) {
  const rolls = []
  let total = 0
  while (true) {
    const value = roll()
    if (!Number.isInteger(value) || value < 1 || value > 4) throw new Error('Expected a d4 result from 1 to 4')
    const predecessor = rolls.at(-1)
    rolls.push(value)
    total += value // Include the stopping roll too; equal rolls always continue.
    if (predecessor !== undefined && value < predecessor) return { rolls, total }
  }
}

// One automatic exchange. Ability costs use the pre-roll resource snapshot:
// Hope earned this tick cannot fund an already queued action retroactively.
function advance(battle, action, roll, rollDuality, rollFearSpend = percentile, rollAccuracy = percentile, rollCritical = percentile) {
  if (battle.status !== 'playing') return battle
  const selected = typeof action === 'object' && action !== null ? action
    : action === 'continue' ? {} : ['combo', 'hope', 'third'].includes(action) ? { [action]: true } : null
  if (!selected || Object.keys(selected).some(key => !['combo', 'hope', 'third'].includes(key)) ||
    ['combo', 'hope', 'third'].filter(key => selected[key]).length > 1 ||
    (selected.combo && (!abilityAvailable(battle.marq, 'combo') || battle.marq.stress <= 0)) ||
    (selected.hope && (!abilityAvailable(battle.marq, 'hope') || battle.marq.hope < abilities.hope.hopeCost)) ||
    (selected.third && (!abilityAvailable(battle.marq, 'third') || battle.marq.hope < abilities.third.hopeCost))) return battle
  if (battle.mode === 'idle' && (selected.combo || selected.hope || selected.third)) return battle
  const duality = dualityDice(battle.warrior.difficulty, rollDuality)
  const combo = selected.combo ? comboDice(roll) : { rolls: [], total: 0 }
  const hopeSpent = selected.third ? abilities.third.hopeCost : selected.hope ? abilities.hope.hopeCost : 0
  const hopeAfterSpend = battle.marq.hope - hopeSpent
  const hopeGained = duality.withHope ? Math.min(1, battle.marq.maxHope - hopeAfterSpend) : 0
  const fearGained = Number(duality.withFear)
  const availableFear = battle.warrior.fear + fearGained
  const maximAttacks = !duality.success || duality.withFear
  let fearSpent = 0, fearAttack = null
  if (battle.mode !== 'idle' && maximAttacks && availableFear > 0) {
    const chance = rollFearSpend()
    if (!Number.isInteger(chance) || chance < 0 || chance > 99) throw new Error('Expected Fear spending percentile from 0 to 99')
    fearAttack = chance < 40 ? 'heavy' : chance < 70 ? 'stress' : null
    fearSpent = Number(fearAttack !== null)
  }
  const comboCost = Number(Boolean(selected.combo))
  const stressAfterCombo = battle.marq.stress - comboCost
  const stressRestored = duality.critical ? Math.min(1, battle.marq.maxStress - stressAfterCombo) : 0
  const stressAfterCritical = stressAfterCombo + stressRestored
  const enemyOutcome = maximAttacks ? enemyAttackOutcome(battle.warrior, rollAccuracy, rollCritical) : null
  const enemyHit = enemyOutcome === 'hit' || enemyOutcome === 'critical'
  const stressLost = enemyHit && fearAttack === 'stress' ? Math.min(1, stressAfterCritical) : 0
  const remainingStress = stressAfterCritical - stressLost
  // Stress spending/recovery resolves before this tick's damage. Round each hit
  // up after multiplying, as requested; never introduce fractional HP.
  const marqMultiplier = remainingStress === 0 ? exhaustedStressMultiplier : 1
  const maximMultiplier = battle.warrior.stress === 0 ? exhaustedStressMultiplier : 1
  const playerOpportunity = battle.marq.passive === 'opportunity' && battle.marq.opportunityReady && duality.success
  const enemyOpportunity = battle.warrior.passive === 'opportunity' && battle.warrior.opportunityReady && enemyHit && !fearAttack
  // Only a bonus saved before this tick can be consumed. A new critical success
  // readies the following landed basic hit; repeated criticals never stack.
  const playerCritical = Boolean(battle.marq.criticalReady && duality.success)
  const marqDamage = damageFor(battle.marq.attack, duality.success ? 2 : 0, 1,
    maximMultiplier * (playerOpportunity ? opportunityMultiplier : 1) * (playerCritical ? playerCriticalMultiplier : 1))
  const bonus = damageFor(battle.marq.attack, combo.total * abilities.combo.percent, battle.marq.abilityRanks.combo, maximMultiplier)
  const hopeDamage = damageFor(battle.marq.attack, selected.hope ? abilities.hope.percent : 0, battle.marq.abilityRanks.hope, maximMultiplier)
  const thirdDamage = damageFor(battle.marq.attack, selected.third ? abilities.third.percent : 0, battle.marq.abilityRanks.third, maximMultiplier)
  const criticalMultiplier = enemyOutcome === 'critical' ? battle.warrior.criticalMultiplier : 1
  const maximDamage = enemyHit ? damageFor(battle.warrior.attack, fearAttack === 'heavy' ? 10 : fearAttack === 'stress' ? 6 : 2, 1,
    marqMultiplier * criticalMultiplier * (enemyOpportunity ? opportunityMultiplier : 1)) : 0
  const marq = { ...battle.marq, hp: Math.max(0, battle.marq.hp - maximDamage),
    stress: remainingStress, hope: hopeAfterSpend + hopeGained,
    criticalReady: duality.critical || Boolean(battle.marq.criticalReady && !playerCritical),
    opportunityReady: battle.marq.passive === 'opportunity' && (enemyOutcome === 'miss' || (battle.marq.opportunityReady && !playerOpportunity)) }
  const warrior = { ...battle.warrior, hp: Math.max(0, battle.warrior.hp - marqDamage - bonus - hopeDamage - thirdDamage), fear: availableFear - fearSpent,
    opportunityReady: battle.warrior.passive === 'opportunity' && (!duality.success || (battle.warrior.opportunityReady && !enemyOpportunity)) }
  const tiedVictory = marq.hp === 0 && warrior.hp === 0
  const status = warrior.hp === 0 ? 'victory' : marq.hp === 0 ? 'defeat' : 'playing'
  const tick = battle.tick + 1
  const playerName = battle.marq.name === 'Maxim' ? 'Your Maxim' : battle.marq.name
  const events = [
    { kind: 'roll', tick, ...duality, hopeGained, stressRestored },
    { kind: 'hit', tick, actor: playerName, target: 'Maxim', damage: marqDamage, outcome: playerCritical ? 'critical' : duality.success ? 'hit' : 'miss' },
  ]
  if (maximAttacks) events.push({ kind: 'hit', tick, actor: 'Maxim', target: playerName, damage: maximDamage, outcome: enemyOutcome, fearSpent, stressLost })
  if (selected.combo) events.push({ kind: 'combo', tick, damage: bonus, rolls: combo.rolls, total: combo.total })
  if (selected.hope) events.push({ kind: 'hope', tick, damage: hopeDamage })
  if (selected.third) events.push({ kind: 'third', tick, damage: thirdDamage, hopeSpent })
  return { tick, mode: battle.mode, marq, warrior, status, rolls: combo.rolls, bonus,
    duality, marqDamage, maximDamage, hopeDamage, thirdDamage, hopeSpent, hopeGained, fearGained, fearSpent,
    fearAttack, enemyOutcome, stressLost, stressRestored, tiedVictory,
    latestCombo: selected.combo ? { tick, rolls: combo.rolls, total: combo.total, damage: bonus } : battle.latestCombo,
    recentRolls: [...battle.recentRolls, { ...duality, tick }].slice(-3),
    actions: [...battle.actions, ...events].slice(-5), history: [...battle.history, ...events] }
}

module.exports = { newBattle, comboDice, dualityDice, advance }
