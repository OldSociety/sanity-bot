const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
require('./arena-historical-profile.cjs')()
const {
  resolveCharacter,
  isSelectable,
} = require('../../services/arena/characters')
const { newBattle, advance, takeTurn } = require('../../services/arena/combat')
const { canUse, kitFor, specialPercent } = require('../../services/arena/rules')
const { specialDamage } = require('../../services/arena/damage')
const { decide } = require('../../services/arena/tactics')
const azulis = resolveCharacter('Azulis')
const make = () => newBattle(5, { character: azulis, opponent: 'Azulis' })
const dice =
  (...values) =>
  () =>
    values.shift()
const act = (b, action, duality = dice(8, 4)) =>
  advance(
    b,
    action,
    () => 1,
    duality,
    () => 99,
    () => 99,
    () => 99,
    () => 99,
    { actor: 'ability' }
  )
test('registration, existing artwork, stats, no passive and single Classic variant', () => {
  assert.ok(isSelectable(azulis))
  assert.equal(
    newBattle(0, { opponent: 'classic-azulis' }).enemy.kit,
    'classic-azulis'
  )
  assert.match(azulis.image, /Classic[\\/]AZULIS_BADGE.png$/)
  assert.ok(fs.existsSync(azulis.image))
  const b = make()
  assert.deepEqual(
    [b.player.hp, b.player.attack, b.player.stress, b.player.passive],
    [230, 190, 6, null]
  )
  const { familyFor, variantsFor } = require('../../services/arena/selection')
  assert.deepEqual(
    variantsFor(familyFor(azulis)).map((v) => v.version),
    ['Classic']
  )
  assert.throws(
    () => newBattle(0, { character: azulis, mode: 'idle' }),
    /development/
  )
})
test('healing cap, cost, no special damage, basic and Hope roll', () => {
  for (const [hp, healed] of [
    [220, 10],
    [180, 14],
    [50, 14],
  ]) {
    const b = make()
    b.player.hp = hp
    const n = act(b, 'special1')
    assert.equal(n.player.hp, hp + healed)
    assert.equal(n.player.stress, 5)
    assert.equal(n.special1Damage, 0)
    assert.equal(n.playerBasicDamage, 6)
    assert.equal(n.player.hope, 6)
    assert.equal(n.statistics.player.hpRestored, healed)
    assert.equal(n.statistics.player.stressSpent, 1)
  }
  const b = make()
  assert.equal(canUse(b.player, 'special1'), false)
  assert.equal(act(b, 'special1'), b)
  b.player.hp = 50
  b.player.stress = 0
  assert.equal(canUse(b.player, 'special1'), false)
})
test('misses, Fear and critical behavior preserved; critical recovery is independent', () => {
  const b = make()
  b.player.hp = 100
  const miss = act(b, 'special1', dice(1, 2))
  assert.equal(miss.player.hp, 114)
  assert.equal(miss.playerBasicDamage, 2)
  assert.equal(miss.enemy.fear, 1)
  b.player.criticalReady = true
  const crit = act(b, 'special1', dice(6, 6))
  assert.equal(crit.playerBasicDamage, 12)
  assert.equal(crit.player.criticalReady, false)
  assert.equal(crit.player.stress, 6)
  assert.equal(crit.enemy.stress, 5)
})
test('all 144 Duality outcomes retain basic accuracy, income, critical and healing rules', () => {
  for (let h = 1; h <= 12; h++)
    for (let f = 1; f <= 12; f++) {
      const b = make()
      b.player.hp = 100
      b.player.hope = 0
      const n = act(b, 'special1', dice(h, f))
      assert.equal(n.player.hp, 114)
      assert.equal(n.special1Damage, 0)
      assert.equal(n.playerBasicDamage, h === f ? 12 : h + f >= 12 ? 6 : 2)
      assert.equal(n.player.hope, Number(h >= f))
      assert.equal(n.enemy.fear, Number(f > h))
      assert.equal(n.player.stress, 5 + Number(h === f))
      assert.equal(n.player.criticalReady, false)
    }
})
test('AI Regeneration heals even on a missed basic and never adds direct damage', () => {
  const b = make()
  b.player.hope = 0
  b.enemy.hp = 100
  b.enemy.fear = 0
  const n = advance(
    b,
    {},
    () => 1,
    undefined,
    () => 99,
    () => 99,
    () => 99,
    () => 99,
    { actor: 'enemy', rollRecovery: () => 99 }
  )
  assert.equal(n.enemySpecial, 'special1')
  assert.equal(n.enemy.hp, 114)
  assert.equal(n.enemy.stress, 5)
  assert.equal(n.enemyDamage, 2)
  assert.equal(n.statistics.enemy.hpRestored, 14)
})
test('last Stress vulnerability and sequential response; S2/S3 costs, damage and coefficients', () => {
  const b = make()
  b.player.hp = 100
  b.player.stress = 1
  const n = takeTurn(
    b,
    'special1',
    () => 1,
    dice(8, 4),
    () => 99,
    () => 0,
    () => 99,
    () => 99,
    { rollRecovery: () => 99 }
  )
  assert.equal(n.player.stress, 0)
  assert.equal(n.player.hp, 106) // 100 + 14 - ceil(190*3%*1.25)
  assert.equal(kitFor(b.player).special2.hopeCost, 2)
  assert.equal(act(b, 'special2').special2Damage, 42)
  assert.equal(act(b, 'special2').player.hope, 4)
  assert.equal(kitFor(b.player).special3.hopeCost, 5)
  assert.equal(kitFor(b.player).special3.responseMs, 4000)
  for (const [choice, damage] of [57, 67, 76, 86, 95, 105].entries())
    assert.equal(specialDamage(b.player, 'special3', { choice }).damage, damage)
  assert.equal(specialPercent(b.enemy, 'special3'), 45)
  assert.deepEqual(kitFor(b.player), kitFor(b.enemy))
})
test('AI avoids cap waste and last Stress, but takes lethal offense', () => {
  const b = make()
  b.player.hope = 0
  b.enemy.fear = 0
  b.enemy.hp = 225
  assert.equal(decide(b.enemy, b.player).slot, null)
  b.enemy.hp = 100
  b.enemy.stress = 3
  assert.equal(decide(b.enemy, b.player).slot, 'special1')
  b.enemy.stress = 1
  assert.equal(decide(b.enemy, b.player).slot, null)
  b.enemy.fear = 2
  b.player.hp = 30
  assert.equal(decide(b.enemy, b.player).slot, 'special2')
})
test('real selector -> Classic -> confirmation -> fight and four-second Finisher', async () => {
  const { createArena } = require('../../services/arena/controller')
  const { createMemoryPreferences } = require('../../services/arena/selection')
  let view
  let capturedSession
  const timers = []
  const preferences = createMemoryPreferences()
  const arena = createArena({
    chooseOpponent: () => 'maxim',
    preferences,
    setExpiryTimer: () => null,
    clearExpiryTimer() {},
    setTimer: (fn, ms) => {
      timers.push(ms)
      return null
    },
    clearTimer() {},
    renderCard: async (session) => {
      capturedSession = session
      return require('../../services/arena/health-card').renderHealthCard(
        session
      )
    },
  })
  const i = {
    id: 'azu',
    guildId: 'g',
    channelId: 'c',
    user: { id: 'u' },
    reply: async (p) => {
      view = p
      return { id: 'm' }
    },
    editReply: async (p) => {
      view = p
    },
  }
  const click = async (action, value) => {
    const id = view.components
      .flatMap((r) => r.components)[0]
      .data.custom_id.split(':')[2]
    await arena.handleButton({
      ...i,
      message: { id: 'm' },
      customId: `arena:azu:${id}:${action}`,
      values: value ? [value] : undefined,
      isStringSelectMenu: () => Boolean(value),
      deferUpdate: async () => {},
    })
  }
  try {
    await arena.execute(i, undefined, { selection: true })
    await click('selectcharacter', 'azulis')
    await click('chooseskin')
    const e = view.embeds[0].data
    assert.match(e.description, /230 HP · 190 Attack/)
    assert.equal(e.fields[0].name, 'S1 · Regeneration — 1 Stress')
    assert.match(e.fields[0].value, /Restore 6% max HP/)
    assert.equal(e.fields[1].name, 'S2 · Starlight — 2 Hope')
    assert.match(e.fields[1].value, /22% Attack/)
    assert.equal(e.fields[2].name, 'S3 · Falling Star — 5 Hope')
    assert.match(e.fields[2].value, /Guaranteed Finisher/)
    await click('confirmfighter')
    assert.equal(preferences.get('g', 'u').variantId, 'classic:azu')
    await click('start')
    capturedSession.battle.player.hope = 5
    await click('special3')
    assert.ok(timers.some((ms) => ms <= 4000 && ms > 3900))
    assert.match(view.embeds[0].data.description, /within 4 seconds/)
  } finally {
    await arena.dispose()
  }
})
