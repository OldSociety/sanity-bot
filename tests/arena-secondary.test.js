// Fixed fixtures and an injected engine only: no combat exchanges or live data.
process.env.NODE_ENV = 'development'
const test = require('node:test')
const assert = require('node:assert/strict')
const { characters, resolveCharacter, isSelectable } = require('../services/arena/characters')
const secondary = require('../services/arena/secondary')
const { screen } = require('../services/arena/interface')
const { renderHealthCard, cardName } = require('../services/arena/health-card')
const { createArena } = require('../services/arena/controller')
const sharp = require('sharp')
const controls = view => view.components.flatMap(row => row.components)
function fixture() {
  const character = resolveCharacter('classic:kyl')
  const opponent = resolveCharacter('classic:azu')
  const actor = art => ({ kit: art.kit, name: art.name, label: art.label,
    hp: 200, maxHp: 220, attack: 200, level: 1, stress: 6, maxStress: 6,
    hope: 0, fear: 0, abilityRanks: { special1: 1, special2: 1, special3: 1 } })
  const state = { id: 'secondary-test', revision: 0, level: 1, character, opponent: opponent.id,
    page: 'prefight', presentationV2: true, diagnostic: false,
    battle: { status: 'playing', mode: 'active', tick: 0, player: actor(character),
      enemy: actor(opponent), history: [], actions: [], recentRolls: [] } }
  state.battle.statistics = require('../services/arena/statistics').createStatistics(state.battle.player, state.battle.enemy)
  return state
}
test('development prototype has three fighters and disallows equipping the primary', () => {
  assert.deepEqual(characters.filter(isSelectable).map(c => c.id).sort(), [...secondary.testRosterIds].sort())
  const state = fixture()
  assert.deepEqual(secondary.choices(state).map(c => c.id).sort(), ['classic:azu', 'classic:hen'])
  state.secondaryId = state.character.id
  assert.equal(secondary.equipped(state), undefined)
  state.allowedVariantIds = ['classic:kyl', 'classic:hen']
  assert.deepEqual(secondary.choices(state).map(c => c.id), ['classic:hen'])
})
test('fight control shows secondary details and uses valid Discord row sizes', () => {
  const state = fixture()
  assert.equal(controls(screen(state)).find(c => c.data.label === '2nd').data.disabled, true)
  state.secondaryId = 'classic:hen'
  state.secondaryDetails = true
  const view = screen(state)
  assert.equal(controls(view).find(c => c.data.label === '2nd').data.disabled, false)
  assert.ok(view.embeds[0].data.fields.some(f => f.name === 'Secondary' && f.value.includes('Hendrix')))
  assert.ok(view.components.every(row => row.components.length <= 5))
})
test('round secondary art changes the card and its content key in both rendering paths', async () => {
  const state = fixture()
  const plain = await renderHealthCard(state)
  state.secondaryId = 'classic:hen'
  const badge = await renderHealthCard(state)
  assert.notEqual(plain.name, badge.name)
  assert.notDeepEqual(plain.attachment, badge.attachment)
  const legacy = await renderHealthCard(state, { optimized: false })
  assert.deepEqual(await sharp(badge.attachment).raw().toBuffer(), await sharp(legacy.attachment).raw().toBuffer())
  state.secondaryId = 'classic:azu'
  assert.notEqual(cardName(state), badge.name)
})
test('equip, unequip, stale controls, rematch and 2nd never call the combat engine', async () => {
  let view, starts = 0
  const arena = createArena({
    responsive: false, arenaVersion: () => null,
    chooseOpponent: choices => choices[0],
    setExpiryTimer: () => null, clearExpiryTimer: () => {},
    engine: { newBattle: () => { starts++; return fixture().battle },
      takeTurn: () => { throw Error('Must not advance combat') } },
    renderCard: async state => ({ name: cardName(state), attachment: Buffer.from('mock') }),
    renderLegend: async () => ({ name: 'legend.png', attachment: Buffer.from('mock') }),
    logger: { info() {}, warn() {}, error: console.error },
  })
  const interaction = { id: 'test', user: { id: 'owner' }, guildId: 'g', channelId: 'c',
    reply: async payload => { view = payload; return { id: 'm' } },
    editReply: async payload => { view = payload }, followUp: async () => {} }
  const click = async (action, value, revision) => {
    const control = controls(view).find(c => c.data.custom_id.endsWith(':' + action))
    await arena.handleButton({ ...interaction, message: { id: 'm' },
      customId: revision == null ? control.data.custom_id : `arena:test:${revision}:${action}`,
      values: value === undefined ? undefined : [value],
      isStringSelectMenu: () => value !== undefined, deferUpdate: async () => {} })
  }
  try {
    await arena.execute(interaction, resolveCharacter('classic:kyl'), { startImmediately: true })
    assert.equal(starts, 0)
    await click('equipsecondary', 'classic:kyl')
    assert.equal(view.embeds[0].data.fields.some(f => f.name === 'Secondary'), false)
    await click('equipsecondary', 'classic:hen')
    assert.ok(view.embeds[0].data.fields.some(f => f.name === 'Secondary' && f.value.includes('Hendrix')))
    await click('equipsecondary', 'none', 0)
    await click('equipsecondary', 'none')
    assert.equal(view.embeds[0].data.fields.some(f => f.name === 'Secondary'), false)
    await click('equipsecondary', 'classic:azu')
    await click('start')
    assert.equal(starts, 1)
    await click('secondary')
    assert.ok(view.embeds[0].data.fields.some(f => f.name === 'Secondary' && f.value.includes('Azulis')))
    assert.ok(view.embeds[0].data.title.endsWith('· 0'))
    await click('quit')
    await click('start')
    await click('secondary')
    assert.ok(view.embeds[0].data.fields.some(f => f.name === 'Secondary' && f.value.includes('Azulis')))
  } finally { await arena.dispose() }
})
