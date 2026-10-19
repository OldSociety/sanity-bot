const test = require('node:test'),
  assert = require('node:assert/strict')
// A synthetic second available variant exercises the future multi-skin path;
// this process-local catalog override never unlocks a live skin.
const catalog = require('../services/arena/characters')
const originalSelectable = catalog.isSelectable
let secondAvailable = false
catalog.isSelectable = (variant) =>
  originalSelectable(variant) ||
  Boolean(secondAvailable && variant?.id === 'spooky-2026:hfm')
const { createArena } = require('../services/arena/controller')
const { createMemoryPreferences } = require('../services/arena/selection')
function fixture() {
  let view
  const preferences = createMemoryPreferences()
  const arena = createArena({
    chooseOpponent: () => 'maxim',
    rollRecovery: () => 99.999,
    preferences,
    setExpiryTimer: () => null,
    clearExpiryTimer() {},
  })
  const interaction = {
    id: 'skinflow',
    guildId: 'g',
    channelId: 'c',
    user: { id: 'u' },
    reply: async (payload) => {
      view = payload
      return { id: 'm' }
    },
    editReply: async (payload) => {
      view = payload
    },
  }
  const controls = () => view.components.flatMap((row) => row.components)
  const click = (action, value) =>
    arena.handleButton({
      ...interaction,
      message: { id: 'm' },
      customId: `arena:skinflow:${
        controls()[0].data.custom_id.split(':')[2]
      }:${action}`,
      values: value ? [value] : undefined,
      isStringSelectMenu: () => Boolean(value),
      deferUpdate: async () => {},
    })
  return {
    arena,
    preferences,
    controls,
    click,
    view: () => view,
    open: () => arena.execute(interaction, undefined, { selection: true }),
  }
}
test('a lone available skin still shows its stats before confirmation', async () => {
  secondAvailable = false
  const f = fixture()
  try {
    await f.open()
    assert.ok(f.controls().some((item) => item.data.label === 'Choose Skin →'))
    await f.click('chooseskin')
    assert.equal(f.view().embeds[0].data.title, 'Marq — Choose Skin')
    await f.click('confirmfighter')
    assert.equal(f.view().embeds[0].data.title, '⚔️ Arena')
    assert.deepEqual(f.preferences.get('g', 'u'), {
      familyId: 'marq',
      variantId: 'spooky-2026:mrq',
    })
    const before = JSON.stringify(f.view().embeds)
    await f.click('selectskin', 'spooky-2026:hfm')
    assert.equal(JSON.stringify(f.view().embeds), before)
    await f.click('backskins')
    assert.equal(f.view().embeds[0].data.title, 'Marq — Choose Skin')
    await f.click('backcharacters')
    assert.equal(f.view().embeds[0].data.title, 'Choose Your Fighter')
  } finally {
    await f.arena.dispose()
  }
})
test('all families retain skin selection and confirmation; base portrait ignores chosen skin', async () => {
  secondAvailable = true
  const f = fixture()
  try {
    await f.open()
    assert.ok(f.controls().some((item) => item.data.label === 'Choose Skin →'))
    await f.click('chooseskin')
    assert.equal(f.view().embeds[0].data.title, 'Marq — Choose Skin')
    assert.equal(f.preferences.get('g', 'u'), undefined)
    const options = f
      .controls()
      .find((item) => item.data.custom_id.endsWith(':selectskin'))
      .toJSON().options
    assert.deepEqual(options.map((item) => item.value).sort(), [
      'spooky-2026:hfm',
      'spooky-2026:mrq',
    ])
    await f.click('selectskin', 'spooky-2026:hfm')
    await f.click('confirmfighter')
    assert.equal(f.preferences.get('g', 'u').variantId, 'spooky-2026:hfm')
    await f.click('backskins')
    assert.equal(f.view().embeds[0].data.title, 'Marq — Choose Skin')
    await f.click('backcharacters')
    assert.match(
      f.view().embeds[0].data.thumbnail.url,
      /arena-character-spooky-marq/
    )
    assert.doesNotMatch(
      JSON.stringify(f.view().embeds),
      /Hell-fed|HP|Attack|Infernal/
    )
    await f.click('selectcharacter', 'maxim')
    await f.click('chooseskin')
    assert.equal(f.view().embeds[0].data.title, 'Maxim — Choose Skin')
    await f.click('confirmfighter')
    assert.equal(f.view().embeds[0].data.title, '⚔️ Arena')
    assert.equal(f.preferences.get('g', 'u').variantId, 'spooky-2026:max')
  } finally {
    secondAvailable = false
    await f.arena.dispose()
  }
})
