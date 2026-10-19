const test = require('node:test'),
  assert = require('node:assert/strict')
process.env.NODE_ENV = 'development'
require('./fixtures/arena-historical-profile.cjs')()
// Historical A-profile fixtures; native B is covered separately.
const loader = require('../services/arena/balance-config'),
  originalLoad = loader.loadBalance
loader.loadBalance = (...args) => {
  const b = originalLoad(...args)
  delete b.offensiveSpecialBasics
  return b
}
const {
  newBattle,
  advance,
  takeTurn,
  beginFinisher,
} = require('../services/arena/combat')
const { resolveCharacter } = require('../services/arena/characters')
const { kitFor, damageFor } = require('../services/arena/rules')
const { basicDamage, specialDamage } = require('../services/arena/damage')
const { preview } = require('../services/arena/tactics')
const outcomes = require('../services/arena/outcomes')
const { statusIcons } = require('../services/arena/status-icons')
const { legendData } = require('../services/arena/legend')
const { actionLines } = require('../services/arena/interface')
const make = (name = 'Maxim', enemy = 'Maxim') =>
  newBattle(5, { character: resolveCharacter(name), opponent: enemy })
const dice = (h, f) => {
  let i = 0
  return () => [h, f][i++]
}
const step = (b, action = {}, h = 8, f = 4, extra = {}) =>
  advance(
    b,
    action,
    (() => {
      let i = 0
      return () => [2, 1][i++ % 2]
    })(),
    dice(h, f),
    () => 99,
    () => 99,
    () => 99,
    () => 0,
    { actor: Object.keys(action).length ? 'ability' : 'player', ...extra }
  )

test('all 144 basics resolve immediate critical, full hit or rounded quarter Block with normal income', () => {
  for (let h = 1; h <= 12; h++)
    for (let f = 1; f <= 12; f++) {
      const b = make('Azulis')
      b.player.hope = 0
      b.player.stress = 3
      const n = step(b, {}, h, f),
        critical = h === f,
        hit = critical || h + f >= 12
      assert.equal(n.playerBasicDamage, critical ? 12 : hit ? 6 : 2)
      assert.equal(n.player.criticalReady, false)
      assert.equal(n.player.hope, Number(h >= f))
      assert.equal(n.enemy.fear, Number(f > h))
      assert.equal(n.player.stress, 3 + Number(critical))
      assert.equal(n.enemy.stress, 6 - Number(critical))
      assert.equal(n.statistics.player.blocks.basic, Number(!hit))
      assert.equal(n.statistics.player.criticals.basic, Number(critical))
    }
})
test('stale stored bonuses are ignored and a critical never doubles a later attack', () => {
  const b = make('Azulis')
  b.player.criticalReady = true
  const critical = step(b, {}, 6, 6)
  assert.equal(critical.playerBasicDamage, 12)
  const next = step(critical)
  assert.equal(next.playerBasicDamage, 6)
  assert.equal(next.player.criticalReady, false)
  assert.equal(step(b).playerBasicDamage, 6)
})
test('blocked basics preserve Slayer, Opportunity and Focus progress and exclude their on-hit bonus', () => {
  const b = make()
  b.player.slayerCharges = 3
  b.player.opportunityReady = true
  b.player.focusHits = 1
  const n = step(b, {}, 1, 2)
  assert.equal(n.playerBasicDamage, 2)
  assert.equal(n.player.slayerCharges, 3)
  assert.equal(n.player.opportunityReady, true)
  assert.equal(n.player.focusHits, 1)
  assert.equal(n.statistics.player.slayerChargesConsumed, 0)
  assert.equal(n.special2Damage, 0)
  const hit = step(n)
  assert.equal(hit.player.slayerCharges, 2)
  assert.equal(hit.player.opportunityReady, false)
  assert.equal(hit.player.focusHits, 2)
})
test('direct specials roll once for their own attack, never add a basic, and support every outcome', () => {
  for (const [name, slot] of [
    ['Marq', 'special1'],
    ['Marq', 'special2'],
    ['Maxim', 'special1'],
    ['Hellfed Marq', 'special2'],
    ['Azulis', 'special2'],
  ]) {
    for (let h = 1; h <= 12; h++)
      for (let f = 1; f <= 12; f++) {
        const b = make(name)
        b.player.rage = name === 'Hellfed Marq' ? 3 : undefined
        const raw = specialDamage(b.player, slot, {
          total: 3,
          criticalMultiplier: 2,
        }).damage
        const hit = h === f || h + f >= 12,
          n = step(b, { [slot]: true }, h, f)
        assert.equal(
          n[slot + 'Damage'],
          hit ? raw : Math.ceil(raw / 4),
          `${name} ${slot} ${h}/${f}`
        )
        assert.equal(n.playerBasicDamage, 0)
        assert.equal(n.statistics.player.attempts.basic, 0)
        assert.equal(n.player.criticalReady, false)
        assert.equal(n.statistics.player.blocks[slot], Number(!hit))
        assert.equal(n.statistics.player.criticals[slot], 0)
        assert.equal(n.duality.critical, false)
        assert.equal(
          n.player.stress,
          b.player.stress - (kitFor(b.player)[slot].stressCost || 0)
        )
        assert(!actionLines(n.history).join(' ').includes('CRITICAL'))
      }
  }
})
test('blocked attack Stress removal never rolls; matching special dice trigger only its normal on-hit removal', () => {
  const b = make('Marq')
  let effects = 0
  const block = advance(
    b,
    'special1',
    () => 1,
    dice(1, 2),
    () => 99,
    () => 99,
    () => 99,
    () => {
      effects++
      return 0
    },
    { actor: 'ability' }
  )
  assert.equal(effects, 0)
  assert.equal(block.enemy.stress, 6)
  assert.equal(block.stressRemoved, 0)
  const hit = step(b, { special1: true })
  assert.equal(hit.enemy.stress, 5)
  const crit = step(b, { special1: true }, 6, 6)
  assert.equal(crit.enemy.stress, 5)
  assert.equal(outcomes.onHitAllowed(false, true), false)
  assert.equal(outcomes.onHitAllowed(false, false), true)
})
test('Regeneration heals on Block, spends Stress once, and keeps its basic income and critical recovery', () => {
  const b = make('Azulis')
  b.player.hp = 100
  b.player.hope = 0
  const n = step(b, { special1: true }, 1, 2)
  assert.equal(n.player.hp, 114)
  assert.equal(n.special1Damage, 0)
  assert.equal(n.playerBasicDamage, 2)
  assert.equal(n.player.stress, 5)
  assert.equal(n.enemy.fear, 1)
  assert.equal(n.statistics.player.attempts.special1, 0)
  assert.equal(n.statistics.player.uses.special1, 1)
  const c = step(b, { special1: true }, 6, 6)
  assert.equal(c.playerBasicDamage, 12)
  assert.equal(c.player.hp, 114)
  assert.equal(c.player.stress, 6)
})
test('unconditional buff activation has no attack roll and creates its full charges', () => {
  const b = make()
  const n = advance(
    b,
    'special2',
    undefined,
    () => {
      throw Error('Support must not roll')
    },
    undefined,
    undefined,
    undefined,
    undefined,
    { actor: 'ability' }
  )
  assert.equal(n.player.slayerCharges, 3)
  assert.equal(n.player.hope, 3)
  assert.equal(n.playerBasicDamage, 0)
  assert.equal(n.statistics.player.attempts.special2, 0)
})
test('blocked player attacks allow normal response, except when chip damage is lethal', () => {
  const b = make('Azulis')
  const response = takeTurn(
    b,
    'basic',
    () => 1,
    dice(1, 2),
    () => 99,
    () => 99,
    () => 99,
    () => 99,
    { rollRecovery: () => 99 }
  )
  assert.equal(response.playerBasicDamage, 2)
  assert.equal(response.enemyDamage, 2)
  b.enemy.hp = 2
  const lethal = takeTurn(
    b,
    'basic',
    () => {
      throw Error('enemy RNG')
    },
    dice(1, 2),
    () => {
      throw Error('enemy RNG')
    },
    () => {
      throw Error('enemy RNG')
    },
    () => {
      throw Error('enemy RNG')
    },
    () => {
      throw Error('enemy RNG')
    },
    {
      rollRecovery: () => {
        throw Error('enemy RNG')
      },
    }
  )
  assert.equal(lethal.status, 'victory')
  assert.equal(lethal.enemyDamage, 0)
})
test('enemy Block suppresses on-hit removal, buff delivery and recharge; immediate critical effects still work', () => {
  const b = make('Azulis', 'Marq')
  b.enemy.slayerCharges = 0
  b.enemy.focusHits = 0
  b.enemy.fear = 0
  let effectCalls = 0
  const block = advance(
    b,
    {},
    () => 1,
    undefined,
    () => 0,
    () => 99,
    () => {
      throw Error('blocked critical roll')
    },
    () => {
      effectCalls++
      return 0
    },
    { actor: 'enemy', aiPolicy: 'legacy', rollRecovery: () => 99 }
  )
  assert.equal(block.enemyOutcome, 'block')
  assert.equal(block.enemySpecial, 'special1')
  assert.equal(block.enemyDamage, 4)
  assert.equal(block.player.stress, 6)
  assert.equal(effectCalls, 0)
  const critical = advance(
    b,
    {},
    () => 1,
    undefined,
    () => 99,
    () => 0,
    () => 0,
    () => 99,
    { actor: 'enemy', rollRecovery: () => 99 }
  )
  assert.equal(critical.enemyOutcome, 'critical')
  assert.equal(critical.enemyDamage, 12)
  assert.equal(critical.enemy.fear, 1)
  assert.equal(critical.player.stress, 5)
})
test('enemy Slayer and Opportunity survive Block and recharge only on a landed basic', () => {
  const b = make('Azulis', 'Maxim')
  b.enemy.slayerCharges = 3
  b.enemy.opportunityReady = true
  b.enemy.focusHits = 1
  const enemy = (accuracy, critical) =>
    advance(
      b,
      {},
      () => 1,
      undefined,
      () => 99,
      () => accuracy,
      () => critical,
      () => 99,
      { actor: 'enemy', aiPolicy: 'legacy', rollRecovery: () => 99 }
    )
  const block = enemy(99, 99)
  assert.equal(block.enemyDamage, 2)
  assert.equal(block.enemy.slayerCharges, 3)
  assert.equal(block.enemy.opportunityReady, true)
  assert.equal(block.enemy.focusHits, 1)
  const hit = enemy(0, 99)
  assert.equal(hit.enemyDamage, 27)
  assert.equal(hit.enemy.slayerCharges, 2)
  assert.equal(hit.enemy.opportunityReady, false)
  assert.equal(hit.enemy.focusHits, 2)
  const crit = enemy(0, 0)
  assert.equal(crit.enemyDamage, 53)
  assert.equal(crit.enemy.fear, 1)
  assert.equal(crit.player.stress, 5)
})
test('Finishers spend once, remain guaranteed/noncritical and trigger despite a blocked enemy basic', () => {
  const b = make('Azulis')
  const paid = beginFinisher(b)
  const n = advance(
    paid,
    { special3: true, choice: 3 },
    undefined,
    () => {
      throw Error('Finisher must not roll')
    },
    undefined,
    undefined,
    undefined,
    undefined,
    { actor: 'ability' }
  )
  assert.equal(n.special3Damage, 86)
  assert.equal(n.player.hope, 0)
  assert.equal(n.hopeSpent, 0)
  assert.equal(n.statistics.player.spent, 5)
  b.enemy.fear = 5
  const enemy = advance(
    b,
    {},
    () => 1,
    undefined,
    () => 0,
    () => 99,
    () => 99,
    () => 99,
    {
      actor: 'enemy',
      aiPolicy: 'legacy',
      rollRecovery: () => 99,
      rollFinisher: () => 40,
    }
  )
  assert.equal(enemy.enemyOutcome, 'block')
  assert.equal(enemy.enemySpecial, 'special3')
  assert.equal(enemy.enemyDamage, 90)
  assert.equal(enemy.statistics.enemy.hits.special3, 1)
})
test('criticals retain resource caps, Rage immunity and existing guaranteed Stoke', () => {
  const b = make('Hellfed Marq')
  b.player.hope = 6
  b.player.hp = 100
  const n = step(b, { special1: true }, 6, 6)
  assert.equal(n.player.hope, 6)
  assert.equal(n.player.rage, 1)
  assert.equal(n.player.stress, 0)
  assert.equal(n.playerBasicDamage, 12)
  const guaranteed = step(b, { special1: true }, 1, 2)
  assert.equal(guaranteed.playerBasicDamage, 6)
  assert.equal(guaranteed.player.rage, 1)
  const block = step({ ...b, player: { ...b.player, rage: 2 } }, {}, 1, 2)
  assert.equal(block.player.rage, 1)
})
test('Block damage still takes standard exhaustion modifiers and telemetry never invents a stored icon', () => {
  const b = make('Azulis')
  b.enemy.stress = 0
  const n = step(b, {}, 1, 2)
  assert.equal(n.playerBasicDamage, 2)
  assert.equal(n.statistics.enemy.vulnerabilityDamageTaken, 0)
  const critical = step(b, {}, 6, 6)
  assert.equal(critical.playerBasicDamage, 15)
  assert.equal(critical.statistics.enemy.vulnerabilityDamageTaken, 3)
  assert.equal(
    statusIcons({ ...b.player, criticalReady: true }).some(
      (x) => x.type === 'critical'
    ),
    false
  )
  assert.match(
    legendData(b).items.find((x) => x[0] === 'critical')[2],
    /Current basic/
  )
  assert.match(actionLines(n.history).join(' '), /blocked/)
  assert.doesNotMatch(actionLines(critical.history).join(' '), /Next basic/)
})
test('enemy critical basic never doubles its accompanying special or records a special critical', () => {
  for (const name of ['Azulis', 'Marq']) {
    const b = make('Azulis', name)
    b.enemy.fear = 2
    b.enemy.stress = 3
    let combo = 0
    const n = advance(
      b,
      {},
      () => [2, 1][combo++ % 2],
      undefined,
      () => 0,
      () => 0,
      () => 0,
      () => 99,
      { actor: 'enemy', aiPolicy: 'legacy', rollRecovery: () => 99 }
    )
    assert.equal(n.enemySpecial, 'special2')
    assert.equal(n.enemyOutcome, 'critical')
    assert.equal(
      n.history.find((e) => e.kind === 'hit').damage,
      basicDamage(b.enemy, b.player, { critical: true, targetStress: 5 })
    )
    const event = n.history.find((e) => e.kind === 'special')
    assert.equal(
      event.damage,
      specialDamage(b.enemy, 'special2', { total: 3 }).damage
    )
    assert.equal(event.outcome, 'hit')
    assert.equal(event.stressRemoved, 0)
    assert.equal(n.statistics.enemy.criticals.special2, 0)
    assert.equal(n.statistics.enemy.criticals.basic, 1)
    assert.equal(n.enemy.stress, 4)
    assert.equal(n.player.stress, 5)
  }
})

test('tactical expected damage and knockout probability match exhaustive actual player outcomes', () => {
  for (const [name, slot] of [
    ['Azulis', null],
    ['Azulis', 'special2'],
    ['Marq', 'special1'],
    ['Marq', 'special2'],
    ['Maxim', 'special1'],
  ]) {
    const b = make(name)
    b.enemy.hp = 15
    b.enemy.stress = 1
    let damage = 0,
      kills = 0,
      min = Infinity
    for (let h = 1; h <= 12; h++)
      for (let f = 1; f <= 12; f++) {
        const n = step(b, slot ? { [slot]: true } : {}, h, f),
          d = n.playerBasicDamage + (slot ? n[slot + 'Damage'] : 0)
        // For stress-removal chance isolate branch expectation with two forced outcomes.
        const chance = kitFor(b.player)[slot]?.stressRemovalChance || 0
        if (chance && h !== f && h + f >= 12) continue
        damage += d
        kills += Number(n.status === 'victory')
        min = Math.min(min, d)
      }
    if (kitFor(b.player)[slot]?.stressRemovalChance) continue
    // Combo d4 distribution is tested by existing exact-tail tests, not fixed dice.
    if (slot && kitFor(b.player)[slot].type === 'combo') continue
    const p = preview(b.player, b.enemy, slot)
    assert.ok(Math.abs(p.expected - damage / 144) < 1e-9, `${name} ${slot}`)
    assert.ok(Math.abs(p.knockout - kills / 144) < 1e-9)
    assert.equal(p.minimum, min)
  }
})
