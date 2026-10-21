const test = require('node:test')
const assert = require('node:assert/strict')
process.env.NODE_ENV = 'development'
const { newBattle, takeTurn, beginFinisher } = require('../services/arena/combat')
const { decide } = require('../services/arena/tactics')
const { resolveCharacter } = require('../services/arena/characters')
const { balance } = require('../services/arena/rules')
const selene = require('../services/arena/selene')

const make = (opponent = 'Azulis', hope = 0) => newBattle(hope, { character: resolveCharacter('Maxim'), opponent })
const choose = (b, draw = 0, context = {}) => decide(b.enemy, b.player, { roll: () => draw, context }).slot
function turn(b, action = 'basic', draw = 0, recovery = 99) {
  let die = 0
  return takeTurn(b, action, () => 2, () => ++die % 2 ? 8 : 7,
    () => draw, () => 0, () => 99, () => 99,
    { rollRecovery: () => recovery, rollBlock: () => 0, rollResistance: () => 0, rollFinisher: () => 40 })
}
function count(b, slot) {
  let n = 0
  for (let draw = 0; draw < 100; draw++) n += Number(choose(b, draw) === slot)
  return n
}

for (const name of ['Azulis', 'Selene']) {
  test(`${name}: full HP, chip damage and HP above 70% never trigger healing`, () => {
    const b = make(name)
    for (const hp of [b.enemy.maxHp, b.enemy.maxHp - 1, Math.ceil(b.enemy.maxHp * .7) + 1]) {
      b.enemy.hp = hp
      for (let draw = 0; draw < 100; draw++) assert.notEqual(choose(b, draw), 'special1')
    }
  })
  test(`${name}: healing chances rise with injury and always leave a chance to wait`, () => {
    const b = make(name)
    b.enemy.hp = Math.floor(b.enemy.maxHp * .7)
    assert.equal(count(b, 'special1'), 40)
    b.enemy.hp = Math.floor(b.enemy.maxHp * .5)
    assert.equal(count(b, 'special1'), 65)
    b.enemy.hp = 10
    assert.equal(count(b, 'special1'), 85)
  })
  test(`${name}: preserve two Stress outside emergencies; allow a useful last-stand heal`, () => {
    const b = make(name)
    b.enemy.hp = Math.floor(b.enemy.maxHp * .6)
    b.enemy.stress = 2
    assert.notEqual(choose(b), 'special1')
    b.enemy.stress = 1
    b.enemy.hp = 10
    assert.equal(choose(b), 'special1')
    assert.notEqual(choose(b, 99), 'special1')
  })
}

test('Selene diminishing heals must still improve survival; no use when the reserve protects better', () => {
  const b = make('Selene')
  b.enemy.hp = Math.floor(b.enemy.maxHp * .3)
  b.enemy.lifeUses = 100
  b.enemy.stress = 1
  b.player.attack = 1000
  assert.notEqual(choose(b), 'special1')
})

test('Azulis refuses a last-Stress heal when exposure costs more survival than healing gains', () => {
  const b = make()
  b.enemy.stress = 1
  b.enemy.hp = Math.floor(b.enemy.maxHp * .3)
  assert.notEqual(choose(b), 'special1')
})

for (const name of ['Kylax', 'Selene']) {
  test(`${name}: defense uses public affordable Hope threats with exact chance boundaries`, () => {
    const b = make(name)
    b.enemy.fear = name === 'Selene' ? 2 : 0
    const slot = name === 'Selene' ? 'special2' : 'special1'
    assert.equal(count(b, slot), 10)
    b.player.hope = 2
    assert.equal(count(b, slot), 45)
    b.player.hope = 5
    assert.equal(count(b, slot), 70)
    assert.notEqual(choose(b, 99), slot)
    b.player.hope = 0
    assert.equal(count(b, slot), 10)
  })
  test(`${name}: affordable Finisher has priority over speculative defense`, () => {
    const b = make(name, 5)
    b.enemy.fear = 5
    assert.equal(choose(b), 'special3')
  })
}

test('Kylax saves Stress, but recognizes Bleeding without reading its hidden duration', () => {
  const b = make('Kylax', 5)
  b.enemy.stress = 2
  assert.equal(count(b, 'special1'), 0)
  b.enemy.stress = 6
  b.player.hope = 0
  b.enemy.bleeding = { remaining: 1 }
  assert.equal(count(b, 'special1'), 60)
  b.enemy.bleeding.remaining = 4
  assert.equal(count(b, 'special1'), 60)
})

test('Selene saves Fear near her Finisher and never refreshes an active wall', () => {
  const b = make('Selene', 5)
  b.enemy.fear = 4
  assert.equal(count(b, 'special2'), 35)
  selene.activateWall(b.enemy, b.player, 1)
  assert.equal(count(b, 'special2'), 0)
})

test('Selene can protect exposed HP without spending any more Stress', () => {
  const b = make('Selene', 5)
  b.enemy.fear = 2
  b.enemy.stress = 0
  assert.equal(count(b, 'special2'), 70)
})

test('both enemy defenses commit once before the player attack and keep their response basic', () => {
  for (const name of ['Kylax', 'Selene']) {
    const b = make(name, 5)
    b.enemy.fear = name === 'Selene' ? 2 : 0
    const n = turn(b)
    const slot = name === 'Selene' ? 'special2' : 'special1'
    const events = n.history.filter(e => e.kind === 'special' && e.actor === b.enemy.name && e.slot === slot)
    assert.equal(events.length, 1)
    assert.equal(n.statistics.enemy.uses[slot], 1)
    assert(n.statistics.enemy.damage.basic > 0)
    assert(n.history.indexOf(events[0]) < n.history.findIndex(e => e.kind === 'hit' && e.actor === b.player.name))
    if (name === 'Selene') {
      assert.equal(n.statistics.enemy.spent, 2)
      assert.equal(n.enemy.fear, 0)
      assert.equal(n.enemy.windWall.startRound, 1)
      assert.equal(n.enemy.windWall.endRound, 3)
      const unprotected = turn(structuredClone(b), 'basic', 99)
      assert(n.playerBasicDamage < unprotected.playerBasicDamage)
    } else {
      assert.equal(n.enemy.stress, 5)
      assert.equal(n.statistics.enemy.stressSpent, 1)
      assert(n.enemy.kylaxMetrics.wardPrevented > 0)
    }
  }
})

test('a declined defense gets no second chance during the response', () => {
  for (const name of ['Kylax', 'Selene']) {
    const b = make(name, 5)
    b.enemy.fear = name === 'Selene' ? 2 : 0
    let draws = 0, die = 0
    const n = takeTurn(b, 'basic', () => 2, () => ++die % 2 ? 8 : 7,
      () => ++draws === 1 ? 99 : 0, () => 0, () => 99, () => 99,
      { rollRecovery: () => 99, rollBlock: () => 99 })
    assert.equal(n.statistics.enemy.uses[name === 'Selene' ? 'special2' : 'special1'], 0)
    assert.equal(draws, 1)
  }
})

test('native Stress recovery replaces a selected defense without paying its costs', () => {
  for (const name of ['Kylax', 'Selene']) {
    const b = make(name, 5)
    b.enemy.stress = 5
    b.enemy.fear = name === 'Selene' ? 2 : 0
    const n = turn(b, 'basic', 0, 0)
    assert.equal(n.enemy.stress, 6)
    assert.equal(n.statistics.enemy.spent, 0)
    assert.equal(n.statistics.enemy.stressSpent, 0)
    assert.equal(n.statistics.enemy.damage.basic, 0)
  }
})

test('a prepaid player Finisher still counts as a visible threat to defense', () => {
  const b = beginFinisher(make('Kylax', 5))
  assert.equal(b.player.hope, 0)
  const n = turn(b, 'special3', 60)
  assert.equal(n.statistics.enemy.uses.special1, 1)
})

test('Selene commits only previously banked Fear and retains new income for later', () => {
  const b = make('Selene', 5)
  b.enemy.fear = 1
  let die = 0
  const n = takeTurn(b, 'basic', () => 2, () => ++die % 2 ? 7 : 8,
    () => 0, () => 0, () => 99, () => 99,
    { rollRecovery: () => 99, rollBlock: () => 99 })
  assert.equal(n.enemy.fear, 2)
  assert.equal(n.statistics.enemy.uses.special2, 0)
  const next = turn(n)
  assert.equal(next.statistics.enemy.uses.special2, 1)
  assert.equal(next.statistics.enemy.spent, 2)
})

test('Selene commitment survives a knockout and invalid commands leave original resources untouched', () => {
  const b = make('Selene', 5)
  b.enemy.fear = 2
  b.enemy.hp = 1
  const snapshot = structuredClone(b)
  const invalid = turn(b, 'invalid')
  assert.equal(invalid, b)
  assert.deepEqual(b, snapshot)
  const n = turn(b)
  assert.equal(n.status, 'victory')
  assert.equal(n.statistics.enemy.spent, 2)
  assert.equal(n.statistics.enemy.uses.special2, 1)
  assert.deepEqual(b, snapshot)
})

test('support percentile input is validated', () => {
  const b = make()
  b.enemy.hp = 100
  for (const draw of [-1, 100, NaN]) assert.throws(() => choose(b, draw), /percentile/)
})

test('development policy is absent from frozen production and legacy balance profiles', () => {
  const { loadBalance } = require('../services/arena/balance-config')
  assert.equal(balance.ai.supportPolicy.enabled, true)
  assert.equal(loadBalance('production').ai.supportPolicy, undefined)
  assert.equal(loadBalance('test').ai.supportPolicy, undefined)
})
