const test = require('node:test'), assert = require('node:assert/strict')
const { createMenuLifecycle } = require('../services/arena/menu-lifecycle')
const { createCampaign } = require('../services/arena/campaign')
const { createShop } = require('../services/arena/shop')
const { createArena } = require('../services/arena/controller')

function fixture() {
  let clock = 0, sequence = 0
  const warnings = [], timers = [], lifecycle = createMenuLifecycle({ logger: { warn: message => warnings.push(message) } })
  const options = { lifecycle, authorize: async () => true, environment: () => 'development', now: () => clock,
    setTimer: callback => { timers.push(callback); return timers.length }, clearTimer: () => {}, logger: { warn: message => warnings.push(message) } }
  const campaign = createCampaign(options), shop = createShop(options)
  const forbidden = () => { throw Error('Combat must not run in a menu lifecycle test') }
  const arena = createArena({ lifecycle, responsive: false, authorize: async () => true,
    engine: { newBattle: forbidden, takeTurn: forbidden, beginFinisher: forbidden },
    setExpiryTimer: () => 0, clearExpiryTimer: () => {}, logger: { warn: message => warnings.push(message) } })
  function interaction(owner = 'owner', guild = 'guild', channel = 'channel') {
    const messageId = `message-${++sequence}`, edits = []
    let current, fail = false
    const apply = async payload => {
      if (fail) { fail = false; throw Object.assign(Error('unknown webhook'), { code: 10015 }) }
      current = { ...current, ...payload,
        embeds: payload.embeds ? payload.embeds.map(embed => embed.toJSON?.() || embed) : current?.embeds,
        components: payload.components ? payload.components.map(row => row.toJSON?.() || row) : current?.components }
      edits.push(payload)
      return { id: messageId }
    }
    const source = { id: `interaction-${sequence}`, user: { id: owner }, guildId: guild, channelId: channel,
      deferReply: async () => {}, editReply: apply, reply: apply, update: apply, deferUpdate: async () => {} }
    const control = action => current.components.flatMap(row => row.components).find(item => item.custom_id?.endsWith(`:${action}`))
    return { source, messageId, edits, control, get view() { return current }, fail: () => { fail = true },
      click: (controller, action, overrides = {}) => controller.handleButton({ ...source, message: { id: messageId },
        customId: control(action)?.custom_id, ...overrides }) }
  }
  return { lifecycle, campaign, shop, arena, interaction, timers, warnings, clock: value => { clock = value },
    dispose: async () => { await lifecycle.dispose(); await arena.dispose(); await campaign.dispose(); await shop.dispose() } }
}

test('campaign -> shop -> fight -> campaign retires the previous screen without changing its embed', async () => {
  const f = fixture()
  try {
    const campaign = f.interaction(), shop = f.interaction(), fight = f.interaction(), again = f.interaction()
    await f.campaign.execute(campaign.source)
    const oldEmbed = structuredClone(campaign.view.embeds)
    await f.shop.execute(shop.source)
    assert.deepEqual(campaign.view.components, [])
    assert.deepEqual(campaign.view.embeds, oldEmbed)
    await f.arena.execute(fight.source, undefined, { selection: true })
    assert.deepEqual(shop.view.components, [])
    assert(fight.view.components.length)
    await f.campaign.execute(again.source)
    assert.deepEqual(fight.view.components, [])
    assert(again.view.components.length)
    assert.deepEqual(f.warnings, [])
  } finally { await f.dispose() }
})

test('same-mode replacement and cross-channel replacement share the player scope; other players/servers stay active', async () => {
  const f = fixture()
  try {
    const first = f.interaction(), second = f.interaction(), other = f.interaction('other'), otherGuild = f.interaction('owner', 'elsewhere')
    await f.campaign.execute(first.source)
    await f.campaign.execute(second.source)
    assert.deepEqual(first.view.components, [])
    await f.shop.execute(other.source)
    await f.shop.execute(otherGuild.source)
    assert(second.view.components.length)
    const crossChannel = f.interaction('owner', 'guild', 'other-channel')
    await f.shop.execute(crossChannel.source)
    assert.deepEqual(second.view.components, [])
    assert(other.view.components.length)
    assert(otherGuild.view.components.length)
  } finally { await f.dispose() }
})

test('idle timer resets after clicks, old timer cannot close a refreshed menu, and cleanup uses the latest click token', async () => {
  const f = fixture()
  try {
    const shop = f.interaction(), click = f.interaction()
    await f.shop.execute(shop.source)
    const oldTimer = f.timers.at(-1)
    f.clock(240000)
    await shop.click(f.shop, 'pack-bronze', { editReply: click.source.editReply })
    const newTimer = f.timers.at(-1)
    await oldTimer()
    assert(click.view.components.length)
    await newTimer()
    assert.deepEqual(click.view.components, [])
    assert(shop.view.components.length) // Original token was not used to publish the click or cleanup.
  } finally { await f.dispose() }
})

test('replacement waits for an in-flight old click and removes controls after its last render', async () => {
  const f = fixture()
  try {
    const campaign = f.interaction(), shop = f.interaction()
    await f.campaign.execute(campaign.source)
    let release
    const gate = new Promise(resolve => { release = resolve })
    const click = campaign.click(f.campaign, 'select', { values: ['tower-01'], deferUpdate: () => gate })
    const opening = f.shop.execute(shop.source)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(shop.view, undefined)
    release()
    await Promise.all([click, opening])
    assert.deepEqual(campaign.view.components, [])
    assert(shop.view.components.length)
  } finally { await f.dispose() }
})

test('rapid cross-mode command openings serialize and only the last screen remains interactive', async () => {
  const f = fixture()
  try {
    const first = f.interaction(), second = f.interaction(), third = f.interaction()
    await Promise.all([f.campaign.execute(first.source), f.shop.execute(second.source), f.campaign.execute(third.source)])
    assert.deepEqual(first.view.components, [])
    assert.deepEqual(second.view.components, [])
    assert(third.view.components.length)
  } finally { await f.dispose() }
})

test('missed cleanup or lost sessions recover on click without another expired-menu reply', async () => {
  const f = fixture()
  try {
    const old = f.interaction(), next = f.interaction()
    await f.shop.execute(old.source)
    const customId = old.control('pack-bronze').custom_id
    old.fail()
    await f.campaign.execute(next.source)
    assert(old.view.components.length)
    let replies = 0
    await old.click(f.shop, 'pack-bronze', { customId, reply: async () => { replies++ } })
    assert.deepEqual(old.view.components, [])
    assert.equal(replies, 0)
    assert(next.view.components.length)
    assert.deepEqual(f.warnings, [])
  } finally { await f.dispose() }
})

test('shutdown disposal removes preview controls and invalidates both kinds of menu sessions', async () => {
  const f = fixture(), campaign = f.interaction(), shop = f.interaction('other')
  await f.campaign.execute(campaign.source)
  await f.shop.execute(shop.source)
  await f.dispose()
  assert.deepEqual(campaign.view.components, [])
  assert.deepEqual(shop.view.components, [])
})

test('old fight buttons recover quietly after moving to the shop', async () => {
  const f = fixture()
  try {
    const fight = f.interaction(), shop = f.interaction()
    await f.arena.execute(fight.source)
    const customId = fight.control('start').custom_id
    await f.shop.execute(shop.source)
    let replies = 0
    await fight.click(f.arena, 'start', { customId, reply: async () => { replies++ } })
    assert.deepEqual(fight.view.components, [])
    assert.equal(replies, 0)
    assert(shop.view.components.length)
  } finally { await f.dispose() }
})

test('denied requests cannot retire the current menu and shutdown refuses new openings', async () => {
  const f = fixture()
  try {
    const current = f.interaction(), denied = f.interaction(), after = f.interaction()
    await f.campaign.execute(current.source)
    const blockedShop = createShop({ lifecycle: f.lifecycle, environment: () => 'development', authorize: async () => false })
    await blockedShop.execute(denied.source)
    assert(current.view.components.length)
    await f.lifecycle.dispose()
    await f.shop.execute(after.source)
    assert.match(after.view.content, /restarting/)
    assert.deepEqual(after.view.components, [])
    await blockedShop.dispose()
  } finally { await f.dispose() }
})
