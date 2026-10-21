const test = require('node:test'), assert = require('node:assert/strict')
process.env.NODE_ENV = 'development'
const { accessSnapshot } = require('../services/arena/player-access')
const { resolveFightOptions, createFightOptions } = require('../services/arena/fight-options')
function request(name, value = '', character = null, user = 'owner') {
  let result
  const interaction = { user: { id: user }, guildId: 'guild',
    options: { getSubcommand: () => 'fight', getFocused: () => ({ name, value }), getString: key => key === 'character' ? character : null },
    respond: async choices => { result = choices },
  }
  return { interaction, get result() { return result } }
}
test('character autocomplete lists only unlocked families and filters typed names', async () => {
  const options = createFightOptions({ getAccess: async () => accessSnapshot({ badgeIds: ['spooky-2026:sel'] }) })
  const all = request('character')
  await options.autocomplete(all.interaction)
  assert.deepEqual(all.result.map(item => item.name), ['Azulis', 'Hendrix', 'Kylax', 'Selene'])
  const filtered = request('character', 'seL')
  await options.autocomplete(filtered.interaction)
  assert.deepEqual(filtered.result, [{ name: 'Selene', value: 'selene' }])
  const locked = request('character', 'Maxim')
  await options.autocomplete(locked.interaction)
  assert.deepEqual(locked.result, [])
})
test('skin autocomplete is scoped to the chosen owned family and exact unlocked variants', async () => {
  const options = createFightOptions({ getAccess: async () => accessSnapshot({ badgeIds: ['spooky-2026:hfm'] }) })
  const marq = request('skin', '', 'Marq')
  await options.autocomplete(marq.interaction)
  assert.deepEqual(marq.result, [{ name: 'Hell-fed Marq', value: 'spooky-2026:hfm' }])
  const noCharacter = request('skin')
  await options.autocomplete(noCharacter.interaction)
  assert.deepEqual(noCharacter.result, [])
  const unknown = request('skin', '', 'Selene')
  await options.autocomplete(unknown.interaction)
  assert.deepEqual(unknown.result, [])
})
test('autocomplete access is specific to the invoking player', async () => {
  const options = createFightOptions({ getAccess: async interaction => accessSnapshot({ badgeIds: interaction.user.id === 'owner' ? ['spooky-2026:sel'] : [] }) })
  const owner = request('character', 'Selene'), other = request('character', 'Selene', null, 'other')
  await options.autocomplete(owner.interaction)
  await options.autocomplete(other.interaction)
  assert.equal(owner.result.length, 1)
  assert.deepEqual(other.result, [])
})
test('a unique owned skin resolves directly, while an ambiguous character opens only its skin picker', () => {
  const baseline = resolveFightOptions(accessSnapshot(), 'Azulis')
  assert.equal(baseline.character.id, 'classic:azu')
  assert.equal(baseline.startImmediately, true)
  assert.equal(baseline.selection, false)
  const both = accessSnapshot({ badgeIds: ['spooky-2026:mrq', 'spooky-2026:hfm'] })
  const ambiguous = resolveFightOptions(both, 'Marq')
  assert.equal(ambiguous.selection, true)
  assert.equal(ambiguous.initialPage, 'skins')
  assert.equal(ambiguous.startImmediately, undefined)
  assert.equal(resolveFightOptions(both, 'marq', 'Hell-fed').character.id, 'spooky-2026:hfm')
  assert.equal(resolveFightOptions(both, 'marq', 'spooky-2026:mrq').character.id, 'spooky-2026:mrq')
})
test('typed locked, mismatched and incomplete values cannot bypass autocomplete ownership', () => {
  const baseline = accessSnapshot()
  for (const args of [['Maxim', 'Spooky'], ['Azulis', 'spooky-2026:sel'], [null, 'Classic'], ['Azulis', 'bogus']])
    assert.throws(() => resolveFightOptions(baseline, ...args), error => error.code === 'ARENA_FIGHT_OPTION')
  assert.deepEqual(resolveFightOptions(baseline, null, null), { selection: true })
  assert.equal(resolveFightOptions(baseline, 'aZULis', 'CLASSIC').character.id, 'classic:azu')
  assert.throws(() => resolveFightOptions({}, 'Azulis', 'Classic'), /access is unavailable/)
})
test('diagnostic full-roster testing remains temporary and production autocomplete stays empty', async () => {
  const options = createFightOptions({ getAccess: async () => accessSnapshot({ diagnostic: true }) })
  const marq = request('skin', '', 'marq')
  await options.autocomplete(marq.interaction)
  assert.equal(marq.result.length, 2)
  assert.throws(() => resolveFightOptions(accessSnapshot(), 'marq', 'Spooky'), /unavailable/)
  const before = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'
    const production = request('character')
    await options.autocomplete(production.interaction)
    assert.deepEqual(production.result, [])
  } finally { process.env.NODE_ENV = before }
})
