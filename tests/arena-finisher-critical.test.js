const test = require('node:test'), assert = require('node:assert/strict')
const { newBattle, advance } = require('../services/arena/combat')
const { specialDamage } = require('../services/arena/damage')
const { preview } = require('../services/arena/tactics')
const { resolveCharacter } = require('../services/arena/characters')

test('both AI Finishers always hit, never crit and retain exhaustion scaling while their basic can crit', () => {
  for (const opponent of ['marq', 'maxim']) for (const stress of [0, 6]) for (const accuracy of [0, 99]) for (const critical of [0, 99]) {
    const seed = newBattle(0, { opponent }); seed.marq.stress = stress; seed.warrior.fear = 5
    let i = 0
    const result = advance(seed, 'continue', undefined, () => [6, 7][i++], () => 0, () => accuracy, () => critical, () => 99.999, { aiPolicy: 'legacy' })
    const vulnerability = stress === 0 ? 1.25 : 1
    const finisher = Math.ceil(seed.warrior.attack * 0.45 * vulnerability)
    const basic = accuracy === 99 ? 0 : Math.ceil(seed.warrior.attack * 0.0275 * vulnerability * (critical === 0 ? 2 : 1))
    assert.equal(result.statistics.enemy.damage.special3, finisher)
    assert.equal(result.statistics.enemy.hits.special3, 1)
    assert.equal(result.statistics.enemy.damage.basic, basic)
    assert.equal(result.maximDamage, finisher + basic)
    const withoutPenalty = Math.ceil(seed.warrior.attack * 0.45) + (accuracy === 99 ? 0 : Math.ceil(seed.warrior.attack * 0.0275 * (critical === 0 ? 2 : 1)))
    assert.equal(result.statistics.player.vulnerabilityDamageTaken, finisher + basic - withoutPenalty)
  }
})

test('player saved critical doubles only the basic during a successful Finisher', () => {
  for (const name of ['Marq [Spooky]', 'Maxim [Spooky]']) {
    const seed = newBattle(5, { character: resolveCharacter(name) }); seed.marq.criticalReady = true
    let i = 0
    const result = advance(seed, { special3: true, choice: 5 }, undefined, () => [7, 5][i++], () => 99.999, () => 0, () => 99, () => 99.999, { aiPolicy: 'legacy' })
    assert.equal(result.special3Damage, Math.ceil(seed.marq.attack * 55 / 100))
    assert.equal(result.marqDamage, Math.ceil(seed.marq.attack * 0.02 * 2))
    assert.equal(result.marq.criticalReady, false)
  }
})

test('shared previews exclude Finisher critical damage while preserving other AI special criticals', () => {
  const seed = newBattle(), actor = seed.warrior, target = seed.marq
  assert.equal(specialDamage(actor, 'special3', { criticalMultiplier: 2 }).damage, 99)
  assert.equal(specialDamage(actor, 'special1', { criticalMultiplier: 2 }).damage, 53)
  const base = preview(actor, target), s3 = preview(actor, target, 'special3')
  assert.ok(Math.abs(s3.expected - base.expected - 99) < 1e-9)
  target.hp = 100; target.brinkUsed = true
  const uncertain = preview(actor, target, 'special3')
  assert.equal(uncertain.guaranteed, false)
  assert.ok(Math.abs(uncertain.knockout - 0.85) < 1e-9)
})
