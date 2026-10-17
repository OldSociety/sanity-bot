const test = require('node:test'), assert = require('node:assert/strict')
const { newBattle, advance } = require('../services/arena/combat')
const { decide, preview, survival, comboTail, rates } = require('../services/arena/tactics')
const { selectEnemySpecial } = require('../services/arena/rules')
const { resolveCharacter } = require('../services/arena/characters')
const actors = opponent => { const b = newBattle(0, { opponent }); b.marq.brinkUsed = true; b.warrior.brinkUsed = true; return [b.warrior, b.marq] }
const choose = (actor, target, options = {}) => decide(actor, target, { roll: () => 99.999, ...options })

test('continuing-d4 exact tails include the stopping roll and have no cap', () => {
  assert.equal(comboTail(3), 1)
  assert.equal(comboTail(4), 15 / 16)
  assert.ok(comboTail(100) > 0)
  assert.ok(comboTail(101) < comboTail(100))
  assert.equal(rates.fear.toFixed(6), (66 / 144).toFixed(6))
})

test('AI lethal-if-hit previews preserve miss and critical probabilities', () => {
  const [actor, target] = actors('maxim'); target.hp = 34
  const hit = preview(actor, target, 'special1')
  assert.equal(hit.minimum, 0); assert.equal(hit.guaranteed, false)
  assert.ok(Math.abs(hit.knockout - 0.85) < 1e-12)
  target.hp = 35
  assert.ok(Math.abs(preview(actor, target, 'special1').knockout - 0.0425) < 1e-12)
})

test('player specials can guarantee a knockout despite a missed accompanying basic', () => {
  const b = newBattle(); b.warrior.hp = 8
  const result = choose(b.marq, b.warrior)
  assert.equal(result.slot, 'special1'); assert.equal(result.reason, 'knockout')
  assert.equal(result.guaranteedAvailable, true); assert.equal(result.guaranteedTaken, true)
})

test('AI prioritizes a guaranteed Finisher over a cheaper Combo that can miss', () => {
  const [actor, target] = actors('marq'); actor.fear = 5; target.hp = 40
  assert.equal(preview(actor, target, 'special3').guaranteed, true)
  assert.equal(preview(actor, target, 'special3').knockout, 1)
  assert.equal(choose(actor, target).slot, 'special3')
  target.hp = 90
  assert.equal(choose(actor, target).slot, 'special3')
})

test('basic lethal-if-hit avoids exhausting Stress for no additional knockout chance', () => {
  const [actor, target] = actors('maxim'); actor.stress = 2; target.hp = 7
  const decision = choose(actor, target)
  assert.equal(decision.slot, null); assert.equal(decision.reason, 'basic-lethal')
})

test('Maxim Slayer is delayed, and refreshing three active charges has no new value', () => {
  const [actor, target] = actors('maxim'); actor.fear = 3
  assert.deepEqual(preview(actor, target, 'special2'), { ...preview(actor, target), slot: 'special2' })
  actor.slayerCharges = 3
  const decision = choose(actor, target)
  assert.equal(decision.slot, null); assert.equal(decision.avoidedRefresh, true)
  actor.slayerCharges = 0; actor.stress = 0; actor.hp = 1
  assert.equal(choose(actor, target).slot, null)
})

test('both kits avoid costly final Stress when survival is comfortable', () => {
  for (const kit of ['marq', 'maxim']) {
    const [actor, target] = actors(kit); actor.stress = kit === 'marq' ? 1 : 2
    const decision = choose(actor, target, { roll: () => 0 })
    assert.equal(decision.slot, null); assert.equal(decision.avoidedExhaustion, true)
    actor.hp = 1
    assert.equal(choose(actor, target).slot, 'special1')
  }
})

test('Maxim can exhaust two Stress to pursue a lethal hit, but cannot ignore recharge', () => {
  const [actor, target] = actors('maxim'); actor.stress = 2; target.hp = 30
  const decision = choose(actor, target)
  assert.equal(decision.slot, 'special1'); assert.equal(decision.exhaustedForKnockout, true)
  actor.focusHits = 2
  assert.equal(choose(actor, target).slot, null)
})

test('Overwhelm distinguishes the final enemy Stress from other reserves', () => {
  const [actor, target] = actors('marq'); target.stress = 1
  assert.equal(choose(actor, target).reason, 'strip-final-stress')
  target.stress = 6
  assert.equal(choose(actor, target).slot, null)
})

test('Fear saving considers time to five; direct Combo is spent when survival is limited', () => {
  const [actor, target] = actors('marq'); actor.fear = 3
  assert.equal(choose(actor, target).savedForFinisher, true)
  actor.hp = 1; actor.stress = 0
  const decision = choose(actor, target)
  assert.equal(decision.slot, 'special2'); assert.equal(decision.reason, 'limited-survival')
})

test('available Finisher is spent even before lethal range and accepts configurable player choices', () => {
  const b = newBattle(5, { character: resolveCharacter('Maxim [Spooky]') })
  assert.equal(choose(b.marq, b.warrior, { choice: 0 }).slot, 'special3')
  assert.ok(preview(b.marq, b.warrior, 'special3', 5).expected > preview(b.marq, b.warrior, 'special3', 0).expected)
})

test('ordinary AI situations retain the exact original probability partition and one draw', () => {
  const [actor, target] = actors('maxim')
  for (let value = 0; value < 100; value++) {
    let calls = 0
    assert.equal(choose(actor, target, { roll: () => { calls++; return value } }).slot, selectEnemySpecial(actor, 0, () => value))
    assert.equal(calls, 1)
  }
})

test('survival responds to Attack, active buffs, exhaustion and past special output', () => {
  const [actor, target] = actors('maxim'), normal = survival(actor, target)
  assert.ok(survival(actor, { ...target, attack: target.attack * 2 }).own < normal.own)
  assert.ok(survival({ ...actor, stress: 0 }, target).own < normal.own)
  assert.ok(survival(actor, { ...target, kit: 'maxim', slayerCharges: 3 }).own < normal.own)
  assert.ok(survival(actor, target, { rounds: 5, opponentSpecialDamage: 200 }).own < normal.own)
})

test('live combat uses tactical overrides before accuracy rolls, ignores selected player action, and Idle bypasses tactics', () => {
  const seed = newBattle(3); seed.warrior.fear = 5; seed.marq.hp = 90
  const step = (action, accuracy) => { let index = 0; return advance(seed, action, (() => { let i = 0; return () => [2, 1][i++] })(), () => [6, 7][index++], () => 99.999, () => accuracy, () => 99, () => 99.999) }
  const hit = step('continue', 0), miss = step('special2', 99)
  assert.equal(hit.enemySpecial, 'special3'); assert.equal(miss.enemySpecial, 'special3')
  assert.equal(miss.statistics.enemy.damage.special3, 99); assert.equal(miss.fearSpent, 5)
  assert.equal(seed.warrior.fear, 5)
  seed.mode = 'idle'
  assert.equal(step('continue', 0).enemyDecision, null)
})

test('decision audit separates guaranteed player knockouts from lethal-if-hit AI choices', () => {
  const audit = require('../scripts/arena-decision-audit')
  const b = newBattle(); b.warrior.hp = 8
  const missed = audit.empty()
  audit.record(missed, b.marq, b.warrior, 0, { slot: null })
  assert.equal(missed.guaranteedAvailable, 1); assert.equal(missed.guaranteedMissed, 1)
  const taken = audit.empty()
  audit.record(taken, b.marq, b.warrior, 0, choose(b.marq, b.warrior))
  assert.equal(taken.guaranteedTaken, 1); assert.equal(taken.guaranteedMissed, 0)
  b.marq.hp = 30; b.marq.brinkUsed = true
  const ai = audit.empty()
  audit.record(ai, b.warrior, b.marq, 0, choose(b.warrior, b.marq))
  assert.equal(ai.guaranteedAvailable, 0); assert.equal(ai.lethalOnHitAvailable, 1); assert.equal(ai.lethalOnHitTaken, 1)
})

test('knockout attribution credits direct Focus after a Slayer charge, excluding overkill', () => {
  const audit = require('../scripts/arena-decision-audit')
  for (const [hp, source] of [[1, 'basic'], [10, 'special2'], [30, 'special1']]) {
    const seed = newBattle(0, { character: resolveCharacter('Maxim [Spooky]') })
    seed.marq.slayerCharges = 3; seed.warrior.hp = hp
    let index = 0
    const result = advance(seed, 'special1', undefined, () => [7, 5][index++], () => 99.999, () => 0, () => 99, () => 99.999, { aiPolicy: 'legacy' })
    const row = audit.empty(); audit.knockout(row, seed, result, 'player')
    assert.equal(row.knockoutSources[source], 1)
    assert.equal(Object.values(row.knockoutSources).reduce((a, b) => a + b), 1)
  }
})
