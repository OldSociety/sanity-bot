// Superseded pre-handoff rule assertions are retained in artifacts/winter-iron-progression-development-2026-10-27/before/. Native replacement coverage: winter-iron.test.js.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { Sequelize } = require('sequelize')
const { mkdtemp, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { createEconomy } = require('../services/winter/economy')
const { config } = require('../services/winter/battle')
const { DIRTY_RECIPE } = require('../services/winter/recipes')
const { screen } = require('../services/winter/presentation')
const { createHandler } = require('../services/winter/runtime')

const buttons = payload => payload.components.flatMap(row => row.toJSON().components)
async function fixture(t, { storage = ':memory:', allowRestart = true, random = () => .9 } = {}) {
  const db = new Sequelize({ dialect: 'sqlite', storage, logging: false })
  let closed = false
  const close = async () => { if (!closed) { closed = true; await db.close() } }
  t.after(close)
  let now = 0, id = 0
  const economy = createEconomy({ dropRandom: () => .99, sequelize: db, clock: () => now, allowRestart, random })
  const run = (action = 'status', quantity, extra = {}) => economy.execute({ guildId: 'g', userId: 'p', interactionId: `discovery-${++id}`, action, quantity, ...extra })
  await run()
  const state = async () => JSON.parse((await db.query('SELECT state FROM WinterBattles WHERE userId="p"'))[0][0].state)
  const replace = async patch => db.query('UPDATE WinterBattles SET state=$state', { bind: { state: JSON.stringify({ ...await state(), ...patch }) } })
  const rough = async () => {
    await db.query('UPDATE WinterPlayers SET snow=10000,snowballs=10,diamonds=10,tier=1')
    await db.query('UPDATE WinterProgress SET dummyHp=0,diamondsUnlocked=1,snowballsUnlocked=1')
    await db.query('UPDATE WinterShopProgress SET helped=1,snowmanOwned=1,snowmanHp=47')
    for (let i = 0; i < 3; i++) await run('pepper')
    await run('mix')
  }
  const sturdy = async () => { await rough(); await db.query('UPDATE WinterShopProgress SET snowmanHp=0'); return run('buy-sturdy') }
  const dirtyRecipe = async () => { for (const ingredient of DIRTY_RECIPE) await run('ingredient', ingredient); return run('mix') }
  return { db, close, economy, run, state, replace, rough, sturdy, dirtyRecipe, at: value => { now = value } }
}

test('early commands guide to the next tutorial command with an owner-bound Continue control', async t => {
  const f = await fixture(t)
  for (const action of ['shop', 'diamonds', 'kitchen', 'train', 'hidden']) {
    const result = await f.run(action)
    assert.equal(result.view, 'not-ready', action)
    assert.equal(result.continueCommand, 'throw', action)
    const payload = screen(result, result.view, { development: true })
    assert.match(payload.embeds[0].toJSON().description, /not ready.*`\/snow throw`/)
    assert.deepEqual(buttons(payload).map(b => [b.label, b.custom_id]), [['Continue', 'snow:p:throw'], ['Restart', 'snow:p:restart']])
    assert.equal(result.player.diamonds, 0)
    assert.equal(result.kitchen.spicyUnlocked, 0)
  }
  await f.db.query('UPDATE WinterPlayers SET snowballs=10')
  for (let i = 0; i < 5; i++) await f.run('attack')
  assert.equal((await f.run('kitchen')).continueCommand, 'shop')
  assert.notEqual((await f.run('shop')).view, 'not-ready')
  await f.run('shop-help')
  assert.equal((await f.run('kitchen')).continueCommand, 'diamonds')
  await f.run('beg')
  assert.equal((await f.run('kitchen')).continueCommand, 'shop')
  await f.run('buy-snowman')
  assert.equal((await f.run('kitchen')).continueCommand, 'throw')
  for (let i = 0; i < 3; i++) await f.run('attack')
  assert.equal((await f.run('kitchen')).view, 'kitchen')
  assert.equal((await f.run('hidden')).continueCommand, 'kitchen')
})

test('Requia repurposes the dummy and Beg dialogue disappears after the free diamond', async t => {
  const f = await fixture(t)
  await f.db.query('UPDATE WinterProgress SET dummyHp=0')
  const gift = await f.run('shop-help')
  assert.match(screen(gift, gift.view).embeds[0].toJSON().description, /I can’t fix the dummy[\s\S]*You’ve unlocked the \*\*Wooden Shovel\*\*/)
  const before = await f.run('diamonds')
  const exchange = screen(before, 'diamonds')
  assert.equal(exchange.embeds[0].toJSON().description, '_Need a hand making your first diamond? Ask me for a little help._\n\n1k ❄️ → 1 💎')
  assert.equal(buttons(exchange)[0].label, 'Beg')
  const earned = await f.run('beg')
  const after = screen(earned, earned.view)
  assert.match(after.embeds[0].toJSON().description, /Fine!.*paying full price.*business to run/)
  assert.equal(buttons(after)[0].label, 'Back to Shop')
  for (const view of ['welcome', 'throw', 'status', 'help', 'shop', 'shovel', 'diamonds']) {
    assert.ok(buttons(screen(earned, view)).every(b => !b.custom_id.endsWith(':help')))
    assert.doesNotMatch(JSON.stringify(screen(earned, view).embeds), /\/snow hidden/)
  }
})



test('development one-shot only defeats a Rough Snowman after recipe discovery without combat rewards', async t => {
  const f = await fixture(t)
  const early = await f.run('test-kill')
  assert.equal(early.progress.dummyHp, 5)
  await f.rough()
  const before = await f.run('throw')
  assert.ok(buttons(screen(before, 'throw', { development: true })).some(b => b.custom_id.endsWith(':test-kill')))
  assert.ok(buttons(screen(before, 'throw')).every(b => !b.custom_id.endsWith(':test-kill')))
  const killed = await f.run('test-kill')
  assert.equal(killed.view, 'melted')
  assert.equal(killed.shopProgress.snowmanHp, 0)
  assert.equal(killed.player.snowballs, before.player.snowballs)
  assert.equal(killed.battle.throws, 0)
  assert.equal(killed.battle.sweat, 0)
  const production = await fixture(t, { allowRestart: false })
  await assert.rejects(production.run('test-kill'), /only in development/)
})

test('hidden clue requires Sturdy ownership and mixing the exact recipe unlocks Dirty once', async t => {
  const f = await fixture(t)
  await f.rough()
  assert.equal((await f.run('hidden')).view, 'not-ready')
  assert.notEqual((await f.dirtyRecipe()).view, 'dirty-unlocked')
  await f.db.query('UPDATE WinterShopProgress SET snowmanHp=0')
  await f.run('buy-sturdy')
  const clue = await f.run('hidden')
  const payload = screen(clue, clue.view)
  assert.equal(payload.embeds[0].toJSON().title, 'New Recipe!')
  assert.equal(payload.embeds[0].toJSON().description, '🍆🧄🥑🧄🌶️')
  assert.equal(clue.battle.dirtyUnlocked, 0)
  assert.equal(screen(await f.run('hidden'), 'hidden').embeds[0].toJSON().description, '🍆🧄🥑🧄🌶️')
  await f.replace({ throws: 17 })
  const reward = await f.dirtyRecipe()
  assert.equal(reward.view, 'dirty-unlocked')
  assert.equal(screen(reward, reward.view).embeds[0].toJSON().title, 'Dirty Snowball Unlocked!')
  assert.equal(screen(reward, reward.view).embeds[0].toJSON().description, '_Wow that’s gross._')
  assert.equal((await f.run('hidden')).view, 'kitchen')
  assert.deepEqual([reward.battle.dirty, reward.battle.dirtyProgress], [0, 0])
  assert.deepEqual(reward.recipeDraft.ingredients, [])
  const known = await f.dirtyRecipe()
  assert.match(known.message, /already know/)
  const recipes = screen(await f.run('kitchen'), 'kitchen').embeds[0].toJSON().fields[0].value.split('\n')
  assert.equal(recipes[1], '2. 🍆🧄🥑🧄🌶️')
  assert.equal(recipes.length, 10)
  const prompt = await f.run('restart')
  const reset = await f.run('restart-confirm', prompt.progress.restartToken)
  assert.equal(reset.battle.dirtyUnlocked, 0)
  assert.equal((await f.run('hidden')).view, 'not-ready')
})



test('footer groups snow, snowballs, diamonds and Sweat with dot separators even at zero', () => {
  const receipt = { player: { userId: 'p', snow: 1000, snowballs: 2, diamonds: 0, tier: 1 },
    progress: { dummyHp: 0, snowballsUnlocked: 1, diamondsUnlocked: 1 }, kitchen: { spicyUnlocked: 1, spicy: 0 },
    battle: { dirtyUnlocked: 1, dirty: 0, sturdyOwned: 1, sweat: 3 } }
  assert.equal(screen(receipt, 'status').embeds[0].toJSON().footer.text, 'Available: 1k❄️ · 2⚪️ · 0🔴 · 0🟤 · 0💎')
  receipt.battle.idleStarted = 1
  assert.equal(screen(receipt, 'status').embeds[0].toJSON().footer.text, 'Available: 1k❄️ · 0🔴 · 0🟤 · 0💎 · 3💦')
})

























test('Kitchen, Shop and Gym attach the requested existing badges as valid PNG thumbnails', async t => {
  const f = await fixture(t)
  await f.sturdy()
  const receipt = await f.run()
  const fs = require('node:fs')
  for (const [view, relative, name] of [
    ['kitchen', 'Winter/WINTER_KYLAX_BADGE.png', 'winter-kitchen-badge'],
    ['shop', 'Classic/REQUIA_BADGE.png', 'winter-shop-badge'],
    ['train', 'Classic/HENDRIX_BADGE.png', 'winter-gym-badge'],
  ]) {
    const payload = screen(receipt, view)
    const expectedPath = path.resolve(__dirname, '../assets/badges', relative)
    assert.equal(payload.embeds[0].toJSON().thumbnail.url, `attachment://${name}.png`)
    assert.equal(payload.files.length, 1)
    assert.equal(payload.files[0].attachment, expectedPath)
    assert.equal(payload.files[0].name, `${name}.png`)
    const bytes = fs.readFileSync(expectedPath)
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    assert.ok(bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0)
  }
})





test('NPC speech uses paragraph italics while commands, bold emphasis, stats and system feedback retain their formatting', async t => {
  const { dialogue } = require('../services/character-dialogue')
  assert.equal(dialogue('Hello.\n\nUse `/snow shop` for **Snowballs**.'), '_Hello._\n\n_Use `/snow shop` for **Snowballs**._')
  const f = await fixture(t)
  await f.sturdy()
  const receipt = await f.run()
  for (const view of ['broken', 'broken-again', 'melted', 'dirty-unlocked', 'sturdy-purchased', 'shop', 'kitchen', 'shovel-gift']) {
    const desc = screen(receipt, view).embeds[0].toJSON().description
    assert.ok(desc.startsWith('_') && desc.endsWith('_'), view)
  }
  const failure = screen({ ...receipt, message: 'You need 1💎 for this item.' }, 'shop').embeds[0].toJSON().description
  assert.ok(failure.startsWith('You need 1💎 for this item.\n\n_'))
  assert.ok(!screen(receipt, 'help').embeds[0].toJSON().description.startsWith('_'))
  const exchange = screen({ ...receipt, message: 'Created 1 diamonds.' }, 'diamonds').embeds[0].toJSON().description
  assert.equal(exchange, 'Created 1 diamonds.\n\n1k ❄️ → 1 💎')
})
