const { kitFor, balance } = require('./rules')
const { exhausted } = require('./resources')
const categories = ['basic', 'special1', 'special2', 'special3']
const buckets = () => Object.fromEntries(categories.map((key) => [key, 0]))
function fighterStats(fighter, resource, initial) {
  return {
    name: fighter.name,
    level: fighter.level,
    resource,
    damage: buckets(),
    hpDamageBySource: buckets(),
    hpDamage: 0,
    overkill: 0,
    brinkActivations: 0,
    hpRestored: 0,
    attempts: buckets(),
    hits: buckets(),
    uses: buckets(),
    ...(require('./outcomes').enabled()
      ? { blocks: buckets(), criticals: buckets() }
      : {}),
    initial,
    generated: 0,
    spent: 0,
    remaining: initial,
    remainingHp: fighter.hp,
    stressSpent: 0,
    stressRecovered: 0,
    stressRemaining: fighter.stress,
    slayerProgress: 0,
    slayerRequiredHits: 0,
    focusActivations: 0,
    focusRechargeProgress: fighter.focusHits || 0,
    slayerActivations: 0,
    slayerChargesConsumed: 0,
    slayerChargesRemaining: 0,
    slayerChargesDiscardedOnRefresh: 0,
    stressRemoved: 0,
    stressRemovedTaken: 0,
    firstFinisherAffordableRound:
      initial >= kitFor(fighter).special3.hopeCost ? 0 : null,
    finisherRounds: [],
    zeroStressRounds: 0,
    vulnerabilityDamageTaken: 0,
  }
}
function createStatistics(player, enemy) {
  return {
    player: fighterStats(player, 'Hope', player.hope),
    enemy: fighterStats(enemy, 'Fear', enemy.fear),
  }
}
function recordRound(before, next, details) {
  const stats = structuredClone(before.statistics)
  for (const [side, actor, target, other] of [
    ['player', next.player, next.enemy, 'enemy'],
    ['enemy', next.enemy, next.player, 'player'],
  ]) {
    const data = details[side],
      row = stats[side]
    for (const key of categories) {
      row.damage[key] += data.damage[key] || 0
      row.attempts[key] += data.attempts[key] || 0
      row.hits[key] += data.hits[key] || 0
      row.uses[key] += data.uses[key] || 0
      if (row.blocks) row.blocks[key] += data.blocks?.[key] || 0
      if (row.criticals) row.criticals[key] += data.criticals?.[key] || 0
    }
    const previousTarget = side === 'player' ? before.enemy : before.player
    const raw = Object.values(data.damage).reduce(
      (sum, amount) => sum + amount,
      0
    )
    // Prevented knockout HP is restoration, not negative incoming damage.
    const targetHealing = details[other].healing || 0
    const effective = Math.min(previousTarget.hp + targetHealing, raw)
    row.hpDamage += effective
    row.overkill += raw - effective
    let availableHp = previousTarget.hp + targetHealing
    for (const key of data.damageOrder || categories) {
      const applied = Math.min(availableHp, data.damage[key] || 0)
      row.hpDamageBySource[key] += applied
      availableHp -= applied
    }
    row.generated += data.generated
    row.spent += data.spent
    row.remaining = side === 'player' ? actor.hope : actor.fear
    row.remainingHp = actor.hp
    row.hpRestored += data.healing || 0
    if (
      actor.brinkUsed &&
      !(side === 'player' ? before.player : before.enemy).brinkUsed
    ) {
      row.brinkActivations++
      row.hpRestored += actor.hp
    }
    row.stressSpent += data.stressSpent
    row.stressRecovered += data.stressRecovered
    row.stressRemaining = actor.stress
    row.slayerProgress = 0
    row.focusActivations += data.focusActivation || 0
    row.focusRechargeProgress = actor.focusHits || 0
    row.slayerActivations += data.slayerActivation || 0
    row.slayerChargesConsumed += data.slayerConsumed || 0
    row.slayerChargesRemaining = actor.slayerCharges || 0
    row.slayerChargesDiscardedOnRefresh += data.slayerDiscarded || 0
    row.stressRemoved += data.stressRemoved || 0
    stats[other].stressRemovedTaken += data.stressRemoved || 0
    if (row.firstFinisherAffordableRound === null && data.affordable)
      row.firstFinisherAffordableRound = next.tick
    if (data.uses.special3) row.finisherRounds.push(next.tick)
    if (exhausted(actor)) row.zeroStressRounds++
    stats[other].vulnerabilityDamageTaken += data.vulnerabilityExtra
  }
  return stats
}
function combatReport(battle) {
  return {
    ruleset: require('./outcomes').enabled()
      ? `player-first-turns-v11-block-basic-critical-${balance.profile}`
      : balance.profile
      ? `player-first-turns-v9-${balance.profile}`
      : 'player-first-turns-v9',
    playerAttack: battle.player.attack,
    playerMaxHp: battle.player.maxHp,
    opponentAttack: battle.enemy.attack,
    opponentMaxHp: battle.enemy.maxHp,
    character: battle.player.label,
    opponent: battle.enemy.name,
    playerLevel: battle.player.level,
    opponentLevel: battle.enemy.level,
    rounds: battle.tick,
    winner:
      battle.status === 'victory'
        ? 'player'
        : battle.status === 'defeat'
        ? 'enemy'
        : null,
    simultaneousKnockout: battle.tiedVictory,
    mode: battle.mode,
    ...structuredClone(battle.statistics),
  }
}
function saveCombatReport(report) {
  const fs = require('node:fs'),
    path = require('node:path')
  const file = path.resolve(
    __dirname,
    process.env.NODE_ENV === 'production'
      ? '../../artifacts/arena-combat-production.jsonl'
      : '../../artifacts/arena-combat.jsonl'
  )
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(
    file,
    JSON.stringify({ recordedAt: new Date().toISOString(), ...report }) + '\n'
  )
}
module.exports = {
  createStatistics,
  recordRound,
  combatReport,
  saveCombatReport,
}
