const test = require('node:test'), assert = require('node:assert/strict')
const { newBattle, advance: engineAdvance } = require('../services/arena/combat')
const advance = (...args) => engineAdvance(...Array.from({length: 8}, (_, i) => args[i]), { aiPolicy: 'legacy' })
const { statsForLevel } = require('../services/arena/rules')
const { resolveCharacter } = require('../services/arena/characters')
const { screen } = require('../services/arena/interface')
const { simulate } = require('../scripts/arena-balance-report')

for (const level of [1]) test(`character defaults and both combat roles scale correctly at level ${level}`, () => {
  const gain = (level - 1) * 30
  for (const player of ['marq', 'maxim']) for (const opponent of ['marq', 'maxim']) {
    const name = player === 'marq' ? 'Marq' : 'Maxim'
    const character = resolveCharacter(`${name} [Spooky]`)
    const battle = newBattle(0, { level, character, opponent })
    for (const [fighter, kit] of [[battle.player, player], [battle.enemy, opponent]]) {
      assert.equal(fighter.attack, (kit === 'marq' ? 200 : 220) + gain)
      assert.equal(fighter.hp, (kit === 'marq' ? 260 : 220) + gain)
      assert.equal(fighter.maxHp, fighter.hp)
      assert.equal(fighter.rank, 1)
    }
    const lobby = screen({ id: 'test', revision: 0, level, character, opponent })
    const description = lobby.embeds[0].data.description
    assert.ok(description.includes(`${name}: ${battle.player.maxHp} HP · ${battle.player.attack} Attack`))
    assert.ok(description.includes(`${opponent === 'marq' ? 'Marq' : 'Maxim'}: ${battle.enemy.maxHp} HP · ${battle.enemy.attack} Attack`))
  }
})

test('new default stats drive basic and special damage without changing coefficients', () => {
  const step = (battle, action) => {
    let i = 0
    return advance(battle, action, () => 1, () => [6, 7][i++], () => 99.999, () => 0, () => 99, () => 99.999)
  }
  const marq = step(newBattle(), 'special1')
  assert.equal(marq.marqDamage, 4)
  assert.equal(marq.special1Damage, 8)
  assert.equal(marq.maximDamage, 7)
  assert.equal(marq.marq.hp, 253)
  assert.equal(marq.warrior.hp, 208)
  const maxim = step(newBattle(0, { character: resolveCharacter('Maxim [Spooky]'), opponent: 'marq' }), 'special1')
  assert.equal(maxim.marqDamage, 5)
  assert.equal(maxim.special1Damage, 22)
  assert.equal(maxim.maximDamage, 6)
  assert.equal(maxim.marq.hp, 214)
  assert.equal(maxim.warrior.hp, 233)
  assert.deepEqual(statsForLevel(1, 'spooky-marq'), { level: 1, rank: 1, hp: 260, maxHp: 260, attack: 200 })
})

test('simulations report actual stats and preserve damage, resource and charge accounting', () => {
  const rows = simulate({ trials: 20 })
  assert.equal(rows.length, 4)
  assert.ok(rows.every(row => row.level === 1))
  for (const row of rows) {
    const gain = (row.level - 1) * 30
    assert.equal(row.playerStats.attack, (row.playerCharacter.startsWith('Marq') ? 200 : 220) + gain)
    assert.equal(row.enemyStats.hp, (row.opponent === 'marq' ? 260 : 220) + gain)
    for (const side of ['player', 'enemy']) {
      const result = row[side]
      const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`)
      close(result.generated - result.spent, result.remaining)
      close(6 - result.stressSpent + result.stressRecovered - result.stressRemovedTaken, result.stressRemaining)
      close(result.totalDamage, result.hpDamage + result.overkill)
      const ownStats = side === 'player' ? row.playerStats : row.enemyStats
      close(ownStats.hp + result.hpRestored - result.remainingHp, row[side === 'player' ? 'enemy' : 'player'].hpDamage)
      assert.ok(result.brinkActivations >= 0 && result.brinkActivations <= 1)
      close(Object.values(result.hpDamageBySource).reduce((a, b) => a + b), result.hpDamage)
      if ((side === 'player' ? row.playerCharacter.startsWith('Maxim') : row.opponent === 'maxim')) {
        close(result.uses.special2 * 3, result.slayerChargesConsumed + result.slayerChargesRemaining + result.slayerChargesDiscardedOnRefresh)
      }
    }
  }
})
