const test = require('node:test'), assert = require('node:assert/strict')
const { createShop, validateCatalog } = require('../services/arena/shop')
const config = require('../config/arena/shop/packs.json')
function fixture(overrides = {}) {
  let current, expire, time = 0, authorized = true, fail = false
  const replies = []
  const shop = createShop({ environment: () => 'development', authorize: async () => authorized,
    now: () => time, timeoutMs: 1000, setTimer: callback => { expire = callback; return 1 }, clearTimer: () => {}, ...overrides })
  const editReply = async payload => {
    if (fail) { fail = false; throw Error('delivery failed') }
    current = { ...payload, embeds: payload.embeds.map(item => item.toJSON()), components: payload.components.map(item => item.toJSON()) }
    return { id: 'message' }
  }
  const interaction = { user: { id: 'owner' }, guildId: 'guild', channelId: 'channel',
    deferReply: async payload => assert.equal(payload.ephemeral, true), editReply, reply: async payload => replies.push(payload) }
  const control = action => current.components.flatMap(row => row.components).find(item => item.custom_id.endsWith(`:${action}`))
  async function click(action, extra = {}) {
    await shop.handleButton({ ...interaction, message: { id: 'message' }, customId: extra.customId || control(action)?.custom_id,
      deferUpdate: async () => {}, update: editReply, ...extra })
  }
  return { shop, interaction, click, control, replies, get current() { return current }, expire: () => expire(),
    advance: () => { time = 1001 }, deny: () => { authorized = false }, fail: () => { fail = true } }
}
test('Bronze, Silver and Gold are unassigned, with no prices, pools or random-draw rules', () => {
  const catalog = validateCatalog(config)
  assert.deepEqual(catalog.packs.map(pack => pack.tier), ['bronze', 'silver', 'gold'])
  assert.equal(catalog.currency, null)
  for (const pack of catalog.packs) {
    assert.deepEqual(pack.characterPool, [])
    assert.equal(pack.price, null)
    assert.equal(pack.cardsPerPack, null)
    assert.equal(pack.odds, null)
  }
  const invalid = structuredClone(catalog)
  invalid.packs[0].characterPool.push('classic:kyl')
  assert.throws(() => validateCatalog(invalid), /unassigned/)
  assert.throws(() => validateCatalog({ ...catalog, packs: [...catalog.packs, catalog.packs[0]] }), /Invalid/)
})
test('browse all pack detail screens, return to the shop, and close', async () => {
  const f = fixture()
  try {
    await f.shop.execute(f.interaction)
    assert.match(f.current.embeds[0].title, /Arena Store/)
    assert.equal(f.current.embeds[0].fields.length, 4)
    for (const tier of ['bronze', 'silver', 'gold']) {
      await f.click(`pack-${tier}`)
      assert.equal(f.current.embeds[0].title, `${tier[0].toUpperCase() + tier.slice(1)} Pack`)
      assert.equal(f.control('purchase').disabled, true)
      assert.equal(f.control(`pack-${tier}`).disabled, true)
      assert.match(f.current.embeds[0].fields.find(field => field.name === 'Pack contents').value, /No specific characters/)
      await f.click('purchase')
      assert.match(f.replies.at(-1).content, /purchases are coming soon/)
    }
    await f.click('back')
    assert.match(f.current.embeds[0].title, /Arena Store/)
    const close = f.control('close').custom_id
    await f.click('close')
    assert.deepEqual(f.current.components, [])
    await f.click('close', { customId: close })
    assert.match(f.replies.at(-1).content, /ended/)
  } finally { f.shop.dispose() }
})
test('guards owner, message, guild and fresh Arena access on each click', async () => {
  const f = fixture()
  try {
    await f.shop.execute(f.interaction)
    for (const extra of [{ user: { id: 'other' } }, { message: { id: 'copy' } }, { guildId: 'other' }, { channelId: 'other' }]) {
      await f.click('pack-bronze', extra)
      assert.match(f.replies.at(-1).content, /another session/)
    }
    f.deny()
    await f.click('pack-bronze')
    assert.match(f.current.embeds[0].title, /Arena Store/)
  } finally { f.shop.dispose() }
})
test('failed edits can retry, stale or forged actions cannot open or purchase a pack', async () => {
  const f = fixture()
  try {
    await f.shop.execute(f.interaction)
    const old = f.control('pack-bronze').custom_id
    f.fail()
    await assert.rejects(f.click('pack-bronze'), /delivery failed/)
    await f.click('pack-bronze', { customId: old })
    await f.click('pack-bronze', { customId: old })
    assert.match(f.replies.at(-1).content, /changed/)
    const purchase = f.control('purchase').custom_id
    await f.click('purchase', { customId: purchase.replace(':purchase', ':pack-unknown') })
    assert.match(f.replies.at(-1).content, /not available/)
    await f.click('purchase')
    assert.equal(f.current.embeds[0].title, 'Bronze Pack')
  } finally { f.shop.dispose() }
})
test('expiry, clock expiry, restart and production entry all leave purchases unavailable', async () => {
  const f = fixture()
  await f.shop.execute(f.interaction)
  const old = f.control('pack-bronze').custom_id
  f.expire()
  assert.deepEqual(f.current.components, [])
  await f.click('pack-bronze', { customId: old })
  assert.match(f.replies.at(-1).content, /ended/)
  await f.shop.execute(f.interaction)
  f.advance()
  await f.click('pack-bronze')
  assert.deepEqual(f.current.components, [])
  f.shop.dispose()
  const prod = fixture({ environment: () => 'production' })
  await prod.shop.execute(prod.interaction)
  assert.match(prod.replies.at(-1).content, /development bot only/)
})
test('concurrent pack clicks resolve only one navigation revision', async () => {
  const f = fixture()
  try {
    await f.shop.execute(f.interaction)
    let release
    const gate = new Promise(resolve => { release = resolve })
    const first = f.click('pack-bronze', { deferUpdate: () => gate })
    await f.click('pack-gold')
    assert.match(f.replies.at(-1).content, /changed/)
    release()
    await first
    assert.equal(f.current.embeds[0].title, 'Bronze Pack')
  } finally { f.shop.dispose() }
})
