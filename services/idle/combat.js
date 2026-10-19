const config = require('../../config/idle-balance.json')
const { statsForLevel, kitFor, exhaustedStressMultiplier } = require('../arena/rules')
const { basicDamage, specialDamage } = require('../arena/damage')
const { dualityDice, comboDice } = require('../arena/combat')
const { survive, brinkAvailable } = require('../arena/passives')
const { defaultCharacter, resolveCharacter } = require('../arena/characters')

function parseStats(value) {
  const parts = typeof value === 'string' ? value.split(',').map(part => part.trim()) : []
  if (parts.length !== 3 || parts.some(part => !/^\d+$/.test(part)))
    throw new Error('Stats require exactly three comma-separated integers: Power, Technique, Composure (for example 50,30,20). No negatives or decimals.')
  const stats = parts.map(Number)
  if (stats.some(n => !Number.isInteger(n) || n < 0 || n > 100) || stats.reduce((a, b) => a + b, 0) !== 100)
    throw new Error('Power, Technique, Composure must each be 0–100 and total exactly 100.')
  return stats
}
const intervalMs = power => 3000 - power * 10
const stressMultiplier = composure => 1 - composure / 200
const clampStress = (actor, value) => value < 1e-10 ? 0 : Math.min(actor.maxStress, value)
function seededRandom(seed = 1) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}
function rollAction(technique, random = Math.random) {
  const dice = dualityDice(12, () => 1 + Math.floor(random() * 12))
  const converted = dice.withFear && random() < technique * 0.003
  return { ...dice, converted, outcome: dice.critical ? 'Critical' : dice.withHope || converted ? 'Hope' : 'Fear' }
}
const newSummary = () => ({ basic: 0, hopeAbilities: 0, stressAbilities: 0,
  hopeGenerated: 0, hopeSpent: 0, fearGenerated: 0, criticals: 0,
  stressSpent: 0, stressLost: 0, stressRecovered: 0, damageDealt: 0, damageTaken: 0 })
function createCombatant(character, allocation, level = 1) {
  const [power, technique, composure] = parseStats(allocation.join(','))
  const actor = { ...statsForLevel(level, character.kit), characterId: character.id,
    skinId: character.id, name: character.name, label: character.label, kit: character.kit,
    passive: character.passive, brinkUsed: false, opportunityReady: false,
    criticalReady: false, slayerCharges: 0, basicHits: 0,
    hope: 0, maxHope: 6, fear: 0, stress: 6, maxStress: 6,
    abilityRanks: { special1: 1, special2: 1 }, power, technique, composure,
    nextActionAt: intervalMs(power), cooldowns: {}, summary: newSummary() }
  actor.focusHits = kitFor(actor).special1.requiredRecharge || 0
  for (const slot of ['special1', 'special2']) {
    const ability = kitFor(actor)[slot]
    if (!['direct', 'combo', 'buff'].includes(ability.type))
      throw new Error(`Idle needs an explicit automatic adapter for ${character.id}: ${ability.name}`)
  }
  return actor
}
function stressChance(actor, effectiveCost, policy = config.stressPolicy) {
  const chance = policy.base + policy.stressWeight * actor.stress / actor.maxStress +
    policy.missingHealthWeight * (1 - actor.hp / actor.maxHp) -
    (actor.stress - effectiveCost <= 1e-10 ? policy.exhaustionPenalty : 0)
  return Math.max(policy.minimum, Math.min(policy.maximum, chance))
}
function ready(actor, slot, at) {
  const ability = kitFor(actor)[slot]
  return ability && ability.implemented !== false && actor.hope >= (ability.hopeCost || 0) &&
    actor.stress + 1e-10 >= (ability.stressCost || 0) * stressMultiplier(actor.composure) &&
    actor.basicHits >= (ability.requiredHits || 0) && actor.focusHits >= (ability.requiredRecharge || 0) &&
    at >= (actor.cooldowns[slot] || 0)
}
function confirmedLethal(actor, target, slot) {
  const ability = kitFor(actor)[slot]
  // Minimum combo is 2 then 1 (total 3); never sample RNG to predict a kill.
  const damage = specialDamage(actor, slot, { total: ability.type === 'combo' ? 3 : 0,
    multiplier: target.stress === 0 ? exhaustedStressMultiplier : 1 }).damage
  return damage >= target.hp && !brinkAvailable(target)
}
function chooseAction(actor, target, at, random = Math.random, policy = config.stressPolicy) {
  if (ready(actor, 'special2', at)) return 'special2'
  if (ready(actor, 'special1', at)) {
    const cost = (kitFor(actor).special1.stressCost || 0) * stressMultiplier(actor.composure)
    if (confirmedLethal(actor, target, 'special1') || random() < stressChance(actor, cost, policy)) return 'special1'
  }
  return 'basic'
}

// A timestamp is a batch: both due actors select from the same pre-action state.
// Both attacks complete before survival/KO, preserving Arena's player-win tie rule.
function step(battle, random = Math.random, policy = config.stressPolicy) {
  if (battle.status !== 'playing') return battle
  const sides = ['player', 'enemy']
  const at = Math.min(...sides.map(side => battle[side].nextActionAt))
  const due = sides.filter(side => battle[side].nextActionAt === at)
  const plans = due.map(side => {
    const actor = battle[side], target = battle[side === 'player' ? 'enemy' : 'player']
    const slot = chooseAction(actor, target, at, random, policy)
    return { side, actor, target, slot, ability: slot === 'basic' ? null : kitFor(actor)[slot] }
  })
  // Expenditure precedes both the action and its resource roll.
  for (const { actor, ability, slot } of plans) {
    if (!ability) continue
    const cost = (ability.stressCost || 0) * stressMultiplier(actor.composure)
    actor.stress = clampStress(actor, actor.stress - cost)
    actor.hope -= ability.hopeCost || 0
    actor.summary.stressSpent += cost
    actor.summary.hopeSpent += ability.hopeCost || 0
    actor.summary[slot === 'special2' ? 'hopeAbilities' : 'stressAbilities']++
    if (ability.cooldownMs) actor.cooldowns[slot] = at + ability.cooldownMs
  }
  // Existing independent ability Stress damage resolves before hit vulnerability.
  for (const plan of plans) {
    const { ability, target } = plan
    const removal = ability?.stressRemovalChance && random() * 100 < ability.stressRemovalChance ? 1 : 0
    plan.abilityStressLoss = Math.min(target.stress, removal * stressMultiplier(target.composure))
    target.stress = clampStress(target, target.stress - plan.abilityStressLoss)
    target.summary.stressLost += plan.abilityStressLoss
  }
  const resolved = plans.map(plan => {
    const { actor, target, slot, ability } = plan
    let damage, combo
    const criticalBonus = slot === 'basic' && actor.criticalReady
    if (slot === 'basic') {
      damage = basicDamage(actor, target, { critical: actor.criticalReady })
      actor.criticalReady = false
      actor.summary.basic++
      if (actor.slayerCharges > 0) actor.slayerCharges--
      actor.opportunityReady = false
    } else {
      let diceCount = 0
      combo = ability.type === 'combo' ? comboDice(() => {
        if (++diceCount > 512) throw new Error('Combo exceeded diagnostic dice limit')
        return 1 + Math.floor(random() * 4)
      }) : null
      damage = specialDamage(actor, slot, { total: combo?.total || 0,
        multiplier: target.stress === 0 ? exhaustedStressMultiplier : 1 }).damage
      if (ability.type === 'buff') actor.slayerCharges = ability.hits
    }
    const kit = kitFor(actor)
    // Arena recharges Focus on connected actions, including the activating action.
    actor.focusHits = Math.min(kit.special1.requiredRecharge || 0,
      (ability?.requiredRecharge ? 0 : actor.focusHits) + 1)
    actor.basicHits = Math.min(kit.special1.requiredHits || 0,
      (ability?.requiredHits ? 0 : actor.basicHits) + 1)
    const roll = rollAction(actor.technique, random)
    return { ...plan, damage, combo, roll, criticalBonus }
  })
  for (const { actor, target, damage, roll } of resolved) {
    target.hp = Math.max(0, target.hp - damage)
    actor.summary.damageDealt += damage
    target.summary.damageTaken += damage
    if (roll.outcome !== 'Fear') {
      const gain = Math.min(1, actor.maxHope - actor.hope)
      actor.hope += gain
      actor.summary.hopeGenerated += gain
    } else {
      target.fear++
      actor.summary.fearGenerated++ // Fear produced by this actor's rolls, credited to target.
    }
    if (roll.critical) {
      actor.criticalReady = true
      actor.summary.criticals++
      const restored = clampStress(actor, actor.stress + 1) - actor.stress
      actor.stress += restored
      actor.summary.stressRecovered += restored
    }
  }
  for (const { side, actor, target, damage, abilityStressLoss, roll, slot, ability, combo, criticalBonus } of resolved) {
    const loss = Math.min(target.stress, Number(roll.critical) * stressMultiplier(target.composure))
    target.stress = clampStress(target, target.stress - loss)
    target.summary.stressLost += loss
    actor.nextActionAt = at + intervalMs(actor.power)
    battle.log.push({ at, side, slot, name: ability?.name || 'Basic', damage,
      roll, criticalBonus, combo: combo?.rolls, stressLoss: loss + abilityStressLoss })
  }
  for (const side of sides) {
    const actor = battle[side]
    const restored = survive(actor)
    if (restored) battle.log.push({ at, side, event: 'survival', hp: restored })
  }
  battle.elapsedMs = at
  battle.events += due.length
  battle.tiedVictory = battle.player.hp === 0 && battle.enemy.hp === 0
  battle.status = battle.enemy.hp === 0 ? 'victory' : battle.player.hp === 0 ? 'defeat' : 'playing'
  if (battle.status !== 'playing') {
    for (const side of sides) if (battle[side].hp === 0) battle.log.push({ at, side, event: 'KO' })
  }
  return battle
}
function simulate({ character = defaultCharacter, opponent = resolveCharacter('maxim'), level = 1,
  stats = [34, 33, 33], enemyStats = config.enemyStats, random = Math.random,
  policy = config.stressPolicy, maxEvents = config.maxEvents } = {}) {
  const battle = { player: createCombatant(character, stats, level),
    enemy: createCombatant(opponent, enemyStats, level), status: 'playing', elapsedMs: 0,
    tiedVictory: false, events: 0, log: [] }
  while (battle.status === 'playing' && battle.events < maxEvents) step(battle, random, policy)
  if (battle.status === 'playing') battle.status = 'limit'
  return battle
}
module.exports = { parseStats, intervalMs, stressMultiplier, seededRandom, rollAction,
  createCombatant, stressChance, ready, confirmedLethal, chooseAction, step, simulate }
