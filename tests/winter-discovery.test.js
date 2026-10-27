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
  const economy = createEconomy({ sequelize: db, clock: () => now, allowRestart, random })
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
  for (const action of ['shop', 'diamonds', 'shovel', 'kitchen', 'train', 'hidden']) {
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

test('Spicy purchase moves straight to Throw and returning shop supports atomic x1 and Max purchases', async t => {
  const f = await fixture(t)
  await f.rough()
  const firstShop = screen(await f.run('shop'), 'shop')
  assert.equal(buttons(firstShop).find(b => b.custom_id.endsWith('buy-spicy:1')).label, 'Spicy 🔴 · 1💎')
  assert.ok(buttons(firstShop).every(b => !b.custom_id.endsWith('buy-spicy:max')))
  const bought = await f.run('buy-spicy', '1')
  const purchaseScreen = screen(bought, bought.view, { development: true })
  assert.deepEqual(buttons(purchaseScreen).map(b => b.label), ['Throw', 'Restart'])
  const returning = buttons(screen(await f.run('shop'), 'shop'))
  assert.equal(returning.find(b => b.custom_id.endsWith('buy-spicy:1')).label, 'Spicy 🔴 ×1 · 1💎')
  assert.equal(returning.find(b => b.custom_id.endsWith('buy-spicy:max')).label, 'Max 🔴 · 9💎')
  const max = await f.run('buy-spicy', 'max', { interactionId: 'same-max' })
  assert.equal(max.kitchen.spicy, 10)
  assert.equal(max.player.diamonds, 0)
  assert.deepEqual(await f.run('buy-spicy', 'max', { interactionId: 'same-max' }), max)
  assert.equal((await f.run('buy-spicy', 'max')).kitchen.spicy, 10)
  await assert.rejects(f.run('buy-spicy', '100'), /quantity/)
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

test('each five funded post-unlock throws generates one Dirty snowball including misses and specialty throws', async t => {
  const f = await fixture(t)
  const bought = await f.sturdy()
  await f.dirtyRecipe()
  const started = await f.run('battle-start', bought.battle.fightId)
  f.at(8000)
  const fourth = await f.run('battle-tick')
  assert.deepEqual([fourth.battle.throws, fourth.battle.dirty, fourth.battle.dirtyProgress], [4, 0, 4])
  f.at(10000)
  const fifth = await f.run('battle-tick', undefined, { interactionId: 'dirty-fifth' })
  assert.deepEqual([fifth.battle.throws, fifth.battle.dirty, fifth.battle.dirtyProgress], [5, 1, 0])
  assert.deepEqual(await f.run('battle-tick', undefined, { interactionId: 'dirty-fifth' }), fifth)
  const dirtyButton = buttons(screen(fifth, 'fight', { now: 10000 })).find(b => b.label === '🟤')
  assert.equal(dirtyButton.disabled, false)
  assert.equal(dirtyButton.custom_id, `snow:p:battle-dirty:${started.battle.fightId}`)
  const thrown = await f.run('battle-dirty', started.battle.fightId, { interactionId: 'same-dirty' })
  assert.deepEqual([thrown.battle.dirty, thrown.battle.dirtyProgress, thrown.battle.throws, thrown.battle.sweat], [0, 1, 6, 0])
  assert.equal(thrown.battle.enemyHp, 100)
  assert.equal(thrown.battle.stunRemaining, 0)
  assert.equal(thrown.battle.hits, 0)
  assert.deepEqual(await f.run('battle-dirty', started.battle.fightId, { interactionId: 'same-dirty' }), thrown)
  const locked = await f.run('battle-special', started.battle.fightId)
  assert.match(locked.message, /not ready/)
  assert.ok(buttons(screen(thrown, 'fight', { now: 10000 })).filter(b => ['🔴', '🟤'].includes(b.label)).every(b => b.disabled))
  await f.db.query('UPDATE WinterKitchen SET spicy=3')
  f.at(13000)
  const spicy = await f.run('battle-special', started.battle.fightId)
  assert.equal(spicy.battle.dirtyProgress, 3)
  f.at(16000)
  const another = await f.run('battle-tick')
  assert.equal(another.battle.dirty, 1)
  assert.equal(another.battle.dirtyProgress, 0)
  await f.db.query('UPDATE WinterPlayers SET snow=0,tier=0')
  f.at(18000)
  const starved = await f.run('battle-tick')
  assert.equal(starved.battle.dirtyProgress, 0)
  assert.equal(starved.battle.throws, another.battle.throws)
  assert.equal(config.playerAccuracy, .5)
})

test('footer groups snow, snowballs, diamonds and Sweat with dot separators even at zero', () => {
  const receipt = { player: { userId: 'p', snow: 1000, snowballs: 2, diamonds: 0, tier: 1 },
    progress: { dummyHp: 0, snowballsUnlocked: 1, diamondsUnlocked: 1 }, kitchen: { spicyUnlocked: 1, spicy: 0 },
    battle: { dirtyUnlocked: 1, dirty: 0, sturdyOwned: 1, sweat: 3 } }
  assert.equal(screen(receipt, 'status').embeds[0].toJSON().footer.text, 'Available: 1k❄️ · 2⚪️ · 0🔴 · 0🟤 · 0💎')
  receipt.battle.idleStarted = 1
  assert.equal(screen(receipt, 'status').embeds[0].toJSON().footer.text, 'Available: 1k❄️ · 0🔴 · 0🟤 · 0💎 · 3💦')
})

test('Dirty hits stun without damage and both specialties share one cooldown and receipt protection', async t => {
  const f = await fixture(t, { random: () => 0 })
  const bought = await f.sturdy()
  await f.dirtyRecipe()
  const started = await f.run('battle-start', bought.battle.fightId)
  await f.replace({ dirty: 2 })
  await f.db.query('UPDATE WinterKitchen SET spicy=3')
  const results = await Promise.all([
    f.run('battle-dirty', started.battle.fightId, { interactionId: 'hit-dirty' }),
    f.run('battle-special', started.battle.fightId),
  ])
  assert.equal(config.dirtyStunSecondChance, .8)
  assert.equal(results[0].battle.enemyHp, 100)
  assert.equal(results[0].battle.stunRemaining, 3)
  assert.equal(results[0].battle.dirty, 1)
  assert.equal(results[0].battle.specialReadyAt, 3000)
  assert.match(results[1].message, /not ready/)
  assert.equal(results[1].kitchen.spicy, 3)
  assert.deepEqual(await f.run('battle-dirty', started.battle.fightId, { interactionId: 'hit-dirty' }), results[0])
  const stale = await f.run('battle-dirty', require('node:crypto').randomUUID())
  assert.match(stale.message, /out of date/)
  assert.equal(stale.battle.dirty, 1)
  f.at(3000)
  const next = await f.run('battle-dirty', started.battle.fightId)
  assert.equal(next.battle.enemyHp, 99) // One automatic hit; Dirty applies no damage.
  assert.equal(next.battle.stunRemaining, 3)
  assert.equal(next.battle.dirty, 0)
  assert.equal(next.battle.dirtyProgress, 3)
})

test('Dirty recipe, inventory and partial five-throw progress survive SQLite close and reopen', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'winter-dirty-'))
  const storage = path.join(directory, 'winter.sqlite')
  const f = await fixture(t, { storage })
  const bought = await f.sturdy()
  await f.dirtyRecipe()
  await f.run('battle-start', bought.battle.fightId)
  f.at(14000)
  const before = await f.run('battle-tick')
  await f.close()
  const reopened = new Sequelize({ dialect: 'sqlite', storage, logging: false })
  t.after(async () => { await reopened.close(); await rm(directory, { recursive: true, force: true }) })
  const economy = createEconomy({ sequelize: reopened, clock: () => 14000 })
  const after = await economy.execute({ guildId: 'g', userId: 'p', interactionId: 'reopened-dirty' })
  assert.deepEqual(after.battle, before.battle)
  assert.deepEqual([after.battle.dirtyUnlocked, after.battle.dirty, after.battle.dirtyProgress], [1, 1, 2])
})

test('new Discord controls validate owners, development environment and Max quantities', async t => {
  const f = await fixture(t)
  await f.rough()
  const handle = createHandler({ getEconomy: () => f.economy, authorize: () => null, environment: () => 'development' })
  let id = 0, payload
  const run = (action, owner = 'p') => handle({ id: `route-${++id}`, guildId: 'g', user: { id: owner }, customId: `snow:p:${action}`,
    isButton: () => true, deferUpdate: async () => {}, editReply: async p => { payload = p }, reply: async p => { payload = p } })
  await run('buy-spicy:max')
  assert.deepEqual(buttons(payload).map(b => b.label), ['Throw', 'Restart'])
  await run('test-kill', 'other')
  assert.match(payload.content, /another player/)
  await run('buy-spicy:10')
  assert.match(payload.content, /Invalid winter/)
  const prod = createHandler({ getEconomy: () => { throw Error('Must not touch storage') }, authorize: () => null, environment: () => 'production' })
  await prod({ guildId: 'g', user: { id: 'p' }, customId: 'snow:p:test-kill', isButton: () => true, reply: async p => { payload = p } })
  assert.match(payload.content, /only in development/)
})

test('Gym purchases cost the current level, serialize safely and never charge a replay twice', async t => {
  const f = await fixture(t)
  assert.equal((await f.run('train-strength')).view, 'not-ready')
  await f.sturdy()
  await f.replace({ trainUnlocked: 1, sweat: 2 })
  const gym = await f.run('train')
  assert.deepEqual(gym.battle.gym, { strength: 1, accuracy: 1, defense: 1, attack: 1 })
  const ui = screen(gym, 'train')
  assert.equal(ui.embeds[0].toJSON().description, '_It’s time to train. No complaints!_')
  assert.deepEqual(buttons(ui).map(b => b.label), ['💪🏽 STR · 1💦', '🎯 ACC · 1💦', '🛡️ DEF · 1💦', '⚔️ ATT · 1💦', '🏋️ Lift 100lbs'])
  const one = await f.run('train-strength', undefined, { interactionId: 'same-training' })
  assert.deepEqual([one.battle.gym.strength, one.battle.sweat], [2, 1])
  assert.deepEqual(await f.run('train-strength', undefined, { interactionId: 'same-training' }), one)
  const upgrades = await Promise.all([f.run('train-strength'), f.run('train-accuracy'), f.run('train-defense')])
  assert.match(upgrades[0].message, /need 2💦/)
  assert.deepEqual(upgrades.at(-1).battle.gym, { strength: 2, accuracy: 2, defense: 1, attack: 1 })
  assert.equal(upgrades.at(-1).battle.sweat, 0)
  assert.equal(buttons(screen(upgrades.at(-1), 'train')).filter(b => b.custom_id.includes(':train-')).every(b => b.disabled), true)
  const reopened = createEconomy({ sequelize: f.db, clock: () => 0 })
  const saved = await reopened.execute({ guildId: 'g', userId: 'p', interactionId: 'saved-gym' })
  assert.deepEqual(saved.battle.gym, upgrades.at(-1).battle.gym)
})

test('Strength 100 lifts 100lbs once and unlocks Hendrix, while Recipe unlocks Requia for 999k diamonds once', async t => {
  const f = await fixture(t)
  const bought = await f.sturdy()
  const opponentUI = screen(bought, bought.view)
  assert.equal(opponentUI.embeds[0].toJSON().title, 'New Opponent Unlocked!')
  assert.match(opponentUI.embeds[0].toJSON().description, /Alright, now we’re talking. This snowman is no pushover/)
  assert.deepEqual(buttons(opponentUI).map(b => b.label), ['⛄️'])
  await f.replace({ trainUnlocked: 1, sweat: 99, gym: { strength: 99, accuracy: 100, defense: 100, attack: 100 } })
  const denied = await f.run('lift')
  assert.equal(denied.message, 'With those scrawny arms? Nice try.')
  assert.equal(denied.battle.hendrixUnlocked, 0)
  const trained = await f.run('train-strength')
  assert.equal(trained.battle.gym.strength, 100)
  assert.equal(trained.battle.sweat, 0)
  const lift = await f.run('lift')
  assert.equal(lift.view, 'hendrix-unlocked')
  assert.equal((await f.run('lift')).battle.hendrixUnlocked, 1)
  assert.equal((await f.run('opponent-hendrix')).view, 'hendrix')
  const shop = screen(await f.run('shop'), 'shop', { development: true })
  assert.equal(shop.embeds[0].toJSON().fields.find(field => field.name === '`Recipe`').value, '**999k💎**')
  assert.ok(buttons(shop).find(b => b.custom_id.endsWith(':buy-recipe')).disabled)
  assert.ok(shop.components.length <= 5)
  const refused = await f.run('buy-recipe')
  assert.match(refused.message, /999k💎/)
  await f.db.query('UPDATE WinterPlayers SET diamonds=999000')
  const purchases = await Promise.all([f.run('buy-recipe'), f.run('buy-recipe')])
  assert.equal(purchases.filter(r => r.view === 'requia-unlocked').length, 1)
  assert.equal(purchases.at(-1).player.diamonds, 0)
  assert.equal(purchases.at(-1).battle.requiaUnlocked, 1)
  const opponents = await f.run('throw')
  assert.deepEqual(buttons(screen(opponents, opponents.view)).map(b => b.label), ['⛄️', 'Hendrix 💪🏽', 'Requia 💎'])
  assert.equal((await f.run('opponent-requia')).view, 'requia')
  assert.equal((await f.state()).active, 0)
  const prompt = await f.run('restart')
  const reset = await f.run('restart-confirm', prompt.progress.restartToken)
  assert.deepEqual(reset.battle.gym, { strength: 1, accuracy: 1, defense: 1, attack: 1 })
  assert.deepEqual([reset.battle.hendrixUnlocked, reset.battle.requiaUnlocked], [0, 0])
})

test('Gym levels have no combat effect before the owner supplies their math', async t => {
  const normal = await fixture(t, { random: () => 0 }), trained = await fixture(t, { random: () => 0 })
  const normalBought = await normal.sturdy(), trainedBought = await trained.sturdy()
  await trained.replace({ gym: { strength: 100, accuracy: 100, defense: 100 } })
  await normal.run('battle-start', normalBought.battle.fightId)
  await trained.run('battle-start', trainedBought.battle.fightId)
  normal.at(6000); trained.at(6000)
  const a = await normal.run('battle-tick'), b = await trained.run('battle-tick')
  for (const field of ['playerHp', 'enemyHp', 'throws', 'hits', 'enemyAttacks', 'enemyHits', 'nextPlayerAt', 'nextEnemyAt']) assert.equal(a.battle[field], b.battle[field], field)
})

test('Dirty hits use accuracy with conditional 80% and 75% extensions, zero damage and nonstacking refresh', () => {
  const { freshBattle, throwDirty } = require('../services/winter/battle')
  for (const [draws, expected] of [[[0, .8], 1], [[0, .79999, .75], 2], [[0, .79999, .74999], 3]]) {
    const state = { ...freshBattle(), sturdyOwned: 1, idleStarted: 1, active: 1, dirtyUnlocked: 1 }
    let used = 0
    assert.equal(throwDirty(state, () => { assert.ok(used < draws.length); return draws[used++] }), true)
    assert.equal(used, draws.length)
    assert.equal(state.stunRemaining, expected)
    assert.equal(state.enemyHp, 100)
    assert.deepEqual([state.throws, state.sweat, state.hits], [1, 1, 1])
    state.stunRemaining = 3
    const refresh = [0, .9]
    throwDirty(state, () => refresh.shift())
    assert.equal(state.stunRemaining, 3)
  }
})

test('stun skips enemy schedules without accuracy rolls, then expires; combat bars show red enemy above green player', async t => {
  let draws = 0
  const f = await fixture(t, { random: () => { draws++; return 0 } })
  const bought = await f.sturdy()
  await f.dirtyRecipe()
  const started = await f.run('battle-start', bought.battle.fightId)
  await f.replace({ dirty: 1 })
  await f.run('battle-dirty', started.battle.fightId)
  assert.equal(draws, 3) // Accuracy, then the two extension rolls.
  f.at(9000)
  const stunned = await f.run('battle-tick')
  assert.equal(stunned.battle.stunRemaining, 0)
  assert.equal(stunned.battle.stunnedAttacks, 3)
  assert.equal(stunned.battle.enemyAttacks, 0)
  assert.equal(stunned.battle.playerHp, 10)
  assert.equal(draws, 7) // Four automatic throws; skipped enemy attacks draw nothing.
  f.at(12000)
  const resumed = await f.run('battle-tick')
  assert.equal(resumed.battle.playerHp, 9)
  assert.equal(resumed.battle.enemyAttacks, 1)
  assert.equal(draws, 10)
  const fields = screen(resumed, 'fight').embeds[0].toJSON().fields
  assert.equal(fields[0].name, 'Sturdy Snowman')
  assert.match(fields[0].value, /🟥/)
  assert.equal(fields[1].name, 'You')
  assert.match(fields[1].value, /🟩/)
})

test('pause preserves a pending stun but killing a target clears stun for its replacement', async t => {
  const f = await fixture(t, { random: () => 0 })
  const bought = await f.sturdy()
  await f.dirtyRecipe()
  const started = await f.run('battle-start', bought.battle.fightId)
  await f.replace({ stunRemaining: 3, enemyHp: 1 })
  await f.run('battle-pause', started.battle.fightId)
  f.at(1000000)
  const paused = await f.run('throw')
  assert.equal(paused.battle.stunRemaining, 3)
  await f.run('battle-start', paused.battle.fightId)
  f.at(1002000)
  const won = await f.run('battle-tick')
  assert.equal(won.battle.defeated, 1)
  assert.equal(won.battle.stunRemaining, 0)
})

test('new Gym and opponent buttons preserve ownership checks and route unlocks without starting undefined fights', async t => {
  const f = await fixture(t)
  await f.sturdy()
  await f.replace({ trainUnlocked: 1, sweat: 99, gym: { strength: 100, accuracy: 99, defense: 100, attack: 100 } })
  const handle = createHandler({ getEconomy: () => f.economy, authorize: () => null, environment: () => 'development' })
  let id = 0, payload
  const run = (action, userId = 'p') => handle({ id: `gym-ui-${++id}`, guildId: 'g', user: { id: userId }, customId: `snow:p:${action}`, isButton: () => true,
    deferUpdate: async () => {}, reply: async p => { payload = p }, editReply: async p => { payload = p } })
  await run('train-accuracy', 'other')
  assert.match(payload.content, /another player/)
  await run('train-accuracy')
  assert.match(payload.embeds[0].toJSON().description, /Accuracy is now MAX/)
  await run('lift')
  assert.equal(payload.embeds[0].toJSON().title, 'New Opponent Unlocked!')
  await run('opponent-hendrix')
  assert.equal(payload.embeds[0].toJSON().title, 'Hendrix 💪🏽')
  await run('opponent-requia')
  assert.match(payload.embeds[0].toJSON().description, /not ready/)
})

test('regular, Spicy and Dirty share player accuracy and only hits earn Sweat', () => {
  const { freshBattle, throwAtEnemy, throwDirty } = require('../services/winter/battle')
  for (const kind of ['regular', 'spicy', 'dirty']) {
    for (const [accuracy, draw, expected] of [[.5, .49999, true], [.5, .5, false], [0, 0, false], [1, .99999, true]]) {
      const state = { ...freshBattle(), sturdyOwned: 1, idleStarted: 1, dirtyUnlocked: 1 }
      const settings = { ...config, playerAccuracy: accuracy }
      let rolls = 0
      const random = () => { rolls++; return draw }
      const hit = kind === 'dirty' ? throwDirty(state, random, settings) : throwAtEnemy(state, 0, kind === 'spicy' ? 10 : 1, random, settings)
      assert.equal(hit, expected, `${kind}: ${accuracy}/${draw}`)
      assert.equal(state.sweat, Number(expected))
      assert.equal(state.hits, Number(expected))
      assert.equal(state.throws, 1)
      assert.equal(state.dirtyProgress, 1) // Production counts throws, including misses.
      if (!expected) {
        assert.equal(rolls, 1)
        assert.equal(state.stunRemaining, 0)
        assert.equal(state.enemyHp, 100)
      }
    }
  }
})

test('the hundredth Sturdy victory produces 200 HP and future victories and resume preserve growth', async t => {
  const f = await fixture(t, { random: () => 0 })
  const bought = await f.sturdy()
  const started = await f.run('battle-start', bought.battle.fightId)
  await f.replace({ defeated: 99, enemyMaxHp: 199, enemyHp: 1 })
  await f.db.query('UPDATE WinterKitchen SET spicy=2')
  const hundred = await f.run('battle-special', started.battle.fightId, { interactionId: 'hundredth-victory' })
  assert.deepEqual([hundred.battle.defeated, hundred.battle.enemyMaxHp, hundred.battle.enemyHp], [100, 200, 200])
  assert.deepEqual(await f.run('battle-special', started.battle.fightId, { interactionId: 'hundredth-victory' }), hundred)
  const paused = await f.run('battle-pause', started.battle.fightId)
  f.at(50000)
  const resumed = await f.run('battle-start', paused.battle.fightId)
  assert.deepEqual([resumed.battle.defeated, resumed.battle.enemyMaxHp, resumed.battle.enemyHp], [100, 200, 200])
  await f.replace({ enemyHp: 1 })
  const next = await f.run('battle-special', resumed.battle.fightId)
  assert.deepEqual([next.battle.defeated, next.battle.enemyMaxHp, next.battle.enemyHp], [101, 201, 201])
  const reloaded = createEconomy({ sequelize: f.db, clock: () => 50000 })
  const saved = await reloaded.execute({ guildId: 'g', userId: 'p', interactionId: 'saved-sturdy-growth' })
  assert.equal(saved.battle.defeated, 101)
  assert.equal(saved.battle.enemyMaxHp, 201)
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

test('all four stats cost 19800 Sweat to MAX and all four are required for the lift', async t => {
  const f = await fixture(t)
  await f.sturdy()
  await f.replace({ trainUnlocked: 1, sweat: 19800 })
  const { SKILLS } = require('../services/winter/gym')
  for (const skill of SKILLS) {
    for (let level = 1; level < 100; level++) {
      const trained = await f.run(`train-${skill.id}`)
      assert.equal(trained.battle.gym[skill.id], level + 1)
    }
    if (skill.id !== 'attack') {
      const blocked = await f.run('lift')
      assert.equal(blocked.message, 'With those scrawny arms? Nice try.')
      assert.equal(blocked.battle.hendrixUnlocked, 0)
      const desc = screen(blocked, 'train').embeds[0].toJSON().description
      assert.equal(desc, '_With those scrawny arms? Nice try._')
      assert.doesNotMatch(desc, /time to train/)
    }
  }
  const state = await f.state()
  assert.deepEqual(state.gym, { strength: 100, accuracy: 100, defense: 100, attack: 100 })
  assert.equal(state.sweat, 0)
  const ui = screen(await f.run('train'), 'train')
  assert.deepEqual(ui.embeds[0].toJSON().fields.map(f => [f.name, f.value]), [['💪🏽 STR', 'MAX'], ['🎯 ACC', 'MAX'], ['🛡️ DEF', 'MAX'], ['⚔️ ATT', 'MAX']])
  assert.ok(buttons(ui).filter(b => b.custom_id.includes(':train-')).every(b => b.disabled && b.label.endsWith('MAX')))
  await f.replace({ sweat: 1000 })
  const capped = await Promise.all(SKILLS.map(skill => f.run(`train-${skill.id}`)))
  assert.ok(capped.every(r => r.battle.sweat === 1000 && r.message.endsWith('is already MAX.')))
  assert.deepEqual(capped.at(-1).battle.gym, state.gym)
  const lifted = await f.run('lift')
  assert.equal(lifted.view, 'hendrix-unlocked')
  assert.equal(lifted.battle.hendrixUnlocked, 1)
  assert.equal(lifted.battle.sweat, 1000)
})

test('ATT defaults safely for existing players and its button uses full names only in success feedback', async t => {
  const f = await fixture(t)
  await f.sturdy()
  await f.replace({ trainUnlocked: 1, sweat: 2, hendrixUnlocked: 1, gym: { strength: 30, accuracy: 40, defense: 50 } })
  const saved = await f.run('train')
  assert.deepEqual(saved.battle.gym, { strength: 30, accuracy: 40, defense: 50, attack: 1 })
  assert.equal(saved.battle.hendrixUnlocked, 1)
  const handle = createHandler({ getEconomy: () => f.economy, authorize: () => null, environment: () => 'development' })
  let payload
  await handle({ id: 'train-attack-button', guildId: 'g', user: { id: 'p' }, customId: 'snow:p:train-attack', isButton: () => true,
    deferUpdate: async () => {}, reply: async p => { payload = p }, editReply: async p => { payload = p } })
  assert.ok(payload.embeds, payload.content)
  assert.equal(payload.embeds[0].toJSON().description, '_It’s time to train. No complaints!_\n\n⚔️ Attack is now level 2.')
  assert.ok(buttons(payload).find(b => b.custom_id.endsWith(':train-attack')).label.includes('ATT'))
  assert.ok(payload.embeds[0].toJSON().fields.every(f => !/Strength|Accuracy|Defense|Attack/.test(f.name)))
  const replay = await f.run('train-attack', undefined, { interactionId: 'train-attack-button' })
  assert.equal(replay.battle.gym.attack, 2)
  assert.equal(replay.battle.sweat, 1)
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
