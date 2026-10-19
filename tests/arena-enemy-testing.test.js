const test = require('node:test'),
  assert = require('node:assert/strict')
process.env.NODE_ENV = 'development'
const { loadBalance } = require('../services/arena/balance-config')
const { newBattle, advance, takeTurn } = require('../services/arena/combat')
const { resolveCharacter } = require('../services/arena/characters')
const { availableOpponents } = require('../services/arena/opponents')
const { kitFor, canUse, specialPercent } = require('../services/arena/rules')
const { specialDamage, basicDamage } = require('../services/arena/damage')
const { decide } = require('../services/arena/tactics')
const { createArena } = require('../services/arena/controller')
const { cardName } = require('../services/arena/health-card')
const make = (opponent = 'Hellfed Marq') =>
  newBattle(0, { character: resolveCharacter('Azulis'), opponent })
const enemy = (b, accuracy = 0, critical = 99) =>
  advance(
    b,
    {},
    () => 1,
    undefined,
    () => 0,
    () => accuracy,
    () => critical,
    () => 0,
    {
      actor: 'enemy',
      aiPolicy: 'legacy',
      rollRecovery: () => 99,
      rollFinisher: () => 40,
    }
  )
test('development has five selectable enemies and matching ability damage; production stays frozen', () => {
  assert.deepEqual(
    new Set(availableOpponents().map((c) => c.kit)),
    new Set([
      'spooky-marq',
      'maxim',
      'hellfed-marq',
      'classic-azulis',
      'classic-hendrix',
    ])
  )
  assert.deepEqual(
    loadBalance('production'),
    require('../config/arena/arena-balance-production.json')
  )
  assert.equal(
    loadBalance('production').characters['classic-hendrix'],
    undefined
  )
  for (const c of availableOpponents()) {
    const b = make(c.id),
      p = kitFor({ ...b.player, kit: c.kit }),
      e = kitFor(b.enemy)
    for (const slot of ['special1', 'special2', 'special3'])
      for (const field of [
        'percent',
        'flatPercent',
        'percentByLevel',
        'ragePercent',
      ])
        assert.deepEqual(
          e[slot][field],
          p[slot][field],
          `${c.kit} ${slot} ${field}`
        )
    for (const slot of ['special1', 'special2'])
      assert.equal(
        specialDamage(b.enemy, slot, { total: 3, criticalMultiplier: 2 })
          .damage,
        specialDamage(b.enemy, slot, { total: 3 }).damage
      )
  }
})
test('Hellfed AI initializes Rage, pays next-tier HP, guarantees Stoke and has no Stress exhaustion', () => {
  for (const [rage, cost] of [
    [0, 3],
    [1, 6],
    [2, 8],
  ]) {
    const b = make()
    b.enemy.rage = rage
    assert.equal(b.enemy.maxStress, 0)
    assert.equal(b.enemy.stress, 0)
    assert.equal(canUse({ ...b.enemy, hope: 0 }, 'special1'), true)
    const n = enemy(b, 99)
    assert.equal(n.enemySpecial, 'special1')
    assert.equal(n.enemy.rage, rage + 1)
    assert.equal(n.enemy.hp, 260 - cost)
    assert.equal(n.enemyDamage, 6)
    assert.equal(n.enemy.stress, 0)
    assert.equal(n.history.find((e) => e.kind === 'special').resource, 'HP')
    assert.equal(n.history.find((e) => e.kind === 'special').cost, cost)
    assert.equal(
      decide(b.enemy, b.player, { resource: 0, roll: () => 99 })
        .exhaustedForKnockout,
      false
    )
  }
  const b = make()
  b.enemy.rage = 3
  assert.equal(canUse({ ...b.enemy, hope: 0 }, 'special1'), false)
  b.enemy.rage = 0
  b.enemy.hp = 3
  assert.equal(canUse({ ...b.enemy, hope: 0 }, 'special1'), false)
})
test('Hellfed AI Rage damage, Block decay and Finisher percentages use the live kit once', () => {
  let b = make()
  b.enemy.rage = 3
  b.enemy.fear = 2
  let n = enemy(b, 99)
  assert.equal(n.enemySpecial, 'special2')
  assert.equal(n.enemy.rage, 2)
  assert.equal(n.enemyDamage, Math.floor(6 * 0.75) + Math.floor(68 * 0.5))
  assert.equal(n.statistics.enemy.criticals.special2, 0)
  b = make()
  b.enemy.rage = 3
  b.enemy.fear = 5
  n = enemy(b, 0, 0)
  assert.equal(n.enemySpecial, 'special3')
  assert.equal(specialPercent(b.enemy, 'special3'), 64)
  assert.equal(n.history.find((e) => e.kind === 'special').percent, 64)
  assert.equal(n.enemyDamage, 12 + 128)
  assert.equal(n.statistics.enemy.criticals.special3, 0)
  assert.equal(n.enemy.fear, 1)
  assert.equal(n.enemy.rage, 3)
})
test('Azulis enemy healing survives Block and Starlight stays normal during a basic critical', () => {
  const b = make('Azulis')
  b.enemy.hp = 100
  const n = enemy(b, 99)
  assert.equal(n.enemySpecial, 'special1')
  assert.equal(n.enemy.hp, 114)
  assert.equal(n.enemy.stress, 5)
  assert.equal(n.enemyDamage, Math.floor(Math.floor(190 * 0.03) * 0.75))
  b.enemy.hp = 230
  b.enemy.fear = 2
  const crit = enemy(b, 0, 0),
    event = crit.history.find((e) => e.kind === 'special')
  assert.equal(event.slot, 'special2')
  assert.equal(event.damage, 41)
  assert.equal(event.outcome, 'hit')
  assert.equal(crit.enemyDamage, 11 + 41)
  assert.equal(crit.statistics.enemy.criticals.special2, 0)
})
function fixture() {
  let view
  const sessions = []
  let serial = 0
  const arena = createArena({
    chooseOpponent: () => {
      throw Error('Manual selection must not randomize')
    },
    setTimer: () => ++serial,
    clearTimer: () => {},
    setExpiryTimer: () => ++serial,
    clearExpiryTimer: () => {},
    renderCard: async (s) => ({
      name: cardName(s),
      attachment: Buffer.from('test'),
    }),
    rollDuality: () => 6,
    rollAccuracy: () => 99,
    rollCritical: () => 99,
    rollRecovery: () => 99,
    logger: {
      warn: () => {},
      error: (...a) => {
        throw Error(a.join(' '))
      },
    },
  })
  const interaction = {
    id: 'enemy',
    guildId: 'guild',
    channelId: 'channel',
    user: { id: 'owner' },
    reply: async (p) => {
      view = p
      return { id: 'message' }
    },
    editReply: async (p) => {
      view = p
    },
    followUp: async () => {},
  }
  const controls = () => view.components.flatMap((r) => r.components)
  const id = (action) =>
    controls().find((c) => c.data.custom_id.endsWith(':' + action))?.data
      .custom_id
  const click = async (action, value, extra = {}) =>
    arena.handleButton({
      ...interaction,
      message: { id: 'message' },
      customId: id(action),
      values: value === undefined ? undefined : [value],
      isStringSelectMenu: () => value !== undefined,
      deferUpdate: async () => {},
      ...extra,
    })
  return {
    arena,
    open: () => arena.execute(interaction, resolveCharacter('Azulis')),
    click,
    id,
    controls,
    get view() {
      return view
    },
  }
}
test('enemy picker validates values, persists rematches, supports Hellfed and blocks active/stale/foreign changes', async () => {
  const f = fixture()
  await f.open()
  const options = f
    .controls()
    .find((c) => c.data.type === 3)
    .options.map((o) => o.data.value)
  assert.equal(options.length, 5)
  const stale = f.id('opponent')
  await f.click('opponent', 'classic:sel')
  assert.match(f.view.embeds[0].data.description, /Marq \[Spooky\]/)
  await f.click('opponent', 'spooky-2026:hfm')
  assert.match(f.view.embeds[0].data.description, /Marq \[Hell-fed\]/)
  assert.match(f.view.embeds[0].data.description, /Rage 0\/3/)
  await f.click('opponent', 'classic:azu', { customId: stale })
  assert.match(f.view.embeds[0].data.description, /Hell-fed/)
  await f.click('opponent', 'classic:azu', {
    user: { id: 'foreign' },
    reply: async () => {},
  })
  assert.match(f.view.embeds[0].data.description, /Hell-fed/)
  const activeForge = f.id('opponent')
  await f.click('start')
  assert.match(f.view.embeds[0].data.title, /Marq/)
  await f.click('opponent', 'classic:azu', { customId: activeForge })
  await f.click('quit')
  await f.click('start')
  assert.match(f.view.embeds[0].data.title, /Marq/)
  await f.click('quit')
  await f.click('opponent', 'classic:azu')
  await f.click('start')
  assert.match(f.view.embeds[0].data.title, /Azulis vs Azulis/)
  await f.arena.dispose()
})
