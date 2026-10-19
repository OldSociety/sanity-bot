const test = require('node:test'),
  assert = require('node:assert/strict'),
  { execFileSync } = require('node:child_process')
process.env.NODE_ENV = 'development'
const { newBattle, advance } = require('../services/arena/combat'),
  { resolveCharacter } = require('../services/arena/characters'),
  { balance, kitFor, specialPercent } = require('../services/arena/rules'),
  { healthCost } = require('../services/arena/resources'),
  {
    brinkPercent,
    brinkHealth,
    survive,
  } = require('../services/arena/passives'),
  {
    abilitySummary,
    passiveSummary,
  } = require('../services/arena/ability-summary'),
  { screen } = require('../services/arena/interface'),
  { cardData } = require('../services/arena/health-card'),
  { survival } = require('../services/arena/tactics')
const spooky = require('../config/arena/characters/arena-spooky-marq-development.json'),
  hellfed = require('../config/arena/characters/arena-hellfed-marq-development.json')
for (const [name, sheet] of [
  ['Marq', spooky],
  ['Hellfed Marq', hellfed],
])
  test(`${name}: both roles and every selection/battle stat display use the character sheet`, () => {
    const character = resolveCharacter(name),
      b = newBattle(6, { character, opponent: character.id })
    for (const f of [b.player, b.enemy])
      assert.deepEqual(
        [f.maxHp, f.attack],
        [sheet.baseStats.hp, sheet.baseStats.attack]
      )
    for (const page of ['skins', undefined]) {
      const view = JSON.stringify(
        screen({
          id: 'stats',
          revision: 0,
          character,
          opponent: character.id,
          level: 1,
          page,
        })
      )
      assert(view.includes(`${sheet.baseStats.hp} HP`))
      assert(view.includes(String(sheet.baseStats.attack)))
    }
    for (const f of cardData({ battle: b, character, opponent: character.id })
      .fighters)
      assert.equal(f.maxHp, sheet.baseStats.hp)
    for (const slot of ['special1', 'special2', 'special3']) {
      const player = kitFor(b.player)[slot],
        enemy = kitFor(b.enemy)[slot]
      for (const key of [
        'percent',
        'flatPercent',
        'ragePercent',
        'stressRemovalChance',
        'stressCost',
        'hopeCost',
      ])
        assert.equal(player[key], enemy[key], slot + ' ' + key)
    }
  })
test('Spooky Brink uses the configured percentage once for either combat role', () => {
  const b = newBattle(6, {
    character: resolveCharacter('Marq'),
    opponent: 'marq',
  })
  assert.equal(brinkPercent(), spooky.passive.revivePercent)
  for (const fighter of [b.player, b.enemy]) {
    const expected = Math.ceil(
        (fighter.maxHp * spooky.passive.revivePercent) / 100
      ),
      f = { ...fighter, hp: 0 }
    assert.equal(brinkHealth(f), expected)
    assert.equal(survive(f), expected)
    assert.equal(f.hp, expected)
    f.hp = 0
    assert.equal(survive(f), 0)
    assert(
      passiveSummary(resolveCharacter('Marq'), fighter).includes(
        `${spooky.passive.revivePercent}% max HP (${expected} HP)`
      )
    )
  }
})
test('Brink description and AI survival forecast follow the same configurable percentage', () => {
  const b = newBattle(6, {
      character: resolveCharacter('Marq'),
      opponent: 'Hellfed Marq',
    }),
    original = balance.passives['on-the-brink'].revivePercent,
    old = survival(b.player, b.enemy).own
  try {
    balance.passives['on-the-brink'].revivePercent = 40
    assert.equal(brinkHealth(b.player), Math.ceil(b.player.maxHp * 0.4))
    assert.match(
      passiveSummary(resolveCharacter('Marq'), b.player),
      /40% max HP/
    )
    assert(survival(b.player, b.enemy).own > old)
  } finally {
    balance.passives['on-the-brink'].revivePercent = original
  }
})
test('Spooky S1 and S2 actual damage follows his revised Attack for both roles', () => {
  for (const role of ['player', 'enemy'])
    for (const slot of ['special1', 'special2']) {
      const b = newBattle(6, {
        character: resolveCharacter(
          role === 'player' ? 'Marq' : 'Hellfed Marq'
        ),
        opponent: role === 'player' ? 'Hellfed Marq' : 'marq',
      })
      b.enemy.fear = 2
      let i = 0,
        j = 0
      // S1 needs no Fear; S2 has priority when funded.
      if (slot === 'special1') b.enemy.fear = 0
      const n = advance(
        b,
        role === 'player' ? { [slot]: true } : {},
        () => [2, 1][j++ % 2],
        () => [7, 6][i++ % 2],
        () => 0,
        () => 0,
        () => 99,
        () => 99,
        { actor: role === 'player' ? 'ability' : 'enemy', aiPolicy: 'legacy' }
      )
      if (role === 'enemy') assert.equal(n.enemySpecial, slot)
      const recorded = n.statistics[role].damage
      assert.equal(recorded.basic, Math.floor(spooky.baseStats.attack * 0.03))
      assert.equal(
        recorded[slot],
        Math.floor(
          (spooky.baseStats.attack * (slot === 'special1' ? 4 : 11)) / 100
        )
      )
    }
})
test('Hellfed costs and Rage coefficients match between roles and their descriptions', () => {
  const b = newBattle(6, {
    character: resolveCharacter('Hellfed Marq'),
    opponent: 'Hellfed Marq',
  })
  for (const f of [b.player, b.enemy]) {
    const s1 = kitFor(f).special1
    assert.deepEqual(
      [0, 1, 2].map((rage) => healthCost({ ...f, rage }, s1)),
      hellfed.abilities.special1.hpCostPercentByRage.map((p) =>
        Math.ceil((f.maxHp * p) / 100)
      )
    )
    for (const rage of [0, 1, 2, 3]) {
      assert.equal(
        specialPercent({ ...f, rage }, 'special2'),
        hellfed.abilities.special2.percent +
          rage * hellfed.abilities.special2.ragePercent
      )
      assert.equal(
        specialPercent({ ...f, rage }, 'special3', 3),
        (f.isAI ? 40 : 45) + rage * hellfed.abilities.special3.ragePercent
      )
    }
  }
  assert.match(abilitySummary(b.player, 'special1'), /3 \/ 6 \/ 8 HP/)
})
test('frozen production and legacy profiles retain their established stats and Brink behavior', () => {
  for (const env of ['production', 'test']) {
    const source =
      "const {loadBalance}=require('./services/arena/balance-config');const b=loadBalance();const {brinkHealth}=require('./services/arena/passives');console.log(JSON.stringify({stats:b.baseStats['spooky-marq'],brink:brinkHealth({maxHp:260})}))"
    const result = JSON.parse(
      execFileSync(process.execPath, ['-e', source], {
        env: { ...process.env, NODE_ENV: env },
        encoding: 'utf8',
      })
    )
    assert.deepEqual(result, { stats: { attack: 200, hp: 260 }, brink: 26 })
  }
})
test('future Stoke percentage edits reach actual costs, skin copy, and confirmation copy together', () => {
  const character = resolveCharacter('Hellfed Marq'),
    b = newBattle(6, { character, opponent: 'marq' }),
    costs = kitFor(b.player).special1.hpCostPercentByRage,
    old = costs.slice()
  try {
    costs.splice(0, costs.length, 2, 4, 6)
    assert.equal(healthCost(b.player, kitFor(b.player).special1), 6)
    assert.match(abilitySummary(b.player, 'special1'), /6 \/ 11 \/ 16 HP/)
    const confirmation = JSON.stringify(
      screen({
        id: 'costs',
        revision: 0,
        character,
        opponent: 'marq',
        level: 1,
      })
    )
    assert.match(confirmation, /Stoke: 2 \/ 4 \/ 6% max HP/)
  } finally {
    costs.splice(0, costs.length, ...old)
  }
})
