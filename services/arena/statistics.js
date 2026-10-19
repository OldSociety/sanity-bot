const { kitFor, balance } = require('./rules')
const { exhausted } = require('./resources')
const Duality = require('./duality')
const categories = [
  'basic',
  'special1',
  'special2',
  'special3',
  ...(balance.characters['classic-hendrix'] ? ['bleeding'] : []),
]
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
      initial >= Duality.cost(kitFor(fighter).special3) ? 0 : null,
    finisherRounds: [],
    zeroStressRounds: 0,
    vulnerabilityDamageTaken: 0,
  }
}
function createStatistics(player, enemy) {
  return {
    player: fighterStats(player, Duality.label(player), Duality.value(player)),
    enemy: fighterStats(enemy, Duality.label(enemy), Duality.value(enemy)),
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
    if (data.resistanceMetrics) {
      const defender = stats[other]
      defender.superMoveResistance ||= {
        attempts: 0,
        resisted: 0,
        prevented: 0,
      }
      for (const [key, value] of Object.entries(data.resistanceMetrics))
        defender.superMoveResistance[key] =
          (defender.superMoveResistance[key] || 0) + value
    }
    if (data.strikeMetrics) {
      row.strikeMetrics ||= {}
      for (const [key, value] of Object.entries(data.strikeMetrics))
        row.strikeMetrics[key] = (row.strikeMetrics[key] || 0) + value
    }
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
    for (const packet of data.damagePackets ||
      (data.damageOrder || categories).map((source) => ({
        source,
        damage: data.damage[source] || 0,
      }))) {
      const applied = Math.min(availableHp, packet.damage)
      row.hpDamageBySource[packet.source] += applied
      availableHp -= applied
    }
    row.generated += data.generated
    row.spent += data.spent
    row.remaining = Duality.value(actor)
    if (actor.passive === 'celestial-alignment') {
      row.selene ||= {
        healingByUse: {},
        wallChecks: 0,
        wallBlocks: 0,
        wallDamagePrevented: 0,
        protectedRounds: 0,
      }
      row.selene.alignmentStacks = actor.alignmentStacks || 0
      row.selene.dualityEarned = actor.dualityEarned || 0
      if (data.uses.special1)
        row.selene.healingByUse[actor.lifeUses] =
          (row.selene.healingByUse[actor.lifeUses] || 0) + (data.healing || 0)
      const wall = details[other].wallMetrics
      if (wall) {
        row.selene.wallChecks += wall.checks
        row.selene.wallBlocks += wall.blocks
        row.selene.wallDamagePrevented += wall.prevented
        row.selene.protectedRounds++
      }
    }
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
      ? `player-first-turns-v12-basic-special-equalized-${balance.profile}`
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
  if (process.env.NODE_ENV === 'development')
    return require('./async-state').appendReport(
      file,
      JSON.stringify({ recordedAt: new Date().toISOString(), ...report }) + '\n'
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
