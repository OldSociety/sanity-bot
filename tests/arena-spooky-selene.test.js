const test = require('node:test'),
  assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
process.env.NODE_ENV = 'development'
const {
  newBattle,
  advance,
  takeTurn,
  beginFinisher,
} = require('../services/arena/combat')
const {
  resolveCharacter,
  characterChoices,
} = require('../services/arena/characters')
const { kitFor, canUse } = require('../services/arena/rules')
const { basicDamage, specialDamage } = require('../services/arena/damage')
const { preview } = require('../services/arena/tactics')
const D = require('../services/arena/duality'),
  S = require('../services/arena/selene')
test('shared Duality API preserves native capacities, role labels and paid balances', () => {
  const b = make(6, 'Spooky Selene')
  const p = D.grant(D.spend(b.player, 2), 3)
  assert.deepEqual(
    [D.value(p.fighter), p.granted, p.fighter.alignmentStacks],
    [6, 2, 2]
  )
  assert.equal(D.label(p.fighter), 'Hope')
  assert.throws(() => D.spend(b.player, 7), /Insufficient Duality/)
  const enemy = D.grant({ ...b.enemy, fear: 6 }, 2)
  assert.equal(D.value(enemy.fighter), 8) // Existing enemy resource remains uncapped.
  assert.equal(D.label(enemy.fighter), 'Fear')
  const capped = D.grant({ ...b.enemy, fear: 6, maxFear: 6 }, 1)
  assert.deepEqual([capped.granted, capped.fighter.alignmentStacks], [0, 0])
})
const make = (hope = 0, opponent = 'Marq') =>
  newBattle(hope, {
    character: resolveCharacter('Spooky Selene'),
    opponent,
  })
const dice = (h, f) => {
  let i = 0
  return () => [h, f][i++ % 2]
}
function act(
  b,
  slot,
  {
    h = 8,
    f = 5,
    actor = slot ? 'ability' : 'player',
    block = 99,
    accuracy = 0,
    critical = 99,
    recovery = 99,
    spend = 99,
  } = {}
) {
  return advance(
    b,
    slot ? { [slot]: true, ...(slot === 'special3' ? { choice: 3 } : {}) } : {},
    () => 1,
    dice(h, f),
    () => spend,
    () => accuracy,
    () => critical,
    () => 99,
    {
      actor,
      rollBlock: () => block,
      rollRecovery: () => recovery,
      rollFinisher: () => 40,
    }
  )
}
test('development roster uses the existing Spooky icon, stats and role-neutral costs', () => {
  const b = make(0, 'Spooky Selene')
  assert.deepEqual(
    [
      b.player.maxHp,
      b.player.attack,
      b.player.stress,
      b.enemy.maxHp,
      b.enemy.attack,
    ],
    [180, 240, 6, 180, 240]
  )
  assert.match(
    resolveCharacter('Spooky Selene').image,
    /SPOOKY_SELENE_BADGE.png$/
  )
  assert(characterChoices().some((x) => x.value === 'spooky-2026:sel'))
  b.enemy.fear = 2
  assert(canUse(b.enemy, 'special2'))
  assert.equal(D.cost(kitFor(b.enemy).special2), 2)
})
test('own Duality income scales both roles; opposing income does not scale Selene', () => {
  const p = act(make(), null)
  assert.deepEqual(
    [p.player.hope, p.player.alignmentStacks, p.player.attack],
    [1, 1, 240]
  )
  assert.equal(act(make(), null, { h: 5, f: 8 }).player.alignmentStacks, 0)
  const b = make(0, 'Spooky Selene'),
    e = act(b, null, { h: 5, f: 8 })
  assert.deepEqual(
    [e.enemy.fear, e.enemy.alignmentStacks, e.player.alignmentStacks],
    [1, 1, 0]
  )
  const critical = act(e, null, { actor: 'enemy', critical: 0 })
  assert.deepEqual(
    [critical.enemy.fear, critical.enemy.alignmentStacks],
    [2, 2]
  )
})
test('starting/capped resources add no stacks; spending preserves stacks; new battles reset', () => {
  let b = make(6)
  assert.equal(act(b, null).player.alignmentStacks, 0)
  b.player.alignmentStacks = 7
  const n = act(b, 'special2')
  assert.deepEqual([n.player.hope, n.player.alignmentStacks], [5, 8])
  assert.equal(make().player.alignmentStacks, 0)
  let f = {
    ...b.enemy,
    passive: 'celestial-alignment',
    alignmentStacks: 9,
  }
  f = D.grant(f, 20).fighter
  assert.equal(f.alignmentStacks, 10)
  assert.equal(D.value(f), 20)
})
test('alignment scales basics and Finishers with floor damage, not stored Attack or healing', () => {
  const b = make(),
    p = { ...b.player, alignmentStacks: 10 }
  assert.equal(basicDamage(p, b.enemy), Math.floor(240 * 0.03 * 1.2))
  assert.equal(specialDamage(p, 'special3', { choice: 3 }).damage, 129)
  assert.equal(p.attack, 240)
  assert.equal(S.healing({ ...p, hp: 1 }, kitFor(p).special1), 26)
})
test('Aura of Life follows all eight healing steps and advances on partial healing', () => {
  let b = make(),
    amounts = []
  for (let i = 0; i < 8; i++) {
    b.player.hp = 1
    b.player.stress = 6
    b.enemy.hp = b.enemy.maxHp
    b = act(b, 'special1', { h: 2, f: 3 })
    amounts.push(b.player.hp - 1)
  }
  assert.deepEqual(amounts, [26, 22, 18, 15, 11, 8, 4, 4])
  let partial = make()
  partial.player.hp = 179
  partial = act(partial, 'special1')
  assert.equal(partial.player.hp, 180)
  assert.equal(partial.player.lifeUses, 1)
  partial.player.stress = 0
  assert.equal(act(partial, 'special1'), partial)
})
test('AI Aura of Life uses the same diminishing counter and never exceeds max HP', () => {
  let b = make(0, 'Spooky Selene')
  b.enemy.hp = 120 // Under the AI's 70% healing threshold.
  let n = act(b, null, { actor: 'enemy', spend: 0 })
  assert.equal(n.enemySpecial, 'special1')
  assert.equal(n.enemy.lifeUses, 1)
  assert.equal(n.statistics.enemy.hpRestored, 26)
})
test('Wind Wall begins after activation and expires after two full rounds', () => {
  let b = make(2),
    first = takeTurn(
      b,
      'special2',
      () => 1,
      dice(8, 5),
      () => 99,
      () => 0,
      () => 99,
      () => 99,
      { rollRecovery: () => 99, rollBlock: () => 0 }
    )
  assert.equal(first.enemyOutcome, 'hit')
  assert.deepEqual(
    [first.player.windWall.startRound, first.player.windWall.endRound],
    [2, 3]
  )
  for (let round = 2; round <= 3; round++) {
    first = takeTurn(
      first,
      'basic',
      () => 1,
      dice(8, 5),
      () => 99,
      () => 0,
      () => 99,
      () => 99,
      { rollRecovery: () => 99, rollBlock: () => 0 }
    )
    assert.equal(first.enemyOutcome, 'block')
    assert.equal(Boolean(first.player.windWall), round < 3)
  }
  first = takeTurn(
    first,
    'basic',
    () => 1,
    dice(8, 5),
    () => 99,
    () => 0,
    () => 99,
    () => 99,
    { rollRecovery: () => 99, rollBlock: () => 0 }
  )
  assert.equal(first.enemyOutcome, 'hit')
})
test('Wind Wall refreshes one status and retains protection on a refresh round', () => {
  let b = make(6)
  S.activateWall(b.player, b.enemy, 1)
  b.tick = 1
  const n = act(b, 'special2')
  assert.deepEqual(
    [n.player.windWall.startRound, n.player.windWall.endRound],
    [2, 4]
  )
  assert(S.wallActive(n.player, 2, n.enemy))
  assert(!Array.isArray(n.player.windWall))
})
test('75 of 100 independent checks Block; blocked native criticals lose critical rewards', () => {
  let blocked = 0
  for (let i = 0; i < 100; i++) {
    const b = make(0, 'Spooky Selene')
    b.tick = 1
    S.activateWall(b.enemy, b.player, 1)
    const n = act(b, null, { h: 6, f: 6, block: i })
    if (!n.duality.success) {
      blocked++
      assert.equal(n.stressRemoved, 0)
      assert.equal(n.duality.critical, false)
    } else assert.equal(n.duality.critical, true)
  }
  assert.equal(blocked, 75)
})
test('Wall replaces ordinary Block: a failed native result can pass the wall', () => {
  const b = make(0, 'Spooky Selene')
  b.tick = 1
  S.activateWall(b.enemy, b.player, 1)
  assert.equal(act(b, null, { h: 2, f: 3, block: 99 }).duality.success, true)
})
test('Finishers bypass Wall and never critical; paid Finisher spends once', () => {
  const b = make(6, 'Spooky Selene')
  b.tick = 1
  S.activateWall(b.enemy, b.player, 1)
  const paid = beginFinisher(b),
    n = act(paid, 'special3', { h: 6, f: 6, block: 0 })
  assert.equal(n.special3Damage, 110) // 45% × 240 × 1.02, floored
  assert.equal(n.statistics.player.spent, 5)
  assert.equal(n.statistics.player.criticals.special3, 0)
})
test('Hendrix checks each strike independently; Bleeding bypasses Wall', () => {
  const b = newBattle(6, {
    character: resolveCharacter('Hendrix'),
    opponent: 'Spooky Selene',
  })
  b.tick = 1
  S.activateWall(b.enemy, b.player, 1)
  b.enemy.bleeding = { remaining: 2 }
  const n = act(b, 'special2', { block: 0 })
  const event = n.history.find((e) => e.kind === 'hit')
  assert.equal(event.strikes.length, 6)
  assert(
    event.strikes.every(
      (s) => s.outcome === 'block' && s.direct === 2 && s.bleed === 2
    )
  )
  assert.equal(n.playerBasicDamage + n.special2Damage, 37)
})
test('Stress recovery still replaces an enemy attack; knockout still skips its response', () => {
  let b = make()
  b.enemy.stress = 4
  const n = act(b, null, { actor: 'enemy', recovery: 0 })
  assert.equal(n.enemyOutcome, 'recover')
  assert.equal(n.enemyDamage, 0)
  b.enemy.hp = 1
  b.enemy.brinkUsed = true
  const win = takeTurn(b, 'basic', () => 1, dice(8, 5))
  assert.equal(win.status, 'victory')
  assert.equal(win.enemyDamage, 0)
})
test('public tactical previews match exhaustive player damage for Selene', () => {
  for (const wall of [false, true]) {
    const b = make(2, 'Spooky Selene')
    if (wall) {
      b.tick = 1
      S.activateWall(b.enemy, b.player, 1)
      b.enemy.combatRound = 2
    }
    let total = 0
    for (let h = 1; h <= 12; h++)
      for (let f = 1; f <= 12; f++)
        for (const [block, chance] of wall
          ? [
              [0, 0.75],
              [99, 0.25],
            ]
          : [[99, 1]])
          total +=
            (act(b, null, { h, f, block }).playerBasicDamage * chance) / 144
    assert(
      Math.abs(preview(b.player, b.enemy).expected - total) < 1e-9,
      `${wall}: preview mismatch`
    )
  }
})
test('production roster excludes Selene and keeps frozen stats', () => {
  const source = `const assert=require('assert/strict'),{characters,isSelectable}=require('./services/arena/characters'),{balance}=require('./services/arena/rules');assert.equal(characters.filter(isSelectable).length,5);assert(!balance.characters['spooky-selene']);assert.equal(balance.baseStats['spooky-marq'].hp,260);`
  execFileSync(process.execPath, ['-e', source], {
    env: { ...process.env, NODE_ENV: 'production' },
  })
})
test('Wind Wall retains 75% basic / 50% special damage and guaranteed Stoke', () => {
  let b = newBattle(2, {
    character: resolveCharacter('Azulis'),
    opponent: 'Spooky Selene',
  })
  b.tick = 1
  S.activateWall(b.enemy, b.player, 1)
  const n = act(b, 'special2', { block: 0 })
  assert.equal(n.playerBasicDamage, 3) // floor(190 × 3%) = 5, then floor(75%)
  assert.equal(n.special2Damage, 20) // floor(190 × 22%) = 41, then floor(50%)
  b = newBattle(0, {
    character: resolveCharacter('Hellfed Marq'),
    opponent: 'Spooky Selene',
  })
  b.tick = 1
  S.activateWall(b.enemy, b.player, 1)
  const guaranteed = act(b, 'special1', { h: 2, f: 3, block: 0 })
  assert.equal(guaranteed.playerBasicDamage, 6)
  assert.equal(guaranteed.player.rage, 1)
})
test('six-strike Wall rolls once per strike and never duplicates critical income', () => {
  const b = newBattle(0, {
    character: resolveCharacter('Hendrix'),
    opponent: 'Spooky Selene',
  })
  b.player.hope = 2
  b.tick = 1
  S.activateWall(b.enemy, b.player, 1)
  let checks = 0
  const n = advance(
    b,
    { special2: true },
    () => 1,
    dice(6, 6),
    () => 99,
    () => 0,
    () => 0,
    () => 99,
    { actor: 'ability', rollBlock: () => (checks++ === 0 ? 0 : 99) }
  )
  const strikes = n.history.find((e) => e.kind === 'hit').strikes
  assert.equal(checks, 6)
  assert.equal(strikes[0].outcome, 'block')
  assert(strikes.slice(1).every((s) => s.outcome === 'critical'))
  assert.equal(n.hopeGained, 1)
  assert.equal(n.stressRemoved, 0)
  b.enemy.combatRound = 2
  b.enemy.bleeding = { remaining: 2 }
  assert(
    Math.abs(preview(b.player, b.enemy, 'special2').expected - 37.5) < 1e-9
  )
})
test('enemy Wind Wall starts next round and the final protected player attack stays covered', () => {
  let b = make(0, 'Spooky Selene')
  b.enemy.fear = 2
  b = act(b, null, { actor: 'enemy' })
  assert.equal(b.enemySpecial, 'special2')
  assert.deepEqual(
    [b.enemy.windWall.startRound, b.enemy.windWall.endRound],
    [2, 3]
  )
  b.tick = 2
  const p = act(b, null, { block: 0 })
  assert.equal(p.duality.success, false)
  assert(p.enemy.windWall)
  const e = act({ ...p, tick: 2 }, null, { actor: 'enemy' })
  assert.equal(e.enemy.windWall, undefined)
})
