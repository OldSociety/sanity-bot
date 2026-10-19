const test = require('node:test'),
  assert = require('node:assert/strict')
process.env.NODE_ENV = 'development'
// Exercise the retained unfinished-character template independently of Hendrix.
require('./fixtures/arena-historical-profile.cjs')()
const {
  resolveCharacter,
  isSelectable,
} = require('../services/arena/characters')
const {
  newBattle,
  advance,
  beginFinisher,
} = require('../services/arena/combat')
const {
  kitFor,
  canUse,
  finisherPercent,
  balance,
} = require('../services/arena/rules')
const {
  familyFor,
  variantsFor,
  createMemoryPreferences,
} = require('../services/arena/selection')
const { screen } = require('../services/arena/interface')
const { framedArtFiles } = require('../services/arena/art')
const { createArena } = require('../services/arena/controller')
const make = () =>
  newBattle(6, { character: resolveCharacter('Hendrix'), opponent: 'Hendrix' })
delete require('../services/arena/rules').balance.damageRules // Historical quarter-Block fixture.
delete require('../services/arena/rules').balance.damageRounding
test('template is blocked when production rollout is disabled, and in Idle', () => {
  const { execFileSync } = require('node:child_process')
  execFileSync(
    process.execPath,
    [
      '-e',
      `require('./config/arena-testing.json').productionCurrentRules=false;const a=require('node:assert/strict'),{resolveCharacter,isSelectable}=require('./services/arena/characters'),{newBattle}=require('./services/arena/combat');const c=resolveCharacter('Hendrix');a(!isSelectable(c));a.throws(()=>newBattle(0,{character:c}),/development/);a.throws(()=>newBattle(0,{opponent:c.id}),/development/)`,
    ],
    { env: { ...process.env, NODE_ENV: 'production' } }
  )
  assert.throws(
    () =>
      newBattle(0, { character: resolveCharacter('Hendrix'), mode: 'idle' }),
    /development/
  )
})
test('Hendrix uses the reusable template, Classic artwork, Martial Artist selection and no passive', async () => {
  const c = resolveCharacter('Hendrix'),
    b = make(),
    family = familyFor(c)
  assert(isSelectable(c))
  assert.equal(c.name, 'Hendrix [Template]')
  assert.equal(c.version, 'Classic')
  assert.equal(c.rarity, 'bronze')
  assert.match(c.image, /Classic[\\/]HENDRIX_BADGE.png$/)
  assert(require('node:fs').existsSync(c.image))
  assert.deepEqual(
    [b.player.hp, b.player.attack, b.player.stress, b.player.passive],
    [200, 200, 6, null]
  )
  assert.equal(family.role, 'Martial Artist')
  assert.deepEqual(variantsFor(family), [c])
  const template = require('../config/arena-templates-development.json')
  assert.deepEqual(balance.characters[c.kit], template.abilities)
  const session = {
    id: 'template',
    revision: 0,
    character: c,
    opponent: 'Hendrix',
    level: 1,
    manualOpponentSelection: true,
  }
  for (const page of ['characters', 'skins']) {
    const view = screen({ ...session, page })
    assert.match(view.embeds[0].data.description, /Template/)
    assert(!view.embeds[0].data.fields?.some((f) => f.name === 'Passive'))
    const art = await framedArtFiles(c, 'Hendrix', page)
    assert(Buffer.isBuffer(art[0].attachment))
  }
  const view = screen({ ...session, page: 'skins' })
  const text = JSON.stringify(view)
  for (const name of ['[S1]', '[S2]', '[S3]']) assert(text.includes(name))
  assert.match(text, /200 HP/)
})
test('native B template S1/S2 each roll one Duality, add exactly one basic, spend once and never crit the special', () => {
  for (const slot of ['special1', 'special2'])
    for (let h = 1; h <= 12; h++)
      for (let f = 1; f <= 12; f++) {
        const b = make()
        b.player.stress = 3
        let rolls = 0
        const n = advance(
          b,
          { [slot]: true },
          () => 1,
          () => [h, f][rolls++],
          () => 99,
          () => 99,
          () => 99,
          () => 99,
          { actor: 'ability' }
        )
        const crit = h === f,
          hit = crit || h + f >= 12,
          damage = slot === 'special1' ? 16 : 48
        assert.equal(rolls, 2)
        assert.equal(n.playerBasicDamage, crit ? 12 : hit ? 6 : 2)
        assert.equal(n[slot + 'Damage'], hit ? damage : Math.ceil(damage / 4))
        assert.equal(
          n.player.stress,
          3 - Number(slot === 'special1') + Number(crit)
        )
        assert.equal(n.hopeSpent, slot === 'special2' ? 2 : 0)
        assert.equal(n.statistics.player.criticals[slot], 0)
        assert.equal(n.statistics.player.criticals.basic, Number(crit))
      }
  const b = make()
  b.player.stress = 0
  assert(!canUse(b.player, 'special1'))
})
test('template uses standard Finisher choices, guaranteed damage, five Hope once, and separate basic outcome', () => {
  for (let choice = 0; choice <= 5; choice++) {
    const b = make(),
      paid = beginFinisher(b)
    let rolls = 0
    const n = advance(
      paid,
      { special3: true, choice },
      () => 1,
      () => [1, 2][rolls++],
      () => 99,
      () => 99,
      () => 99,
      () => 99,
      { actor: 'ability' }
    )
    assert.equal(rolls, 2)
    assert.equal(n.special3Damage, 60 + 10 * choice)
    assert.equal(n.playerBasicDamage, 2)
    assert.equal(n.hopeSpent, 0)
    assert.equal(n.statistics.player.spent, 5)
    assert.equal(n.statistics.player.criticals.special3, 0)
    assert.equal(finisherPercent(b.player, choice), 30 + 5 * choice)
  }
  assert.equal(kitFor(make().enemy).special3.type, 'aiFinisher')
})
test('Hendrix character, skin, confirmation and fight flow saves the normal variant preference', async () => {
  let view
  const preferences = createMemoryPreferences()
  let serial = 0
  const arena = createArena({
    preferences,
    setTimer: () => ++serial,
    clearTimer: () => {},
    setExpiryTimer: () => ++serial,
    clearExpiryTimer: () => {},
    renderCard: async () => ({
      name: 'test.png',
      attachment: Buffer.from('test'),
    }),
  })
  const interaction = {
    id: 'template',
    guildId: 'guild',
    channelId: 'channel',
    user: { id: 'user' },
    reply: async (p) => {
      view = p
      return { id: 'message' }
    },
    editReply: async (p) => {
      view = p
    },
  }
  await arena.execute(interaction, resolveCharacter('Hendrix'), {
    selection: true,
  })
  const click = async (action, value) => {
    const id = view.components
      .flatMap((r) => r.components)
      .find((c) => c.data.custom_id.endsWith(':' + action))?.data.custom_id
    assert(id, action)
    await arena.handleButton({
      ...interaction,
      message: { id: 'message' },
      customId: id,
      values: value === undefined ? undefined : [value],
      isStringSelectMenu: () => value !== undefined,
      deferUpdate: async () => {},
    })
  }
  // A supplied variant remains selected in the normal character picker.
  assert.match(JSON.stringify(view), /Martial Artist/)
  await click('chooseskin')
  assert.match(JSON.stringify(view), /Choose Skin/)
  await click('confirmfighter')
  assert.match(JSON.stringify(view), /Hendrix.*Template/)
  await click('start')
  assert.match(view.embeds[0].data.title, /Hendrix \[Template\]/)
  assert.equal(preferences.get('guild', 'user').variantId, 'classic:hen')
  await arena.dispose()
})
