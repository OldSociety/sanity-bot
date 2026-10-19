// Historical symmetric-critical regression, independent of the new outcome profile.
const loader = require('../../services/arena/balance-config')
const legacyLoad = loader.loadBalance
loader.loadBalance = (...args) => {
  const value = legacyLoad(...args)
  delete value.attackOutcomes
  return value
}
const assert = require('node:assert/strict')
assert.equal(
  require('../../services/arena/rules').balance.criticalEffects,
  true
)
const { newBattle, advance, takeTurn } = require('../../services/arena/combat')
const { resolveCharacter } = require('../../services/arena/characters')
const { actionLines } = require('../../services/arena/interface')
const { preview } = require('../../services/arena/tactics')
const { basicDamage } = require('../../services/arena/damage')
const options = { actor: 'enemy', aiPolicy: 'legacy', rollRecovery: () => 99 }
const enemyCrit = (b) =>
  advance(
    b,
    {},
    () => 1,
    undefined,
    () => 99,
    () => 0,
    () => 0,
    () => 99,
    options
  )

for (const name of ['Marq', 'Maxim', 'Hellfed Marq']) {
  for (const stress of [0, 1, 5, 6]) {
    let b = newBattle(0, {
      character: resolveCharacter(name),
      opponent: 'marq',
    })
    b.enemy.stress = stress
    if (name !== 'Hellfed Marq') b.player.stress = stress
    else b.player.rage = 3
    const next = enemyCrit(b)
    assert.equal(next.enemy.fear, 1)
    assert.equal(next.fearGained, 1)
    assert.equal(next.statistics.enemy.generated, 1)
    assert.equal(next.enemy.stress, Math.min(6, stress + 1))
    assert.equal(
      next.player.stress,
      name === 'Hellfed Marq' ? 0 : Math.max(0, stress - 1)
    )
    assert.equal(
      next.enemyStressRemoved,
      Number(name !== 'Hellfed Marq' && stress > 0)
    )
    assert.equal(next.statistics.enemy.stressRecovered, Number(stress < 6))
    assert.equal(
      next.statistics.player.stressRemovedTaken,
      next.enemyStressRemoved
    )
    if (name === 'Hellfed Marq') assert.equal(next.player.rage, 3)
    assert.equal(
      next.enemyDamage,
      basicDamage(b.enemy, b.player, {
        critical: true,
        targetStress: next.player.stress,
      })
    )
    const log = actionLines(next.history).join(' ')
    assert.match(log, /Gained 1 Fear/)
    if (stress < 6) assert.match(log, /Restored 1 Stress/)
    if (name !== 'Hellfed Marq' && stress > 0)
      assert.match(log, /Removed 1 opponent Stress/)
    if (name === 'Hellfed Marq')
      assert.doesNotMatch(log, /Removed 1 opponent Stress/)

    b = newBattle(0, { character: resolveCharacter(name), opponent: 'marq' })
    b.enemy.stress = 1
    if (name !== 'Hellfed Marq') b.player.stress = stress
    else b.player.rage = 2
    const player = advance(
      b,
      {},
      undefined,
      () => 6,
      undefined,
      undefined,
      undefined,
      () => 99,
      { actor: 'player' }
    )
    assert.equal(player.player.hope, 1)
    assert.equal(player.hopeGained, 1)
    assert.equal(player.enemy.stress, 0)
    assert.equal(
      player.player.stress,
      name === 'Hellfed Marq' ? 0 : Math.min(6, stress + 1)
    )
    if (name === 'Hellfed Marq') assert.equal(player.player.rage, 2)
    assert.match(
      actionLines(player.history).join(' '),
      /Removed 1 opponent Stress/
    )
  }
}
let b = newBattle(6)
b.player.stress = 6
const capped = advance(
  b,
  {},
  undefined,
  () => 6,
  undefined,
  undefined,
  undefined,
  undefined,
  { actor: 'player' }
)
assert.equal(capped.player.hope, 6)
assert.equal(capped.player.stress, 6)

// Recovery and misses are not criticals and cannot invoke these effects.
b = newBattle()
b.player.stress = 3
b.enemy.stress = 3
const miss = advance(
  b,
  {},
  undefined,
  undefined,
  () => 99,
  () => 99,
  () => {
    throw Error('Critical RNG on miss')
  },
  undefined,
  options
)
assert.equal(miss.enemy.stress, 3)
assert.equal(miss.player.stress, 3)
assert.equal(miss.enemy.fear, 0)
const recover = advance(
  b,
  {},
  undefined,
  undefined,
  () => {
    throw Error('AI on recovery')
  },
  undefined,
  undefined,
  undefined,
  { actor: 'enemy', rollRecovery: () => 0 }
)
assert.equal(recover.enemy.stress, 4)
assert.equal(recover.player.stress, 3)
assert.equal(recover.enemy.fear, 0)

// The AI preview includes the same final-Stress removal/exhaustion damage.
b.enemy.accuracy = 100
b.enemy.criticalChance = 100
b.player.stress = 1
assert.equal(preview(b.enemy, b.player).expected, enemyCrit(b).enemyDamage)

// Finisher damage itself never becomes critical; the existing accompanying AI
// basic can still critically hit and grant the one critical-effect package.
b.enemy.fear = 5
const turn = advance(
  b,
  {},
  undefined,
  undefined,
  () => 0,
  () => 0,
  () => 0,
  () => 99,
  { ...options, rollFinisher: () => 40 }
)
assert.equal(turn.statistics.enemy.uses.special3, 1)
assert.equal(turn.enemyStressRemoved, 1)
assert.equal(turn.statistics.enemy.damage.special3, 110)
assert.equal(turn.enemy.fear, 1)
assert.equal(turn.fearGained, 1)
// A critical cannot use its newly earned Fear to pay for the same action.
b = newBattle()
b.enemy.fear = 1
const future = enemyCrit(b)
assert.equal(future.enemySpecial, null)
assert.equal(future.enemy.fear, 2)
b = newBattle()
b.enemy.fear = 4
const newlyAffordable = enemyCrit(b)
assert.equal(newlyAffordable.enemy.fear, 5)
assert.equal(newlyAffordable.statistics.enemy.firstFinisherAffordableRound, 1)
// A full JRPG turn aggregates both the player's Fear roll and the enemy reward.
b = newBattle(0, {
  character: resolveCharacter('Hellfed Marq'),
  opponent: 'maxim',
})
let i = 0
const combined = takeTurn(
  b,
  'special1',
  undefined,
  () => [1, 2][i++],
  () => 99,
  () => 0,
  () => 0,
  () => 99,
  { aiPolicy: 'legacy', rollRecovery: () => 99 }
)
assert.equal(combined.fearGained, 2)
assert.equal(combined.enemy.fear, 2)
assert.equal(combined.statistics.enemy.generated, 2)
assert.equal(combined.player.rage, 1)
