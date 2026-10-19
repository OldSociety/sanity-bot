const test = require('node:test'), assert = require('node:assert/strict')
const { newBattle: rawNewBattle, advance: engineAdvance } = require('../services/arena/combat')
const advance = (...args) => engineAdvance(...Array.from({length: 8}, (_, i) => args[i]), { rollRecovery: () => 99.999, aiPolicy: 'legacy', rollFinisher: () => 45 })
// Formula fixtures use a controlled, equal-stat baseline; character defaults have dedicated regression coverage.
function newBattle(hope = 0, options = {}) {
  const battle = rawNewBattle(hope, options), stat = 300 + 30 * ((options.level || 1) - 1)
  for (const fighter of [battle.player, battle.enemy]) { Object.assign(fighter, { hp: stat, maxHp: stat, attack: stat }); if (fighter.passive === 'on-the-brink') fighter.passive = null }
  return battle
}
const { resolveCharacter } = require('../services/arena/characters')
const { simulate } = require('../scripts/arena-balance-report')
const seq = values => { let i = 0; return () => { assert.ok(i < values.length); return values[i++] } }
const step = (battle, action = 'continue', { dice = [6, 7], ability = 99.999, accuracy = 0, critical = 99, effect = 99.999 } = {}) =>
  advance(battle, action, seq([2, 1]), seq(dice), () => ability, () => accuracy, () => critical, () => effect)

test('AI Focus starts ready, spends two Stress on a miss and only AI landed basics recharge it', () => {
  let battle = newBattle()
  assert.equal(battle.enemy.focusHits, 3)
  battle = step(battle, 'continue', { dice: [2, 1], ability: 0, accuracy: 85 })
  assert.equal(battle.enemy.stress, 4); assert.equal(battle.enemy.focusHits, 0)
  assert.equal(battle.statistics.enemy.focusActivations, 1); assert.equal(battle.statistics.enemy.damage.special1, 0)
  battle = step(battle, 'continue', { dice: [7, 5] })
  assert.equal(battle.enemyOutcome, 'hit'); assert.equal(battle.enemy.focusHits, 1)
  for (let i = 2; i <= 3; i++) { battle = step(battle); assert.equal(battle.enemy.focusHits, i) }
  battle = step(battle, 'continue', { dice: [2, 1], ability: 0 })
  assert.equal(battle.enemySpecial, 'special1'); assert.equal(battle.enemy.focusHits, 1)
  assert.equal(battle.statistics.enemy.damage.special1, 36); assert.equal(battle.enemy.stress, 2)
})

test('AI Slayer activates on a miss, waits through unavailable opportunities and delivers exactly three +11% hits', () => {
  const seed = newBattle(); seed.enemy.fear = 2
  let battle = step(seed, 'continue', { ability: 0, accuracy: 85 })
  assert.equal(battle.enemy.slayerCharges, 3); assert.equal(battle.statistics.enemy.uses.special2, 1)
  battle = step(battle, 'continue', { dice: [7, 5], accuracy: 85 })
  assert.equal(battle.enemy.slayerCharges, 3); assert.equal(battle.statistics.enemy.attempts.special2, 1)
  for (let i = 0; i < 3; i++) {
    battle = step(battle); assert.equal(battle.enemy.slayerCharges, 2 - i)
    assert.equal(battle.statistics.enemy.damage.special2, 33 * (i + 1))
  }
  assert.equal(battle.statistics.enemy.slayerChargesConsumed, 3)
  assert.equal(battle.statistics.enemy.hits.special2, 3)
})

test('AI Slayer refresh consumes any old landed charge, discards remaining charges and never stacks', () => {
  const seed = newBattle(); seed.enemy.slayerCharges = 3; seed.enemy.fear = 2
  const refreshed = step(seed, 'continue', { ability: 0 })
  assert.equal(refreshed.enemy.slayerCharges, 3)
  assert.equal(refreshed.enemyDamage, 42); assert.equal(refreshed.statistics.enemy.damage.special2, 33)
  assert.equal(refreshed.statistics.enemy.slayerChargesConsumed, 1)
  assert.equal(refreshed.statistics.enemy.slayerChargesDiscardedOnRefresh, 2)
  const miss = step(seed, 'continue', { ability: 0, accuracy: 85 })
  assert.equal(miss.enemy.slayerCharges, 3); assert.equal(miss.statistics.enemy.slayerChargesDiscardedOnRefresh, 3)
})

test('AI Focus and an existing Slayer charge are attributed separately in the same exchange', () => {
  const seed = newBattle(); seed.enemy.slayerCharges = 2
  const result = step(seed, 'continue', { dice: [2, 1], ability: 0 })
  assert.equal(result.enemyDamage, 78)
  assert.deepEqual(result.statistics.enemy.damage, { basic: 9, special1: 36, special2: 33, special3: 0 })
  assert.equal(result.statistics.enemy.uses.special1, 1); assert.equal(result.statistics.enemy.uses.special2, 0)
  assert.equal(result.enemy.focusHits, 1); assert.equal(result.enemy.slayerCharges, 1)
})

test('both Overwhelm effects apply independently after costs, clamp Stress and preserve per-source HP attribution', () => {
  const seed = newBattle(0, { opponent: 'marq' }); seed.player.stress = 2; seed.enemy.stress = 2
  const both = step(seed, 'special1', { ability: 0, effect: 0 })
  assert.equal(both.player.stress, 0); assert.equal(both.enemy.stress, 0)
  assert.equal(both.stressRemoved, 1); assert.equal(both.enemyStressRemoved, 1)
  assert.equal(both.special1Damage, 15); assert.equal(both.enemyDamage, 27)
  assert.deepEqual(both.statistics.player.hpDamageBySource, { basic: 12, special1: 15, special2: 0, special3: 0 })
  assert.equal(both.statistics.player.stressRemovedTaken, 1); assert.equal(both.statistics.enemy.stressRemovedTaken, 1)
  const missed = step(newBattle(0, { opponent: 'marq' }), 'continue', { ability: 0, accuracy: 85, effect: 0 })
  assert.equal(missed.enemyDamage, 0); assert.equal(missed.enemyStressRemoved, 1)
})

test('actual HP damage caps overkill in basic/buff/direct order without inflating delivered Slayer damage', () => {
  const seed = newBattle(0, { character: resolveCharacter('Maxim [Spooky]') })
  seed.player.slayerCharges = 2; seed.enemy.hp = 1
  const ended = step(seed, 'special1', { dice: [7, 5] })
  assert.equal(ended.status, 'victory'); assert.equal(ended.statistics.player.hpDamage, 1)
  assert.equal(ended.statistics.player.damage.special2, 24)
  assert.deepEqual(ended.statistics.player.hpDamageBySource, { basic: 1, special1: 0, special2: 0, special3: 0 })
  assert.equal(ended.statistics.player.overkill, 62)
  assert.equal(ended.statistics.player.slayerChargesRemaining, 1); assert.equal(ended.player.slayerCharges, 0)
})

test('role comparisons transpose the matchup matrix correctly and missing historical metrics remain unavailable', () => {
  const { compare, metrics } = require('../scripts/arena-audit-report')
  const rows = simulate({ trials: 1, seed: 42 })
  for (const row of rows) { row.player.damage.special1 = row.opponent === 'marq' ? 10 : 20; row.enemy.damage.special1 = row.playerCharacter.startsWith('Marq') ? 30 : 40 }
  const comparisons = compare(rows)
  assert.equal(comparisons.length, 4)
  const players = comparisons.find(row => row.level === 1 && row.role === 'Player' && row.against === 'Maxim')
  assert.equal(players.Marq.special1Damage, 20); assert.equal(players.Maxim.special1Damage, 20)
  const ai = comparisons.find(row => row.level === 1 && row.role === 'AI' && row.against === 'Maxim')
  assert.equal(ai.Marq.special1Damage, 40); assert.equal(ai.Maxim.special1Damage, 40)
  const base = structuredClone(rows[0]); delete base.enemy.hpDamageBySource
  assert.equal(metrics([base], 'enemy').special2HpDamage, null)
  const a = structuredClone(rows[0]), b = structuredClone(rows[0])
  a.enemy.knockoutCount = 1; a.enemy.slayerUnusedAtKnockout = 1
  b.enemy.knockoutCount = 9; b.enemy.slayerUnusedAtKnockout = 3
  assert.equal(metrics([a, b], 'enemy').slayerUnusedAtKnockout, 2.8)
})

test('alternate strategy saves Hope for Finishers and leaves player Special 2 unused', () => {
  const rows = simulate({ trials: 4, seed: 42, strategy: 'save-finisher' })
  assert.ok(rows.every(row => row.player.uses.special2 === 0))
  assert.ok(rows.some(row => row.player.uses.special3 > 0))
  assert.throws(() => simulate({ strategy: 'unrecognized' }), /strategy/)
  for (const row of rows) for (const side of ['player', 'enemy']) {
    const data = row[side]
    assert.ok(Math.abs(Object.values(data.hpDamageBySource).reduce((a, b) => a + b, 0) - data.hpDamage) < 1e-9)
  }
})
