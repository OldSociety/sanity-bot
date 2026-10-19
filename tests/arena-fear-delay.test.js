const test = require('node:test'),
  assert = require('node:assert/strict')
process.env.NODE_ENV = 'development'
const { newBattle, takeTurn, advance } = require('../services/arena/combat')
const { screen } = require('../services/arena/interface')
const { balance } = require('../services/arena/rules')
function make(fear, hp = 200) {
  const b = newBattle(6, { opponent: 'marq' })
  b.enemy.fear = fear
  b.enemy.stress = 0 // S1 cannot hide the Hope/Fear ability decision.
  b.player.attack = 100
  b.player.hp = hp
  return b
}
function turn(
  b,
  policy = 'legacy',
  dice = [2, 7],
  spend = 0,
  critical = 99,
  action = 'basic'
) {
  let i = 0,
    j = 0
  return takeTurn(
    b,
    action,
    () => [2, 1][j++ % 2],
    () => dice[i++ % dice.length],
    () => spend,
    () => 0,
    () => critical,
    () => 99,
    { aiPolicy: policy, rollRecovery: () => 99, rollFinisher: () => 40 }
  )
}
for (const policy of ['legacy', 'tactical']) {
  test(`${policy}: 1 Fear becomes visible as 2 before S2 can spend it`, () => {
    const b = make(1, 20),
      n = turn(b, policy)
    assert.notEqual(n.enemySpecial, 'special2')
    assert.equal(n.fearSpent, 0)
    assert.equal(n.enemy.fear, 2)
    assert.match(
      screen({ id: 'fear', revision: 0, battle: n }).embeds[0].data.footer.text,
      /Fear 2\/6/
    )
    const next = turn(n, policy, [7, 6])
    assert.equal(next.enemySpecial, 'special2')
    assert.equal(next.fearSpent, 2)
    assert.equal(next.enemy.fear, 0)
    assert.equal(next.statistics.enemy.generated, 1)
    assert.equal(next.statistics.enemy.spent, 2)
  })
  test(`${policy}: 4 Fear becomes visible as 5 before a Finisher can spend it`, () => {
    const b = make(4),
      n = turn(b, policy, [2, 7], 99.999)
    assert.notEqual(n.enemySpecial, 'special3')
    assert.equal(n.fearSpent, 0)
    assert.equal(n.enemy.fear, 5)
    const next = turn(n, policy, [7, 6])
    assert.equal(next.enemySpecial, 'special3')
    assert.equal(next.fearSpent, 5)
    assert.equal(next.enemy.fear, 0)
  })
}
test('Fear that was already visible remains spendable immediately; new income is retained', () => {
  const n = turn(make(2), 'legacy')
  assert.equal(n.enemySpecial, 'special2')
  assert.equal(n.fearSpent, 2)
  assert.equal(n.fearGained, 1)
  assert.equal(n.enemy.fear, 1)
})
test('enemy critical Fear is awarded once and available on the following turn', () => {
  const b = make(1, 30),
    n = turn(b, 'legacy', [7, 6], 0, 0)
  assert.notEqual(n.enemySpecial, 'special2')
  assert.equal(n.enemy.fear, 2)
  assert.equal(n.enemyCriticalFearGained, 1)
  assert.equal(n.statistics.enemy.generated, 1)
  const next = turn(n, 'legacy', [7, 6])
  assert.equal(next.enemySpecial, 'special2')
  assert.equal(next.enemy.fear, 0)
  assert.equal(
    1 + next.statistics.enemy.generated - next.statistics.enemy.spent,
    next.enemy.fear
  )
})
test('direct simultaneous exchange also excludes its new Duality Fear from spending', () => {
  let i = 0,
    j = 0
  const n = advance(
    make(1),
    {},
    () => [2, 1][j++ % 2],
    () => [2, 7][i++ % 2],
    () => 0,
    () => 0,
    () => 99,
    () => 99,
    { actor: 'exchange', aiPolicy: 'legacy', rollFinisher: () => 40 }
  )
  assert.notEqual(n.enemySpecial, 'special2')
  assert.equal(n.enemy.fear, 2)
})
test('the previous profile remains available without the development rule', () => {
  const old = balance.ai.deferFearSpending
  try {
    balance.ai.deferFearSpending = false
    const n = turn(make(1), 'legacy')
    assert.equal(n.enemySpecial, 'special2')
    assert.equal(n.fearSpent, 2)
    assert.equal(n.enemy.fear, 0)
  } finally {
    balance.ai.deferFearSpending = old
  }
})

test('Stress-funded S1 remains available without waiting for Fear', () => {
  const b = make(0)
  b.enemy.stress = 6
  const n = turn(b)
  assert.equal(n.enemySpecial, 'special1')
  assert.equal(n.fearSpent, 0)
  assert.equal(n.enemy.fear, 1)
})
test('player special activations use the same starting-Fear budget for the response', () => {
  const n = turn(make(1), 'legacy', [2, 7], 0, 99, 'special1')
  assert.notEqual(n.enemySpecial, 'special2')
  assert.equal(n.enemy.fear, 2)
})
test('the delay is enabled only in development, preserving frozen production and legacy profiles', () => {
  const { loadBalance } = require('../services/arena/balance-config')
  assert.equal(loadBalance('development').ai.deferFearSpending, true)
  assert.equal(loadBalance('production').ai.deferFearSpending, undefined)
  assert.equal(loadBalance('test').ai.deferFearSpending, undefined)
})
