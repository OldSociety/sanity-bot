const test = require('node:test'),
  assert = require('node:assert/strict')
process.env.NODE_ENV = 'development'
const { newBattle, advance, takeTurn } = require('../services/arena/combat')
const { resolveCharacter } = require('../services/arena/characters')
const h = require('../services/arena/hendrix')
const types = require('../services/arena/damage-types')
const { preview } = require('../services/arena/tactics')
const make = (opponent = 'Hendrix') =>
  newBattle(6, { character: resolveCharacter('Hendrix'), opponent })
const dice = (values) => {
  let i = 0
  return () => values[i++ % values.length]
}
function act(b, slot, values = [6, 7], effect = 0) {
  return advance(
    b,
    slot ? { [slot]: true, ...(slot === 'special3' ? { choice: 3 } : {}) } : {},
    () => 1,
    dice(values),
    () => 99,
    () => 0,
    () => 99,
    () => effect,
    { actor: slot ? 'ability' : 'player' }
  )
}
test('named damage categories preserve 75/50/unblockable rules', () => {
  assert.deepEqual(
    [types.basic_damage, types.special_damage, types.final_special_damage].map(
      (t) => types.blockedDamage(20, t)
    ),
    [15, 10, 20]
  )
  assert.equal(types.blockedDamage(20, types.bleed_damage), 20)
  assert.throws(() => types.blockedDamage(20, 'unknown'))
})
test('finished development identity and reusable template are separate', () => {
  const b = make()
  assert.equal(b.player.kit, 'classic-hendrix')
  assert.equal(b.player.name, 'Hendrix')
  assert.deepEqual(
    [b.player.maxHp, b.player.attack, b.player.maxStress],
    [200, 200, 6]
  )
  assert.equal(
    require('../config/arena-templates-development.json').abilities.special1
      .percent,
    8
  )
  assert(require('../services/arena/rules').balance.characters.template)
})
test('Duality critical guarantees exactly one strike; independent criticals grant no resources', () => {
  let b = make()
  b.player.hope = 0
  b.player.stress = 3
  let n = act(b, null, [6, 6, 1, 2, 1, 2])
  assert.deepEqual(
    n.history.find((e) => e.strikes).strikes.map((s) => s.outcome),
    ['critical', 'block', 'block']
  )
  assert.equal(n.player.hope, 1)
  assert.equal(n.player.stress, 4)
  assert.equal(n.enemy.stress, 5)
  b = make()
  b.player.hope = 0
  b.player.stress = 3
  n = act(b, null, [6, 7, 2, 2, 2, 2, 2, 2])
  assert.equal(n.statistics.player.criticals.basic, 3)
  assert.equal(n.player.hope, 0)
  assert.equal(n.player.stress, 3)
  assert.equal(n.enemy.stress, 6)
})
test('all six S2 outcomes are independent; fixed bonus remains noncritical and guaranteed', () => {
  const b = make()
  b.enemy.bleeding = { remaining: 3 }
  const n = act(b, 'special2', [6, 7, 6, 7, 1, 2, 1, 2, 6, 7, 6, 7, 2, 2])
  const event = n.history.find((e) => e.strikes)
  assert.deepEqual(
    event.strikes.map((s) => s.outcome),
    ['hit', 'block', 'block', 'hit', 'hit', 'critical']
  )
  assert.equal(n.enemy.hp, 160) // The Hendrix minimum applies after Block.
  assert.equal(n.player.hope, 4)
  assert.equal(n.special2Damage, 12)
  assert.equal(n.statistics.player.damage.special2, 20) // Three extra direct strikes + bonus.
  assert.equal(n.statistics.player.damage.bleeding, 14)
})
test('Bleeding bypasses Block, doubles on associated critical, and exposes rounding', () => {
  const f = make().player
  assert.deepEqual(
    ['hit', 'block', 'critical'].map((o) => h.strike(f, o, true).damage),
    [4, 4, 8]
  )
  assert.equal(h.strike(f, 'block', true).prevented, 0)
  assert.equal(h.strike({ ...f, attack: 400 }, 'block', true).damage, 7)
  const n = act(make(), 'special2', [1, 2])
  assert.equal(n.enemy.hp, 176)
  assert.equal(n.special2Damage, 12)
})
test('duration distribution exactly 40/40/20; activation, expiry and replacement refresh', () => {
  const counts = { 2: 0, 3: 0, 4: 0 }
  for (let i = 0; i < 10000; i++) counts[h.duration(() => i / 100)]++
  assert.deepEqual(counts, { 2: 4000, 3: 4000, 4: 2000 })
  assert.throws(() => h.duration(() => 100))
  let n = act(make(), 'special1', [6, 7], 90)
  assert.equal(n.enemy.bleeding.remaining, 3)
  assert.equal(n.statistics.player.damage.bleeding, 6)
  n = act(n, 'special1', [6, 7], 0)
  assert.equal(n.enemy.bleeding.remaining, 1)
  n = act(n, null)
  assert.equal(n.enemy.bleeding, undefined)
  const before = n.statistics.player.damage.bleeding
  n = act(n, null)
  assert.equal(n.statistics.player.damage.bleeding, before)
})
test('enemy native per-strike outcomes never repeat main critical resource effects', () => {
  const b = make()
  b.enemy.fear = 0
  b.enemy.stress = 4
  let calls = 0
  const n = advance(
    b,
    {},
    () => 1,
    () => 6,
    () => 99,
    () => (++calls === 1 ? 99 : 0),
    () => 0,
    () => 99,
    { actor: 'enemy', rollRecovery: () => 99 }
  )
  assert.equal(n.history.find((e) => e.strikes).strikes.length, 3)
  assert.equal(n.statistics.enemy.criticals.basic, 3)
  assert.equal(n.enemy.fear, 0)
  assert.equal(n.enemy.stress, 3)
  assert.equal(n.player.stress, 6) // S1 cost only.
})
test('native distributions are exhaustive and differ by role', () => {
  assert.deepEqual(Object.fromEntries(h.distribution(make().enemy)), {
    block: 0.15000000000000002,
    critical: 0.0425,
    hit: 0.8075,
  })
  const counts = { block: 0, critical: 0, hit: 0 }
  for (let a = 1; a <= 12; a++)
    for (let b = 1; b <= 12; b++)
      counts[h.nativeOutcome(make().player, dice([a, b]))]++
  assert.equal(counts.critical, 12)
  assert.equal(counts.block + counts.hit + counts.critical, 144)
})
test('public previews cannot read hidden duration and include independent critical tails', () => {
  const b = make()
  const p = preview(
    b.player,
    { ...b.enemy, bleeding: { remaining: 1 } },
    'special2'
  )
  assert.deepEqual(
    p,
    preview(b.player, { ...b.enemy, bleeding: { remaining: 3 } }, 'special2')
  )
  assert(p.expected > 36 && p.expected < 60)
  assert.equal(p.minimum, 36)
  assert.equal(
    preview(
      b.player,
      { ...b.enemy, hp: 60, bleeding: { remaining: 1 } },
      'special2'
    ).knockout > 0,
    true
  )
})
test('lethal sequence prevents response; Brink resolves once after full sequence', () => {
  let b = make('Marq')
  b.enemy.hp = 1
  b.enemy.brinkUsed = true
  let n = takeTurn(
    b,
    'basic',
    () => 1,
    dice([6, 7]),
    () => 99,
    () => 99,
    () => 99,
    () => 99
  )
  assert.equal(n.status, 'victory')
  assert.equal(n.player.hp, 200)
  b = make('Marq')
  b.enemy.hp = 1
  n = act(b, 'special2')
  assert.equal(n.enemy.brinkUsed, true)
  assert.equal(n.enemy.hp, 26)
  assert.equal(n.history.filter((e) => e.kind === 'survival').length, 1)
})
test('Bleeding display never reveals remaining duration', () => {
  const b = make()
  b.enemy.bleeding = { remaining: 3 }
  assert.deepEqual(
    require('../services/arena/status-icons')
      .statusIcons(b.enemy)
      .find((i) => i.type === 'bleeding'),
    { type: 'bleeding', label: 'Bleeding' }
  )
  const a = require('../services/arena/health-card').cardData({
    character: resolveCharacter('Hendrix'),
    opponent: 'Hendrix',
    battle: b,
  })
  b.enemy.bleeding.remaining = 1
  assert.deepEqual(
    a,
    require('../services/arena/health-card').cardData({
      character: resolveCharacter('Hendrix'),
      opponent: 'Hendrix',
      battle: b,
    })
  )
})
test('proposed global Block applies to every conventional fighter across all 144 main rolls', () => {
  const { basicDamage, specialDamage } = require('../services/arena/damage')
  for (const name of ['Marq', 'Hellfed Marq', 'Maxim', 'Azulis']) {
    for (let a = 1; a <= 12; a++)
      for (let b = 1; b <= 12; b++) {
        const battle = newBattle(6, {
          character: resolveCharacter(name),
          opponent: 'Maxim',
        })
        const critical = a === b,
          hit = critical || a + b >= 12
        const raw = basicDamage(battle.player, battle.enemy, {
          critical,
          landed: hit,
        })
        const next = act(battle, null, [a, b])
        assert.equal(
          next.playerBasicDamage,
          hit ? raw : Math.floor(raw * 0.75),
          `${name} ${a}/${b}`
        )
        assert.equal(next.statistics.player.criticals.basic, Number(critical))
      }
    const battle = newBattle(6, {
      character: resolveCharacter(name),
      opponent: 'Maxim',
    })
    const slot = name === 'Maxim' ? 'special1' : 'special2'
    battle.player.focusHits = 20
    const next = advance(
      battle,
      { [slot]: true },
      dice([2, 1]),
      dice([1, 2]),
      () => 99,
      () => 99,
      () => 99,
      () => 99,
      { actor: 'ability' }
    )
    const raw = specialDamage(battle.player, slot, { total: 3 }).damage
    assert.equal(next[slot + 'Damage'], Math.floor(raw * 0.5), name)
  }
})
test('six-critical maximum and exhausted maximum preserve the fixed bonus and standard modifiers', () => {
  let b = make()
  b.enemy.bleeding = { remaining: 3 }
  let n = act(b, 'special2', [6, 6])
  assert.equal(n.enemy.hp, 140)
  assert.equal(n.special2Damage, 12)
  assert.equal(n.statistics.player.strikeMetrics.bleedingMaximumFlurries, 1)
  b = make()
  b.enemy.bleeding = { remaining: 3 }
  b.enemy.stress = 1
  n = act(b, 'special2', [6, 6])
  assert.equal(n.enemy.hp, 125)
  assert.equal(n.special2Damage, 15)
  b = make()
  b.enemy.bleeding = { remaining: 3 }
  n = act(b, 'special3', [6, 6])
  assert.equal(n.special3Damage, 90)
  assert.equal(n.statistics.player.criticals.special3, 0)
})
test('primitive simultaneous exchanges retain tie handling and exact source HP accounting', () => {
  const b = make()
  b.player.hp = b.enemy.hp = 1
  b.enemy.bleeding = { remaining: 2 }
  const n = advance(
    b,
    {},
    () => 1,
    dice([6, 7]),
    () => 99,
    () => 0,
    () => 99,
    () => 99,
    { actor: 'exchange' }
  )
  assert.equal(n.player.hp, 0)
  assert.equal(n.enemy.hp, 0)
  assert.equal(n.tiedVictory, true)
  assert.equal(
    Object.values(n.statistics.player.hpDamageBySource).reduce(
      (a, b) => a + b,
      0
    ),
    1
  )
  assert.equal(
    Object.values(n.statistics.enemy.hpDamageBySource).reduce(
      (a, b) => a + b,
      0
    ),
    1
  )
})
