const test = require('node:test'),
  assert = require('node:assert/strict')
process.env.NODE_ENV = 'development'
const { damageFor, roundDamage, balance } = require('../services/arena/rules')
const types = require('../services/arena/damage-types')
const { newBattle, advance } = require('../services/arena/combat')
const { resolveCharacter } = require('../services/arena/characters')
const { strike } = require('../services/arena/hendrix')
test('all development damage packets round down, including ranks and vulnerability', () => {
  assert.equal(balance.damageRounding, 'floor')
  assert.deepEqual(
    [
      damageFor(199, 3),
      damageFor(199, 3, 2),
      damageFor(199, 3, 1, 1.25),
      damageFor(199, 35),
      damageFor(190, 22),
    ],
    [5, 6, 7, 69, 41]
  )
  assert.equal(damageFor(200, 3), 6)
  assert.equal(roundDamage(0.9999), 0)
  assert.equal(roundDamage(12.9999), 12)
})
test('Block floors each category without a minimum-one clamp', () => {
  assert.deepEqual(
    [
      types.basic_damage,
      types.special_damage,
      types.final_special_damage,
      types.bleed_damage,
    ].map((t) => types.blockedDamage(3, t)),
    [2, 1, 3, 3]
  )
  assert.equal(types.blockedDamage(1, types.basic_damage), 0)
  assert.equal(types.blockedDamage(1, types.special_damage), 0)
})
test('Hendrix floors direct and Bleeding components independently before Block', () => {
  const f = { attack: 199 }
  assert.deepEqual(
    ['hit', 'block', 'critical'].map((o) => {
      const s = strike(f, o, true)
      return [s.direct, s.bleed]
    }),
    [
      [1, 1],
      [0, 1],
      [3, 3],
    ]
  )
  assert.deepEqual(
    ['hit', 'block', 'critical'].map(
      (o) => strike({ attack: 200 }, o, true).damage
    ),
    [4, 3, 8]
  )
})
test('healing, health costs and survival restoration retain their existing rules', () => {
  const a = newBattle(6, {
    character: resolveCharacter('Azulis'),
    opponent: 'Maxim',
  })
  a.player.hp = 100
  let i = 0
  const n = advance(
    a,
    { special1: true },
    () => 1,
    () => [6, 7][i++],
    () => 99,
    () => 99,
    () => 99,
    () => 99,
    { actor: 'ability' }
  )
  assert.equal(n.player.hp, 114)
  assert.equal(
    require('../services/arena/resources').healthCost(
      { kit: 'hellfed-marq', maxHp: 260, rage: 0 },
      require('../services/arena/rules').kitFor({ kit: 'hellfed-marq' })
        .special1
    ),
    3
  )
  assert.equal(
    require('../services/arena/passives').brinkHealth({ maxHp: 251 }),
    26
  )
})
test('ability copy and exact previews use the same floor damage as combat', () => {
  const b = newBattle(6, {
    character: resolveCharacter('Azulis'),
    opponent: 'Maxim',
  })
  assert.match(
    require('../services/arena/ability-summary').abilitySummary(
      b.player,
      'special2'
    ),
    /41 damage/
  )
  let i = 0
  const n = advance(
    b,
    { special2: true },
    () => 1,
    () => [6, 7][i++],
    () => 99,
    () => 99,
    () => 99,
    () => 99,
    { actor: 'ability' }
  )
  assert.equal(n.special2Damage, 41)
  const h = newBattle(6, {
    character: resolveCharacter('Hendrix'),
    opponent: 'Hendrix',
  })
  const p = require('../services/arena/tactics').preview(
    h.player,
    { ...h.enemy, bleeding: { remaining: 2 } },
    'special2'
  )
  assert.equal(p.minimum, 30)
  assert(
    Math.abs(
      p.expected - (36 + 28 / 12 - 4 / 144 - (50 / 144) * (6 - 1 / 12))
    ) < 1e-10
  )
})
