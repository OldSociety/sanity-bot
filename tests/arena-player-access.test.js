const test = require('node:test'), assert = require('node:assert/strict')
process.env.NODE_ENV = 'development'
const { accessSnapshot, createPlayerAccess, starterIds } = require('../services/arena/player-access')
const { rosterFor, groupsFor, variantsFor, familyFor, createMemoryPreferences } = require('../services/arena/selection')
const { characters, resolveCharacter, isSelectable } = require('../services/arena/characters')
const { createArena } = require('../services/arena/controller')

test('only three classics plus exact permanent badge unlocks are selectable', () => {
  const access = accessSnapshot({ badgeIds: ['spooky-2026:sel', 'spooky-2026:had', 'fake:mrq'] })
  assert.deepEqual(new Set(access.allowedVariantIds), new Set([...starterIds, 'spooky-2026:sel']))
  assert.deepEqual(rosterFor(access.allowedVariantIds).map(family => family.id).sort(), ['azulis', 'hendrix', 'kylax', 'selene'])
  assert(groupsFor(rosterFor(access.allowedVariantIds)).every(group => group.entries.every(family => !['marq', 'maxim'].includes(family.id))))
  const marq = familyFor(resolveCharacter('spooky-2026:mrq'))
  const half = accessSnapshot({ badgeIds: ['spooky-2026:hfm'] })
  assert.deepEqual(variantsFor(marq, half.allowedVariantIds).map(character => character.id), ['spooky-2026:hfm'])
})

test('diagnostic bypass never grants ownership or reveals hidden/unimplemented fighters', () => {
  const access = accessSnapshot({ badgeIds: ['spooky-2026:sel'], diagnostic: true, level: 7 })
  assert.equal(access.level, 7)
  assert.equal(access.allowedVariantIds.length, characters.filter(isSelectable).length)
  assert.equal(access.unlockedVariantIds.length, 4)
  assert(!access.allowedVariantIds.includes('template:default'))
  assert(!access.allowedVariantIds.includes('classic:sel'))
  assert(!accessSnapshot({ badgeIds: ['spooky-2026:sel'], diagnostic: false }).allowedVariantIds.includes('spooky-2026:mrq'))
  assert.throws(() => accessSnapshot({ diagnostic: 'false' }), /Invalid/)
})

test('badge reads are scoped to guild/player, fail closed to starters, and diagnostic errors do not bypass locks', async () => {
  const calls = [], warnings = []
  let failed = false, diagnostic = false
  const read = createPlayerAccess({
    ownedBadges: async (guild, player) => { calls.push([guild, player]); if (failed) throw Error('offline'); return ['spooky-2026:sel'] },
    playerLevel: async () => ({ level: 4, xp: 0 }),
    diagnostics: async () => { if (diagnostic === 'error') throw Error('offline'); return diagnostic },
    logger: { warn: message => warnings.push(message) },
  })
  const interaction = { guildId: 'guild', user: { id: 'player' } }
  assert.equal((await read(interaction)).level, 4)
  assert.deepEqual(calls, [['guild', 'player']])
  failed = true
  let result = await read(interaction)
  assert.deepEqual(new Set(result.allowedVariantIds), new Set(starterIds))
  assert.equal(result.ownershipUnavailable, true)
  diagnostic = true
  assert.equal((await read(interaction)).allowedVariantIds.length, 7)
  diagnostic = 'error'
  assert.equal((await read(interaction)).allowedVariantIds.length, 3)
  assert(warnings.length)
})

function fixture(initial = accessSnapshot(), saved = null) {
  let access = initial, view, serial = 0, starts = [], hold = null
  const preferences = createMemoryPreferences()
  if (saved) preferences.set('guild', 'player', { variantId: saved })
  const arena = createArena({ responsive: false, preferences, getPlayerAccess: async () => access,
    setExpiryTimer: () => 0, clearExpiryTimer: () => {}, setTimer: () => 0, clearTimer: () => {},
    logger: { warn: () => {}, error: () => {} },
    engine: { newBattle: (_, options) => { starts.push(options); throw Error('MOCK_BATTLE_STARTED') },
      takeTurn: () => { throw Error('No combat may run') }, beginFinisher: () => { throw Error('No combat may run') } },
  })
  const apply = async payload => {
    if (hold) { const current = hold; hold = null; current.began(); await current.gate }
    view = payload; return { id: 'message' }
  }
  const interaction = { id: 'session', user: { id: 'player' }, guildId: 'guild', channelId: 'channel',
    reply: apply, editReply: apply, followUp: async () => {} }
  const components = () => view.components.flatMap(row => row.toJSON().components)
  const control = action => components().find(item => item.custom_id.endsWith(`:${action}`))
  const revision = () => Number(components()[0].custom_id.split(':')[2])
  const click = (action, value, overrides = {}) => arena.handleButton({ ...interaction, message: { id: 'message' },
    customId: `arena:session:${revision()}:${action}`, values: value ? [value] : [], isStringSelectMenu: () => Boolean(value), deferUpdate: async () => {}, ...overrides,
  })
  return { arena, starts, control, click, preferences, setAccess: value => { access = value }, get view() { return view },
    open: (character, options = {}) => arena.execute(interaction, character, { selection: true, ...options }),
    holdNextEdit: () => {
      let release, began
      const gate = new Promise(resolve => { release = resolve })
      const waiting = new Promise(resolve => { began = resolve })
      hold = { gate, began }
      return { release, waiting }
    },
  }
}

test('locked saved/explicit choices fall back safely and are hidden from both dropdowns without overwriting preferences', async () => {
  const f = fixture(accessSnapshot({ badgeIds: ['spooky-2026:sel'] }), 'spooky-2026:mrq')
  try {
    await f.open()
    assert.deepEqual(f.control('selectcharacter').options.map(option => option.value).sort(), ['azulis', 'hendrix', 'kylax', 'selene'])
    assert.equal(f.preferences.get('guild', 'player').variantId, 'spooky-2026:mrq')
    await f.click('selectcharacter', 'marq')
    await f.click('chooseskin')
    assert.deepEqual(f.control('selectskin').options.map(option => option.value), ['classic:azu'])
    await f.click('selectskin', 'spooky-2026:mrq')
    await f.click('confirmfighter')
    await assert.rejects(f.click('start'), /MOCK_BATTLE_STARTED/)
    assert.equal(f.starts[0].character.id, 'classic:azu')
  } finally { await f.arena.dispose() }
  const direct = fixture(accessSnapshot())
  try {
    await direct.open(resolveCharacter('spooky-2026:mrq'))
    assert.equal(direct.control('selectcharacter').options.find(option => option.default).value, 'azulis')
  } finally { await direct.arena.dispose() }
})

test('shared level follows every owned character and is passed to the existing engine at fight start', async () => {
  const f = fixture(accessSnapshot({ badgeIds: ['spooky-2026:sel'], level: 6 }))
  try {
    await f.open()
    await f.click('selectcharacter', 'selene')
    await f.click('chooseskin')
    assert.match(f.view.embeds[0].data.description, /Level 6/)
    await f.click('backcharacters')
    await f.click('selectcharacter', 'azulis')
    await f.click('chooseskin')
    assert.match(f.view.embeds[0].data.description, /Level 6/)
    await f.click('confirmfighter')
    await assert.rejects(f.click('start'), /MOCK_BATTLE_STARTED/)
    assert.equal(f.starts[0].level, 6)
    assert.equal(f.starts[0].character.id, 'classic:azu')
  } finally { await f.arena.dispose() }
})

test('diagnostic selection cannot start a locked fighter after diagnostics turns off', async () => {
  const f = fixture(accessSnapshot({ diagnostic: true }))
  try {
    await f.open(resolveCharacter('spooky-2026:mrq'))
    assert.equal(f.control('selectcharacter').options.length, 6)
    await f.click('chooseskin')
    await f.click('confirmfighter')
    f.setAccess(accessSnapshot())
    await f.click('start')
    assert.equal(f.starts.length, 0)
    assert.equal(f.control('selectcharacter').options.length, 3)
    assert.equal(f.control('selectcharacter').options.find(option => option.default).value, 'azulis')
  } finally { await f.arena.dispose() }
})

test('new badge unlocks are visible without rebuilding character sheets or resetting shared levels', async () => {
  const f = fixture(accessSnapshot({ level: 8 }))
  try {
    await f.open()
    f.setAccess(accessSnapshot({ level: 8, badgeIds: ['spooky-2026:sel'] }))
    await f.click('selectcharacter', 'selene')
    await f.click('chooseskin')
    assert.match(f.view.embeds[0].data.description, /Level 8/)
    assert.equal(f.control('selectskin').options[0].value, 'spooky-2026:sel')
  } finally { await f.arena.dispose() }
})

test('every fresh player picker defaults to Classic Azulis even when an owned Maxim was saved; initial art matches', async () => {
  const f = fixture(accessSnapshot({ badgeIds: ['spooky-2026:max'] }), 'spooky-2026:max')
  try {
    await f.open()
    assert.equal(f.control('selectcharacter').options.find(option => option.default).value, 'azulis')
    assert.equal(f.view.embeds[0].data.thumbnail.url, `attachment://${f.view.files[0].name}`)
    assert.equal(f.preferences.get('guild', 'player').variantId, 'spooky-2026:max')
    await f.open(resolveCharacter('spooky-2026:sel'))
    assert.equal(f.control('selectcharacter').options.find(option => option.default).value, 'azulis')
    assert.equal(f.view.embeds[0].data.thumbnail.url, `attachment://${f.view.files[0].name}`)
  } finally { await f.arena.dispose() }
})

test('rapid dropdown changes retain the latest choice while a previous edit is still delivering', async () => {
  const f = fixture(accessSnapshot({ badgeIds: ['spooky-2026:sel'] }))
  try {
    await f.open()
    const delivery = f.holdNextEdit()
    const first = f.click('selectcharacter', 'hendrix')
    await delivery.waiting
    const second = f.click('selectcharacter', 'kylax')
    const latest = f.click('selectcharacter', 'selene')
    delivery.release()
    await Promise.all([first, second, latest])
    assert.equal(f.control('selectcharacter').options.find(option => option.default).value, 'selene')
    assert.equal(f.starts.length, 0)
  } finally { await f.arena.dispose() }
})

test('direct entry rechecks ownership and shared level immediately before the mock engine is initialized', async () => {
  const f = fixture(accessSnapshot({ level: 5 }))
  try {
    await assert.rejects(f.open(resolveCharacter('classic:azu'), { selection: false, startImmediately: true }), /MOCK_BATTLE_STARTED/)
    assert.equal(f.starts[0].character.id, 'classic:azu')
    assert.equal(f.starts[0].level, 5)
  } finally { await f.arena.dispose() }
  const locked = fixture(accessSnapshot())
  try {
    await locked.open(resolveCharacter('spooky-2026:max'), { selection: false, startImmediately: true })
    assert.equal(locked.starts.length, 0)
    assert.match(locked.view.content, /no longer unlocked/)
  } finally { await locked.arena.dispose() }
})

test('a queued latest selection still resolves when the preceding click acknowledgement fails', async () => {
  const f = fixture(accessSnapshot({ badgeIds: ['spooky-2026:sel'] }))
  try {
    await f.open()
    let release
    const gate = new Promise(resolve => { release = resolve })
    const first = f.click('selectcharacter', 'hendrix', { deferUpdate: async () => { await gate; throw Error('ack offline') } })
    const latest = f.click('selectcharacter', 'selene')
    release()
    await Promise.all([first, latest])
    assert.equal(f.control('selectcharacter').options.find(option => option.default).value, 'selene')
  } finally { await f.arena.dispose() }
})
