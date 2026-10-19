const assert = require('node:assert/strict')
const { transformFor } = require('../../scripts/arena-economy-transform')
const experiment = process.argv[2]
process.env.NODE_ENV = 'development'
require('./arena-historical-profile.cjs')()
const { combat, tactics, balance } =
  require('../../scripts/arena-parity-engine').setup({
    sourceTransform: transformFor(experiment),
  })
const { resolveCharacter } = require('../../services/arena/characters')
const { specialDamage, basicDamage } = require('../../services/arena/damage')
const make = (player = 'Azulis', enemy = 'Azulis') =>
  combat.newBattle(0, { character: resolveCharacter(player), opponent: enemy })
const dice = (h, f) => {
  let i = 0
  return () => [h, f][i++]
}
const player = (b, slot, h = 8, f = 4) => {
  let i = 0
  return combat.advance(
    b,
    { [slot]: true, ...(slot === 'special3' ? { choice: 3 } : {}) },
    () => [2, 1][i++ % 2],
    dice(h, f),
    () => 0,
    () => 0,
    () => 0,
    () => 99,
    { actor: 'ability', rollRecovery: () => 99 }
  )
}
let checks = 0
for (const slot of ['special2', 'special3'])
  for (const [h, f] of [
    [8, 4],
    [1, 2],
    [6, 6],
  ]) {
    const b = make()
    b.player.hope = 6
    b.player.stress = 3
    const n = player(b, slot, h, f),
      hit = h === f || h + f >= 12,
      basic = experiment === 'B',
      crit = basic && h === f
    assert.equal(n.playerBasicDamage, basic ? (crit ? 12 : hit ? 6 : 2) : 0)
    assert.equal(n[slot + 'Damage'], slot === 'special3' ? 86 : hit ? 42 : 11)
    assert.equal(n.player.stress, 3 + Number(crit))
    assert.equal(n.enemy.stress, 6 - Number(crit))
    assert.equal(n.statistics.player.criticals.basic, Number(crit))
    assert.equal(n.statistics.player.criticals[slot], 0)
    assert.equal(n.statistics.player.attempts.basic, Number(basic))
    checks++
  }
// Support retains its own rules in every variant; no new basic on Slayer.
let b = make()
b.player.hp = 100
assert.equal(player(b, 'special1', 1, 2).player.hp, 114)
assert.equal(player(b, 'special1', 1, 2).playerBasicDamage, 2)
checks++
b = make('Maxim')
b.player.hope = 6
assert.equal(player(b, 'special2', 6, 6).playerBasicDamage, 0)
checks++
for (const critical of [false, true])
  for (const slot of ['special2', 'special3']) {
    const b = make()
    b.enemy.fear = slot === 'special3' ? 5 : 2
    b.enemy.stress = 3
    const n = combat.advance(
      b,
      {},
      () => 1,
      undefined,
      () => 0,
      () => 0,
      () => (critical ? 0 : 99),
      () => 99,
      {
        actor: 'enemy',
        aiPolicy: 'legacy',
        rollRecovery: () => 99,
        rollFinisher: () => 45,
      }
    )
    const basic = experiment !== 'C'
    assert.equal(n.enemySpecial, slot)
    assert.equal(n.statistics.enemy.attempts.basic, Number(basic))
    assert.equal(n.statistics.enemy.criticals.basic, Number(basic && critical))
    assert.equal(n.statistics.enemy.criticals[slot], 0)
    const event = n.history.find((e) => e.kind === 'special')
    assert.equal(event.damage, slot === 'special3' ? 86 : 42)
    assert.equal(n.enemy.stress, 3 + Number(basic && critical))
    assert.equal(n.player.stress, 6 - Number(basic && critical))
    checks++
  }
// Blocked special: same quarter damage, no fabricated basic in C.
b = make()
b.enemy.fear = 2
let n = combat.advance(
  b,
  {},
  () => 1,
  undefined,
  () => 0,
  () => 99,
  () => {
    throw Error('Block critical RNG')
  },
  () => 99,
  { actor: 'enemy', aiPolicy: 'legacy', rollRecovery: () => 99 }
)
assert.equal(n.enemyDamage, 11 + (experiment === 'C' ? 0 : 2))
checks++
// A missing basic must neither consume Slayer/Opportunity nor advance recharge.
b = make('Azulis', 'Maxim')
b.enemy.fear = 0
b.enemy.stress = 3
b.enemy.slayerCharges = 2
b.enemy.opportunityReady = true
b.enemy.focusHits = 3
n = combat.advance(
  b,
  {},
  () => 1,
  undefined,
  () => 0,
  () => 0,
  () => 99,
  () => 99,
  { actor: 'enemy', aiPolicy: 'legacy', rollRecovery: () => 99 }
)
assert.equal(n.enemySpecial, 'special1')
assert.equal(n.enemy.slayerCharges, experiment === 'C' ? 2 : 1)
assert.equal(n.enemy.opportunityReady, experiment === 'C')
assert.equal(n.enemy.focusHits, experiment === 'C' ? 0 : 1)
checks++
// Compare previews against all 144 realized player outcomes for direct S2/S3.
for (const slot of ['special2', 'special3']) {
  const b = make()
  b.player.hope = 6
  let expected = 0
  for (let h = 1; h <= 12; h++)
    for (let f = 1; f <= 12; f++) {
      const n = player(b, slot, h, f)
      expected += n.playerBasicDamage + n[slot + 'Damage']
    }
  assert(
    Math.abs(
      tactics.preview(b.player, b.enemy, slot).expected - expected / 144
    ) < 1e-9
  )
  checks++
}
// Enemy preview shares accuracy but never a special critical multiplier.
b = make()
b.enemy.fear = 2
const expected =
  0.15 * (11 + (experiment === 'C' ? 0 : 2)) +
  0.85 * (42 + (experiment === 'C' ? 0 : 6 * 0.95 + 12 * 0.05))
assert(
  Math.abs(tactics.preview(b.enemy, b.player, 'special2').expected - expected) <
    1e-9
)
checks++
// All existing offensive kits retain their exact special coefficients and one
// shared Duality roll in B; matching dice critical only the accompanying basic.
for (const [name, slot] of [
  ['Marq', 'special1'],
  ['Marq', 'special2'],
  ['Maxim', 'special1'],
  ['Hellfed Marq', 'special2'],
]) {
  for (const [h, f] of [
    [8, 4],
    [1, 2],
    [6, 6],
  ]) {
    const b = make(name)
    b.player.hope = 6
    b.player.rage = name === 'Hellfed Marq' ? 3 : undefined
    const n = player(b, slot, h, f),
      hit = h === f || h + f >= 12,
      basic = experiment === 'B'
    const raw = specialDamage(b.player, slot, { total: 3 }).damage
    assert.equal(n[slot + 'Damage'], hit ? raw : Math.ceil(raw / 4))
    assert.equal(
      n.playerBasicDamage,
      basic
        ? hit
          ? basicDamage(b.player, b.enemy, { critical: h === f })
          : Math.ceil(basicDamage(b.player, b.enemy) / 4)
        : 0
    )
    assert.equal(n.statistics.player.criticals[slot], 0)
    checks++
  }
}
// A B basic can deliver existing Slayer charges; a blocked basic preserves them.
for (const [h, f] of [
  [8, 4],
  [1, 2],
  [6, 6],
]) {
  const b = make('Maxim')
  b.player.slayerCharges = 3
  b.player.hope = 6
  const n = player(b, 'special1', h, f),
    hit = h === f || h + f >= 12
  assert.equal(n.player.slayerCharges, 3 - Number(experiment === 'B' && hit))
  assert.equal(n.player.focusHits, Number(experiment === 'B' && hit))
  checks++
}
b = make()
b.enemy.fear = 5
n = combat.advance(
  b,
  {},
  () => 1,
  undefined,
  () => 0,
  () => 99,
  () => {
    throw Error('Finisher/blocked basic critical RNG')
  },
  () => 99,
  {
    actor: 'enemy',
    aiPolicy: 'legacy',
    rollRecovery: () => 99,
    rollFinisher: () => 45,
  }
)
assert.equal(n.enemyDamage, 86 + (experiment === 'C' ? 0 : 2))
checks++
// Existing Rage decay is still tied to a failed basic, not the special itself.
b = make('Hellfed Marq', 'Hellfed Marq')
b.player.hope = 6
b.player.rage = 3
n = player(b, 'special2', 1, 2)
assert.equal(n.player.rage, experiment === 'B' ? 2 : 3)
checks++
b = make('Azulis', 'Hellfed Marq')
b.enemy.fear = 2
b.enemy.rage = 3
n = combat.advance(
  b,
  {},
  () => 1,
  undefined,
  () => 0,
  () => 99,
  () => 99,
  () => 99,
  { actor: 'enemy', aiPolicy: 'legacy', rollRecovery: () => 99 }
)
assert.equal(n.enemy.rage, experiment === 'C' ? 3 : 2)
checks++
assert.deepEqual(
  balance.baseStats,
  require('../../services/arena/balance-config').loadBalance('development')
    .baseStats
)
console.log(
  JSON.stringify({
    experiment,
    checks,
    balanceHash: require('node:crypto')
      .createHash('sha256')
      .update(JSON.stringify(balance))
      .digest('hex'),
  })
)
