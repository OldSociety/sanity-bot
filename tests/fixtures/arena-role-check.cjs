const assert = require('node:assert/strict')
process.env.NODE_ENV = 'development'
require('./arena-historical-profile.cjs')()
const scenario = process.argv[2]
const { combat, tactics } = require('../../scripts/arena-parity-engine').setup({
  sourceTransform:
    require('../../scripts/arena-role-transform').transformForRole(scenario),
})
const { resolveCharacter } = require('../../services/arena/characters')
const make = () =>
  combat.newBattle(0, {
    character: resolveCharacter('Hendrix'),
    opponent: 'Hendrix',
  })
let checks = 0
const matched = ['matched-rolls', 'both'].includes(scenario)
if (matched) {
  let total = 0,
    crits = 0,
    blocks = 0
  for (let h = 1; h <= 12; h++)
    for (let f = 1; f <= 12; f++) {
      let i = 0
      const b = make(),
        n = combat.advance(
          b,
          {},
          () => 1,
          () => 6,
          () => 99,
          () => 99,
          () => 99,
          () => (([h, f][i++] - 0.5) * 100) / 12,
          { actor: 'enemy', rollRecovery: () => 99 }
        )
      const e = n.history.find((e) => e.kind === 'hit')
      assert.equal(
        e.outcome,
        h === f ? 'critical' : h + f >= 12 ? 'hit' : 'block'
      )
      total += e.damage
      crits += Number(e.outcome === 'critical')
      blocks += Number(e.outcome === 'block')
      checks++
      assert.equal(
        e.damage,
        e.outcome === 'critical' ? 12 : e.outcome === 'block' ? 5 : 6
      )
    }
  const b = make()
  assert(
    Math.abs(tactics.preview(b.enemy, b.player).expected - total / 144) < 1e-9
  )
  assert.equal(crits, 12)
  assert.equal(blocks, 50)
  checks += 3
}
// A lethal first action suppresses the second actor, in either initiative order.
const b = make()
b.player.hp = b.enemy.hp = 1
const n = combat.takeTurn(
  b,
  'basic',
  () => 1,
  () => 6,
  () => 99,
  () => 1,
  () => 99,
  () => 60,
  { rollRecovery: () => 99 }
)
const enemyFirst = ['enemy-first', 'both'].includes(scenario)
assert.equal(n.status, enemyFirst ? 'defeat' : 'victory')
assert.equal(n.statistics[enemyFirst ? 'enemy' : 'player'].attempts.basic, 1)
assert.equal(n.statistics[enemyFirst ? 'player' : 'enemy'].attempts.basic, 0)
assert.equal(n.tick, 1)
checks += 4
console.log(JSON.stringify({ scenario, checks }))
