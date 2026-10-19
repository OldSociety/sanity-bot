const assert = require('node:assert/strict')
process.env.NODE_ENV = 'development'
require('./arena-historical-profile.cjs')()
const scenario = process.argv[2],
  { transformFor } = require('../../scripts/arena-block-transform')
const { combat, tactics, balance } =
  require('../../scripts/arena-parity-engine').setup({
    sourceTransform: transformFor(scenario),
  })
const { resolveCharacter } = require('../../services/arena/characters'),
  { basicDamage, specialDamage } = require('../../services/arena/damage')
const basicRate = scenario === 'proposed' ? 0.75 : 0.25,
  specialRate = scenario === 'proposed' ? 0.5 : 0.25
const make = (name = 'Hendrix') => {
  const b = combat.newBattle(6, {
    character: resolveCharacter(name),
    opponent: 'Hendrix',
  })
  b.player.stress = b.player.maxStress ? 4 : 0
  b.player.focusHits = 20
  b.player.basicHits = 20
  if (b.player.maxRage) b.player.rage = 3
  b.enemy.hp = b.enemy.maxHp = 10000
  return b
}
const act = (b, slot, h, f, choice = 3) => {
  let i = 0,
    j = 0
  return combat.advance(
    b,
    slot ? { [slot]: true, ...(slot === 'special3' ? { choice } : {}) } : {},
    () => [2, 1][j++ % 2],
    () => [h, f][i++],
    () => 99,
    () => 99,
    () => 99,
    () => {
      throw Error('Blocked on-hit effect rolled')
    },
    { actor: slot ? 'ability' : 'player' }
  )
}
let checks = 0
for (let h = 1; h <= 12; h++)
  for (let f = 1; f <= 12; f++) {
    const b = make(),
      n = act(b, null, h, f),
      hit = h === f || h + f >= 12,
      crit = h === f
    assert.equal(
      n.playerBasicDamage,
      hit
        ? basicDamage(b.player, b.enemy, { critical: crit })
        : Math.ceil(
            basicDamage(b.player, b.enemy, { landed: false }) * basicRate
          )
    )
    assert.equal(n.statistics.player.criticals.basic, Number(crit))
    checks++
  }
for (const [name, slot] of [
  ['Hendrix', 'special1'],
  ['Hendrix', 'special2'],
  ['Azulis', 'special2'],
  ['Maxim', 'special1'],
  ['Hellfed Marq', 'special2'],
  ['Marq', 'special1'],
  ['Marq', 'special2'],
]) {
  let total = 0
  for (let h = 1; h <= 12; h++)
    for (let f = 1; f <= 12; f++) {
      const b = make(name)
      let i = 0,
        j = 0
      const hit = h === f || h + f >= 12,
        crit = h === f
      const n = combat.advance(
        b,
        { [slot]: true },
        () => [2, 1][j++ % 2],
        () => [h, f][i++],
        () => 99,
        () => 99,
        () => 99,
        () => 99,
        { actor: 'ability' }
      )
      const raw = specialDamage(b.player, slot, { total: 3 }).damage
      assert.equal(n[slot + 'Damage'], hit ? raw : Math.ceil(raw * specialRate))
      assert.equal(n.statistics.player.criticals[slot], 0)
      if (!hit) assert.equal(n.statistics.player.criticals.basic, 0)
      total += n.playerBasicDamage + n[slot + 'Damage']
      checks++
    }
  if (!(name === 'Marq' && slot === 'special2'))
    assert(
      Math.abs(
        tactics.preview(make(name).player, make(name).enemy, slot).expected -
          total / 144
      ) < 1e-8,
      'preview must match actual exhaustive outcomes'
    )
}
for (const name of ['Hendrix', 'Azulis', 'Maxim', 'Marq', 'Hellfed Marq'])
  for (let choice = 0; choice <= 5; choice++) {
    const b = make(name),
      n = act(b, 'special3', 1, 2, choice)
    assert.equal(
      n.special3Damage,
      specialDamage(b.player, 'special3', { choice }).damage
    )
    assert.equal(n.statistics.player.blocks.special3, 0)
    assert.equal(n.statistics.player.criticals.special3, 0)
    assert.equal(n.hopeSpent, 5)
    checks++
  }
let b = make('Azulis')
b.player.hp = 100
let n = act(b, 'special1', 1, 2)
assert.equal(n.player.hp, 114)
assert.equal(n.player.stress, 3)
checks++
b = make('Maxim')
b.player.slayerCharges = 3
b.player.focusHits = 2
n = act(b, null, 1, 2)
assert.equal(n.player.slayerCharges, 3)
assert.equal(n.player.focusHits, 2)
checks++
b = make('Marq')
n = act(b, 'special1', 1, 2)
assert.equal(n.enemy.stress, 6)
checks++
b = make()
b.enemy.stress = 0
n = act(b, 'special2', 1, 2)
assert.equal(
  n.playerBasicDamage,
  Math.ceil(basicDamage(b.player, b.enemy, { landed: false }) * basicRate)
)
assert.equal(
  n.special2Damage,
  Math.ceil(
    specialDamage(b.player, 'special2', { multiplier: 1.25 }).damage *
      specialRate
  )
)
checks++
for (const fear of [0, 2, 5]) {
  b = make()
  b.enemy.fear = fear
  n = combat.advance(
    b,
    {},
    () => 1,
    undefined,
    () => 0,
    () => 99,
    () => {
      throw Error('Blocked enemy cannot roll a critical')
    },
    () => 99,
    {
      actor: 'enemy',
      aiPolicy: 'legacy',
      rollRecovery: () => 99,
      rollFinisher: () => 40,
    }
  )
  assert.equal(
    n.enemyDamage,
    Math.ceil(6 * basicRate) +
      (fear === 2
        ? Math.ceil(48 * specialRate)
        : fear === 5
        ? 80
        : Math.ceil(16 * specialRate))
  )
  assert.equal(n.statistics.enemy.criticals.basic, 0)
  assert.equal(n.statistics.enemy.criticals.special3, 0)
  if (fear === 5) assert.equal(n.statistics.enemy.blocks.special3, 0)
  checks++
}
assert.deepEqual(
  balance,
  require('../../services/arena/balance-config').loadBalance('development')
)
console.log(
  JSON.stringify({
    scenario,
    checks,
    balanceHash: require('node:crypto')
      .createHash('sha256')
      .update(JSON.stringify(balance))
      .digest('hex'),
  })
)
