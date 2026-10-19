const test = require('node:test'),
  assert = require('node:assert/strict')
const fs = require('node:fs'),
  path = require('node:path')
const { createArena } = require('../services/arena/controller')
const { resolveCharacter } = require('../services/arena/characters')
const { bannerName } = require('../services/arena/art')
const {
  roster,
  familyFor,
  variantsFor,
  groupsFor,
  createMemoryPreferences,
  createPreferenceStore,
} = require('../services/arena/selection')
const components = (view) => view.components.flatMap((row) => row.components)
function fixture(preferences = createMemoryPreferences()) {
  let clock = 0,
    serial = 0,
    view,
    acknowledgements = 0
  const edits = [],
    notices = [],
    timers = new Map()
  const set = (callback, ms) => {
    const id = ++serial
    timers.set(id, { callback, at: clock + ms })
    return id
  }
  const arena = createArena({
    chooseOpponent: () => 'maxim',
    rollRecovery: () => 99.999,
    preferences,
    now: () => clock,
    setTimer: set,
    clearTimer: (id) => timers.delete(id),
    setExpiryTimer: set,
    clearExpiryTimer: (id) => timers.delete(id),
    rollDuality: () => 6,
    rollFearSpend: () => 99.999,
    rollAccuracy: () => 0,
    rollCritical: () => 99,
  })
  const interaction = {
    id: 'select',
    guildId: 'g',
    channelId: 'c',
    user: { id: 'alice' },
    reply: async (payload) => {
      view = payload
      return { id: 'm' }
    },
    editReply: async (payload) => {
      view = payload
      edits.push(payload)
    },
    followUp: async (payload) => notices.push(payload),
  }
  const control = (action) =>
    components(view).find((item) => item.data.custom_id.endsWith(':' + action))
  const revision = () =>
    Number(components(view)[0].data.custom_id.split(':')[2])
  const click = (action, value, overrides = {}) =>
    arena.handleButton({
      ...interaction,
      message: { id: 'm' },
      customId: overrides.customId || `arena:select:${revision()}:${action}`,
      values: value === undefined ? undefined : [value],
      isStringSelectMenu: () => value !== undefined,
      deferUpdate: async () => {
        acknowledgements++
      },
      reply: async (payload) => notices.push(payload),
      ...overrides,
    })
  const open = (character) =>
    arena.execute(interaction, character, { selection: true })
  const elapse = async (ms) => {
    const until = clock + ms
    while (true) {
      const next = [...timers.entries()]
        .filter(([, t]) => t.at <= until)
        .sort((a, b) => a[1].at - b[1].at)[0]
      if (!next) break
      timers.delete(next[0])
      clock = next[1].at
      await next[1].callback()
    }
    clock = until
  }
  return {
    arena,
    interaction,
    preferences,
    edits,
    notices,
    timers,
    open,
    click,
    elapse,
    control,
    revision,
    view: () => view,
    acknowledgements: () => acknowledgements,
  }
}

test('four player/AI pairings use exactly the supplied banner mappings', () => {
  const marq = resolveCharacter('Marq [Spooky]'),
    maxim = resolveCharacter('Maxim [Spooky]')
  assert.equal(bannerName(marq, 'maxim'), 'mvm-banner-wide.png')
  assert.equal(bannerName(marq, 'marq'), 'marq-vs-marq.png')
  assert.equal(bannerName(maxim, 'marq'), 'maxim-vs-marq.png')
  assert.equal(bannerName(maxim, 'maxim'), 'maxim-vs-maxim.png')
})

test('family grouping preserves distinct Marq variant identities, kits and availability', () => {
  const spooky = resolveCharacter('Marq [Spooky]'),
    hell = resolveCharacter('Marq [Hell-fed]')
  assert.equal(familyFor(spooky), familyFor(hell))
  assert.notEqual(spooky.id, hell.id)
  assert.notEqual(spooky.kit, hell.kit)
  assert.deepEqual(
    variantsFor(familyFor(spooky)).map((item) => item.id),
    [spooky.id]
  )
  assert.deepEqual(
    roster.map((item) => item.name),
    ['Marq', 'Maxim']
  )
})

test('large rosters use alphabetical groups with at most 25 fighters, without dropping entries', () => {
  const entries = Array.from({ length: 61 }, (_, i) => ({
    id: String(i),
    name: `${i < 20 ? 'A' : i < 40 ? 'B' : 'C'} Fighter ${String(i).padStart(
      2,
      '0'
    )}`,
  })).reverse()
  const groups = groupsFor(entries)
  assert.ok(groups.length > 1)
  assert.ok(groups.every((group) => group.entries.length <= 25))
  assert.deepEqual(
    groups.flatMap((group) => group.entries).map((entry) => entry.name),
    entries.map((entry) => entry.name).sort()
  )
  assert.equal(
    new Set(groups.flatMap((group) => group.entries).map((entry) => entry.id))
      .size,
    61
  )
})

test('character lore leads to skin stats before confirmation, with changed art attachments', async () => {
  const f = fixture()
  try {
    await f.open()
    assert.equal(f.view().embeds[0].data.title, 'Choose Your Fighter')
    assert.match(f.view().embeds[0].data.description, /steadfast juggernaut/)
    assert.doesNotMatch(
      JSON.stringify(f.view().embeds),
      /On the Brink|HP|Attack/
    )
    assert.deepEqual(
      f
        .control('selectcharacter')
        .toJSON()
        .options.map((option) => option.label),
      ['Marq', 'Maxim']
    )
    assert.equal(f.control('start'), undefined)
    const openingRevision = f.revision()
    await f.click('start')
    assert.equal(f.revision(), openingRevision)
    await f.click('selectcharacter', 'maxim')
    assert.match(f.view().embeds[0].data.description, /warrior’s resolve/)
    assert.match(f.view().files[0].name, /max/)
    await f.click('chooseskin')
    assert.equal(f.view().embeds[0].data.title, 'Maxim — Choose Skin')
    assert.match(f.view().embeds[0].data.description, /220 HP · 220 Attack/)
    assert.match(JSON.stringify(f.view().embeds), /Deadly Focus|Slayer/)
    await f.click('confirmfighter')
    assert.equal(f.view().embeds[0].data.title, '⚔️ Arena')
    assert.equal(f.control('selectskin'), undefined)
    assert.match(f.view().embeds[0].data.image.url, /maxim-vs-maxim.png/)
    assert.equal(f.view().files.length, 1)
    assert.deepEqual(f.view().attachments, [])
    await f.click('opponent')
    assert.match(f.view().embeds[0].data.image.url, /maxim-vs-maxim.png/)
    await f.click('start')
    const healthImage = f.view().files[0].name
    assert.match(healthImage, /arena-health-/)
    await f.elapse(3500)
    assert.equal(f.view().files[0].name, healthImage)
    assert.match(f.view().embeds[0].data.title, /Maxim vs Maxim · 0/)
    await f.click('basic')
    assert.notEqual(f.view().files[0].name, healthImage)
    assert.match(f.view().embeds[0].data.title, /Maxim vs Maxim · 1/)
  } finally {
    await f.arena.dispose()
  }
})

test('back navigation, confirmed preferences and server/player isolation', async () => {
  const preferences = createMemoryPreferences(),
    f = fixture(preferences)
  try {
    await f.open()
    await f.click('selectcharacter', 'maxim')
    assert.equal(preferences.get('g', 'alice'), undefined)
    await f.click('chooseskin')
    await f.click('backcharacters')
    assert.equal(
      f
        .control('selectcharacter')
        .toJSON()
        .options.find((option) => option.default).value,
      'maxim'
    )
    await f.click('chooseskin')
    await f.click('confirmfighter')
    assert.deepEqual(preferences.get('g', 'alice'), {
      familyId: 'maxim',
      variantId: 'spooky-2026:max',
    })
    await f.click('backskins')
    assert.equal(f.view().embeds[0].data.title, 'Maxim — Choose Skin')
    await f.click('backcharacters')
    await f.open()
    assert.equal(
      f
        .control('selectcharacter')
        .toJSON()
        .options.find((option) => option.default).value,
      'maxim'
    )
    assert.equal(preferences.get('other', 'alice'), undefined)
    assert.equal(preferences.get('g', 'other'), undefined)
  } finally {
    await f.arena.dispose()
  }
})

test('foreign, stale, cross-family, hidden and wrong-page controls cannot change selections or bypass confirmation', async () => {
  const f = fixture()
  try {
    await f.open()
    const initial = JSON.stringify(f.view())
    await f.click('selectcharacter', 'maxim', { user: { id: 'other' } })
    assert.equal(JSON.stringify(f.view()), initial)
    await f.click('selectcharacter', 'maxim', { guildId: 'wrong' })
    assert.equal(JSON.stringify(f.view()), initial)
    await f.click('selectcharacter', 'maxim', {
      customId: 'arena:select:999:selectcharacter',
    })
    await f.click('confirmfighter')
    await f.click('idle')
    assert.equal(JSON.stringify(f.view()), initial)
    await f.click('chooseskin')
    const skin = JSON.stringify(f.view())
    for (const value of ['spooky-2026:max', 'spooky-2026:hfm', 'invalid'])
      await f.click('selectskin', value)
    assert.equal(JSON.stringify(f.view()), skin)
    await f.click('selectskin', 'spooky-2026:mrq', {
      values: ['spooky-2026:mrq', 'spooky-2026:max'],
    })
    assert.equal(JSON.stringify(f.view()), skin)
  } finally {
    await f.arena.dispose()
  }
})

test('selection inactivity resets only on valid input and clears menus after fifteen seconds', async () => {
  const f = fixture()
  try {
    await f.open()
    await f.elapse(14000)
    await f.click('chooseskin')
    await f.elapse(14000)
    assert.ok(f.view().components.length)
    await f.click('selectskin', 'spooky-2026:max')
    await f.elapse(1000)
    assert.deepEqual(f.view().components, [])
    assert.equal(f.notices.length, 1)
    await f.click('confirmfighter', undefined, {
      customId: 'arena:select:1:confirmfighter',
    })
    assert.deepEqual(f.view().components, [])
  } finally {
    await f.arena.dispose()
  }
})

test('Quit and results offer fighter change; an old skin menu cannot modify active combat', async () => {
  const f = fixture()
  try {
    await f.open()
    await f.click('chooseskin')
    const old = f.revision()
    await f.click('confirmfighter')
    await f.click('start')
    const active = JSON.stringify(f.view())
    await f.click('selectskin', 'spooky-2026:max', {
      customId: `arena:select:${old}:selectskin`,
    })
    assert.equal(JSON.stringify(f.view()), active)
    await f.click('quit')
    assert.ok(f.control('changefighter'))
    await f.click('changefighter')
    assert.equal(f.view().embeds[0].data.title, 'Choose Your Fighter')
    assert.equal(f.control('start'), undefined)
  } finally {
    await f.arena.dispose()
  }
})

test('confirmed UI preferences survive store recreation without touching gameplay storage', () => {
  const dir = fs.mkdtempSync(
      path.resolve(__dirname, '../artifacts/arena-preferences-')
    ),
    file = path.join(dir, 'preferences.json')
  try {
    const value = { familyId: 'marq', variantId: 'spooky-2026:mrq' }
    createPreferenceStore(file).set('g', 'alice', value)
    assert.deepEqual(createPreferenceStore(file).get('g', 'alice'), value)
    assert.equal(createPreferenceStore(file).get('g', 'other'), undefined)
  } finally {
    if (fs.existsSync(file)) fs.unlinkSync(file)
    if (fs.existsSync(file + '.tmp')) fs.unlinkSync(file + '.tmp')
    fs.rmdirSync(dir)
  }
})

test('real dispatcher handles Arena select interactions only in development guild', async (t) => {
  const dispatcher = require('../Events/interactionCreate'),
    singleton = require('../services/arena/controller').arena
  const original = singleton.handleButton,
    before = { env: process.env.NODE_ENV, guild: process.env.GUILDID }
  let calls = 0
  singleton.handleButton = async () => {
    calls++
  }
  t.after(() => {
    singleton.handleButton = original
    for (const [key, value] of [
      ['NODE_ENV', before.env],
      ['GUILDID', before.guild],
    ]) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  const interaction = {
    guildId: 'g',
    customId: 'arena:s:0:selectcharacter',
    isChatInputCommand: () => false,
    isButton: () => false,
    isStringSelectMenu: () => true,
    reply: async () => {},
  }
  process.env.NODE_ENV = 'development'
  process.env.GUILDID = 'g'
  await dispatcher.execute(interaction)
  assert.equal(calls, 1)
  process.env.NODE_ENV = 'production'
  await dispatcher.execute(interaction)
  assert.equal(calls, 1)
  process.env.NODE_ENV = 'development'
  await dispatcher.execute({ ...interaction, guildId: 'wrong' })
  assert.equal(calls, 1)
})
