const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { Sequelize } = require('sequelize')
const { fixture } = require('./snowball-fight/fixture')
const { createStore, GameError } = require('../services/winter/snowball-fight/store')
const R = require('../services/winter/snowball-fight/rules')
const { render } = require('../services/winter/snowball-fight/presentation')
const { createHandler, parseButton, restriction } = require('../services/winter/snowball-fight/runtime')
const { commandEnabled } = require('../services/command-environment')
const { progressBar } = require('../services/achievement-progress')

test('registration is repeatable, scoped, and never resets an existing player', async t => {
  const f = await fixture(t)
  const first = await f.execute('start')
  assert.equal(first.player.snowballs, 10)
  await f.execute('collect')
  assert.equal((await f.execute('start')).player.snowballs, 12)
  assert.equal((await f.execute('start', { guildId: 'other' })).player.snowballs, 10)
  assert.equal((await f.read('SnowFightPlayers')).length, 2)
  await assert.rejects(f.execute('collect', { userId: 'unjoined' }), /Join first/)
})

test('collection grants two, enforces cooldown, tracks lifetime, and caps exactly', async t => {
  const f = await fixture(t)
  const first = await f.execute('collect')
  assert.equal(first.player.snowballs, 12)
  assert.equal(first.player.state.collected, 2)
  assert(first.notices.some(n => n.includes('First Snow')))
  await assert.rejects(f.execute('collect'), /Collect again/)
  f.advance(60000)
  await f.edit(p => { p.snowballs = 49 })
  assert.equal((await f.execute('collect')).player.snowballs, 50)
  f.advance(60000)
  await assert.rejects(f.execute('collect'), /full/)
  assert.equal((await f.execute('stats')).player.state.collected, 3)
})

test('concurrent collections and receipt replay cannot duplicate grants', async t => {
  const f = await fixture(t)
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => f.execute('collect')))
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  f.advance(60000)
  const input = { guildId: 'g', userId: 'p', action: 'collect', interactionId: 'same' }
  const [a, b] = await Promise.all([f.store.execute(input), f.store.execute(input)])
  assert.equal(a.player.snowballs, b.player.snowballs)
  assert.equal(b.replayed, true)
  await assert.rejects(f.store.execute({ ...input, userId: 'other' }), /identity mismatch/)
  assert.equal((await f.execute('stats')).player.snowballs, 14)
})

test('PvP validates targets, spends ammunition, records hits/misses and defender stats', async t => {
  const f = await fixture(t)
  for (const extra of [{ targetId: 'p' }, { targetId: 'b', targetBot: true }, { targetId: 'missing' }])
    await assert.rejects(f.execute('throw', extra), GameError)
  await f.execute('start', { userId: 'q' })
  const hit = await f.execute('throw', { targetId: 'q' })
  assert.equal(hit.player.snowballs, 9)
  assert.equal(hit.player.state.hits, 1)
  assert.equal(hit.player.state.pvpRewards, 1)
  assert.equal((await f.execute('stats', { userId: 'q' })).player.state.timesHit, 1)
  await assert.rejects(f.execute('throw', { targetId: 'q' }), /Throw again/)
  f.advance(10000); f.random(0.99)
  const miss = await f.execute('throw', { targetId: 'q' })
  assert.equal(miss.player.state.throws, 2)
  assert.equal(miss.player.state.hits, 1)
  assert.equal(miss.player.state.streak, 0)
  assert.equal(miss.player.state.bestStreak, 1)
  assert.equal(miss.player.snowballs, 8)
  await f.edit(p => { p.snowballs = 0 }); f.advance(10000)
  await assert.rejects(f.execute('throw', { targetId: 'q' }), /Collect more/)
})

test('same-target, reciprocal, and daily reward restrictions keep normal hit statistics', async t => {
  const f = await fixture(t)
  await f.execute('start', { userId: 'q' })
  await f.execute('throw', { targetId: 'q' }); f.advance(10000)
  const second = await f.execute('throw', { targetId: 'q' })
  assert.equal(second.player.state.hits, 2)
  assert.equal(second.player.state.pvpRewards, 1)
  const reciprocal = await f.execute('throw', { userId: 'q', targetId: 'p' })
  assert.equal(reciprocal.player.state.hits, 1)
  assert.equal(reciprocal.player.state.pvpRewards, 0)
  f.advance(3600001)
  assert.equal((await f.execute('throw', { targetId: 'q' })).player.state.pvpRewards, 2)
  await f.edit(p => { p.state.daily.pvpRewards = R.config.pvp.dailyCap })
  await f.execute('start', { userId: 'new' }); f.advance(10000)
  assert.equal((await f.execute('throw', { targetId: 'new' })).player.state.pvpRewards, 2)
})

test('daily is atomic once per UTC day, resets at midnight, and caps ammunition', async t => {
  const f = await fixture(t)
  f.at(Date.UTC(2026, 10, 9, 23, 59, 59))
  const claims = await Promise.allSettled([f.execute('daily'), f.execute('daily')])
  assert.equal(claims.filter(c => c.status === 'fulfilled').length, 1)
  let p = (await f.execute('stats')).player
  assert.equal(p.buttons, 20); assert.equal(p.snowballs, 20)
  f.advance(1000); await f.edit(p => { p.snowballs = 49 })
  p = (await f.execute('daily')).player
  assert.equal(p.snowballs, 50); assert.equal(p.buttons, 40)
  assert.equal(p.state.dailies, 2)
})

test('quests rotate deterministically, persist progress and claim each reward once', async t => {
  const f = await fixture(t)
  await f.execute('collect'); f.advance(60000); await f.execute('collect')
  let q = await f.execute('quests')
  assert.equal(q.player.state.daily.counters.collected, 4)
  assert.equal(R.quests(q.player.state.daily.day).length, 3)
  const before = q.player.buttons
  const claims = await Promise.allSettled([f.execute('claim'), f.execute('claim')])
  assert.equal(claims.filter(c => c.status === 'fulfilled').length, 1)
  q = await f.execute('quests')
  assert(q.claimed.includes('collect')); assert.equal(q.player.buttons, before + 15)
  f.advance(R.DAY)
  q = await f.execute('quests')
  assert.equal(q.player.state.daily.counters.collected, undefined)
  assert.deepEqual(q.claimed, [])
  await assert.rejects(f.execute('claim'), /No completed/)
})

test('shop and gifts atomically debit/credit and reject capacity, funds and duplicate cosmetics', async t => {
  const f = await fixture(t)
  await assert.rejects(f.execute('buy', { itemId: 'cocoa' }), /Not enough/)
  await f.execute('daily')
  assert.equal((await f.execute('buy', { itemId: 'snowballs' })).player.snowballs, 30)
  await f.execute('start', { userId: 'q' })
  const given = await f.execute('gift', { targetId: 'q', amount: 5 })
  assert.equal(given.player.snowballs, 25)
  assert.equal((await f.execute('stats', { userId: 'q' })).player.snowballs, 15)
  for (const amount of [0, -1, 100, 1.5, NaN]) await assert.rejects(f.execute('gift', { targetId: 'q', amount }), GameError)
  await assert.rejects(f.execute('gift', { targetId: 'q', amount: 40 }), /inventory space/)
  assert.equal((await f.execute('stats')).player.snowballs, 25)
  await f.edit(p => { p.buttons = 100; p.snowballs = 49 })
  await assert.rejects(f.execute('buy', { itemId: 'snowballs' }), /Make room/)
  await f.execute('buy', { itemId: 'snowflake' })
  await assert.rejects(f.execute('buy', { itemId: 'snowflake' }), /maximum/)
  assert.equal((await f.execute('stats')).player.buttons, 60)
  assert.equal((await f.read('SnowFightGifts')).length, 1)
})

test('an encounter persists one battle, verifies revision, spends once, and supports cancellation', async t => {
  const f = await fixture(t)
  const b = (await f.execute('fight', { characterId: 'hen' })).battle
  assert.equal((await f.execute('fight', { characterId: 'kyl' })).battle.id, b.id)
  const attack = { guildId: 'g', userId: 'p', interactionId: 'turn', action: 'attack', battleId: b.id, revision: 0 }
  const [a, duplicate] = await Promise.all([f.store.execute(attack), f.store.execute(attack)])
  assert.equal(a.battle.revision, 1); assert.equal(duplicate.battle.revision, 1)
  assert.equal((await f.execute('stats')).player.snowballs, 9)
  await assert.rejects(f.execute('attack', { battleId: b.id, revision: 0 }), /controls expired/)
  const retreat = await f.execute('retreat', { battleId: b.id, revision: 1 })
  assert.equal(retreat.battle.outcome, 'retreat')
  assert.equal((await f.read('SnowFightBattles')).length, 0)
  assert.equal((await f.read('SnowFightEncounters'))[0].outcome, 'retreat')
})

test('cocoa has inventory/HP/usage gates and expiry never progresses combat or rewards', async t => {
  const f = await fixture(t)
  await f.execute('daily'); await f.execute('buy', { itemId: 'cocoa' })
  let b = (await f.execute('fight', { characterId: 'azu' })).battle
  await assert.rejects(f.execute('heal', { battleId: b.id, revision: b.revision }), /HP is full/)
  b = (await f.execute('attack', { battleId: b.id, revision: b.revision })).battle
  const healed = await f.execute('heal', { battleId: b.id, revision: b.revision })
  assert.equal(healed.player.state.cocoa, 0)
  assert.equal(healed.battle.heals, 1)
  assert.equal(healed.player.snowballs, 19)
  f.advance(R.config.combat.expiresMs)
  await f.execute('stats')
  assert.equal((await f.read('SnowFightBattles')).length, 0)
  assert.equal((await f.read('SnowFightEncounters'))[0].outcome, 'expired')
  assert.equal((await f.execute('stats')).player.state.wins, 0)
})

test('three separate UTC-day victories unlock one permanent badge and allow equipment', async t => {
  const f = await fixture(t, { seed: () => 1 })
  await f.edit(p => { p.snowballs = 50 })
  let first = await f.battle()
  assert.equal(first.battle.outcome, 'victory')
  assert.equal((await f.read('SnowFightBadgeProgress'))[0].marks, 1)
  const repeated = await f.battle()
  assert.equal(repeated.battle.outcome, 'victory')
  assert.equal((await f.read('SnowFightBadgeProgress'))[0].marks, 1)
  assert.equal((await f.read('SnowFightLedger', "WHERE reason='victory:hen'")).length, 1)
  await assert.rejects(f.execute('choose', { characterId: 'hen' }), /Unlock/)
  f.advance(R.DAY); await f.battle(); f.advance(R.DAY)
  const unlocked = await f.battle()
  assert.equal(unlocked.unlocked, 'hen')
  assert.equal(unlocked.player.state.badges, 1)
  assert.equal(render(unlocked, 'p').embeds[1].toJSON().title, '🏅 Classic Hendrix Badge Unlocked!')
  assert.equal((await f.read('BadgeOwnership'))[0].badgeId, 'snowball-fight:classic:hen')
  const badges = require('../services/profile-card').recentBadges(await f.read('BadgeOwnership'), require('../services/badges').profileCatalog)
  assert.equal(badges[0].imageCollection, 'Classic')
  assert.equal(badges[0].imageAsset, 'HENDRIX_BADGE.png')
  assert.equal((await f.execute('choose', { characterId: 'hen' })).player.state.equipped, 'hen')
  f.advance(R.DAY); await f.battle()
  assert.equal((await f.read('BadgeOwnership')).length, 1)
  assert.equal((await f.read('SnowFightBadgeProgress'))[0].marks, 3)
})

test('achievements grant once, accuracy ranks require minimum throws, and rankings are guild scoped', async t => {
  const f = await fixture(t)
  const a = await f.execute('collect'), before = a.player.buttons
  assert.equal(before, 5)
  await f.execute('achievements')
  assert.equal((await f.execute('stats')).player.buttons, before)
  assert.equal((await f.read('SnowFightAchievements')).length, 1)
  await f.execute('start', { userId: 'q' })
  await f.execute('start', { userId: 'z', guildId: 'elsewhere' })
  await f.edit(p => { p.state.hits = 15; p.state.throws = 20 })
  const leaders = await f.execute('leaderboard', { metric: 'accuracy' })
  assert.deepEqual(leaders.leaders, [{ userId: 'p', score: 75 }])
  assert.equal((await f.execute('stats')).rank, 1)
  const hits = await f.execute('leaderboard', { metric: 'hits' })
  assert.deepEqual(hits.leaders.map(p => p.userId), ['p', 'q'])
  await assert.rejects(f.execute('leaderboard', { metric: 'hits; DROP TABLE SnowFightPlayers' }), /Invalid/)
})

test('additive migration and restarts preserve legacy rows, resources, quests, fights and receipts', async t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'snowfight-'))
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }))
  const storage = path.join(folder, 'fixture.sqlite')
  let db = new Sequelize({ dialect: 'sqlite', storage, logging: false })
  let now = Date.UTC(2026, 10, 9)
  try {
    await db.query('CREATE TABLE WinterPlayers (userId TEXT, snow INTEGER)')
    await db.query("INSERT INTO WinterPlayers VALUES('legacy',123)")
    let store = createStore({ sequelize: db, clock: () => now, seed: () => 42 })
    const run = (action, id, extra = {}) => store.execute({ guildId: 'g', userId: 'p', action, interactionId: id, ...extra })
    await run('start', 'start'); await run('daily', 'daily')
    await run('collect', 'collect1'); now += 60000; await run('collect', 'collect2')
    await run('claim', 'claim')
    const saved = await run('fight', 'fight', { characterId: 'hen' })
    await db.close()
    db = new Sequelize({ dialect: 'sqlite', storage, logging: false })
    store = createStore({ sequelize: db, clock: () => now })
    const replay = await run('daily', 'daily')
    assert.equal(replay.replayed, true); assert.equal(replay.player.buttons, 20)
    assert.equal((await run('fight', 'resume')).battle.id, saved.battle.id)
    assert.equal((await run('stats', 'stats')).player.snowballs, 24)
    assert.deepEqual((await run('quests', 'quests')).claimed, ['collect'])
    assert.deepEqual((await run('quests', 'quests-after-restart')).player.state.daily.quests, R.quests(R.dayAt(now)))
    await assert.rejects(run('claim', 'claim-again'), /No completed/)
    assert.deepEqual((await db.query('SELECT * FROM WinterPlayers'))[0], [{ userId: 'legacy', snow: 123 }])
    assert.equal((await db.query('PRAGMA integrity_check'))[0][0].integrity_check, 'ok')
    assert.deepEqual((await db.query('PRAGMA foreign_key_check'))[0], [])
  } finally { await db.close() }
})

test('presentation, command schema, control ownership, bot-tests scope and production exclusion', async t => {
  const f = await fixture(t)
  const command = require('../commands/Winter/SnowballFight')
  require('../services/command-registry').validateDefinition(command.data.toJSON())
  assert.equal(command.data.toJSON().options.length, 17)
  assert.equal(commandEnabled(command, 'production'), false)
  assert.equal(commandEnabled({ name: 'snow' }, 'development'), false)
  assert.equal(commandEnabled({ name: 'snow', environments: ['production'] }, 'production'), true)
  const oldGuild = process.env.GUILDID
  process.env.GUILDID = R.config.guildId
  t.after(() => { if (oldGuild === undefined) delete process.env.GUILDID; else process.env.GUILDID = oldGuild })
  const interaction = { guildId: R.config.guildId, channelId: '1076618367294771200', user: { id: 'p', bot: false } }
  assert.equal(restriction(interaction, 'development'), null)
  assert.match(restriction({ ...interaction, channelId: 'wrong' }, 'development'), /Use/)
  assert.match(restriction(interaction, 'production'), /development/)
  const receipt = await f.execute('fight', { characterId: 'hen' })
  const output = render(receipt, 'p')
  const controls = output.components[0].toJSON().components
  assert(controls.every(b => b.custom_id.length <= 100))
  assert.equal(controls.at(-1).label, 'Cancel'); assert.equal(controls.at(-1).style, 4)
  assert.equal(parseButton(controls[0].custom_id, 'p').action, 'attack')
  assert.throws(() => parseButton(controls[0].custom_id, 'q'), /another player/)
  assert.throws(() => parseButton('sf:p:buy:fake', 'p'), /Invalid/)
  for (const action of ['stats', 'shop', 'collection', 'quests', 'achievements', 'help', 'news', 'leaderboard']) {
    const view = render(await f.execute(action), 'p')
    for (const embed of view.embeds) assert.doesNotThrow(() => embed.toJSON())
  }
  assert.equal(progressBar(2, 3).length, 10)
  assert(fs.existsSync(path.resolve(__dirname, '../assets/badges/Classic', receipt.battle.character.asset)))
})

test('retired Winter entry points reject stale buttons and do not start old maintenance', async t => {
  const env = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'
  t.after(() => { if (env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = env })
  const legacy = require('../services/winter/runtime')
  let reply
  await legacy.handle({ reply: async value => { reply = value } })
  assert.match(reply.content, /retired/)
  assert.equal(legacy.startMaintenance({ once: () => { throw Error('Old worker started') } }), undefined)
  assert.equal(require('../services/winter/game/interactions').enabled(), false)
})

test('Discord delivery failure never retries committed gameplay; unauthorized buttons never access the store', async t => {
  const f = await fixture(t)
  let calls = 0, edits = 0
  const handler = createHandler({ authorize: () => null, getStore: () => ({ execute: async input => { calls++; return f.store.execute(input) } }) })
  const interaction = { guildId: 'g', user: { id: 'p' }, id: 'discord',
    isButton: () => false, options: { getSubcommand: () => 'collect', getString: () => null, getInteger: () => null },
    deferReply: async () => {}, editReply: async () => { if (++edits === 1) throw Error('Delivery failed') } }
  const original = console.error
  console.error = () => {}
  try { await handler(interaction) } finally { console.error = original }
  assert.equal(calls, 1)
  assert.equal((await f.execute('stats')).player.snowballs, 12)
  await handler({ ...interaction, isButton: () => true, customId: 'sf:other:claim', reply: async out => assert.match(out.content, /another player/) })
  assert.equal(calls, 1)
})

test('two SQLite connections enforce one daily claim and a shared capacity under concurrent writers', async t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'snowfight-concurrent-'))
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }))
  const databases = [0, 1].map(() => new Sequelize({ dialect: 'sqlite', storage: path.join(folder, 'fixture.sqlite'), logging: false }))
  const stores = databases.map(sequelize => createStore({ sequelize }))
  try {
    await stores[0].execute({ guildId: 'g', userId: 'p', interactionId: 'register', action: 'start' })
    await stores[1].initialize()
    const claims = await Promise.allSettled(stores.map((store, i) => store.execute({ guildId: 'g', userId: 'p', interactionId: `daily${i}`, action: 'daily' })))
    assert.equal(claims.filter(c => c.status === 'fulfilled').length, 1)
    assert.match(claims.find(c => c.status === 'rejected').reason.message, /Already claimed/)
    const state = await stores[0].execute({ guildId: 'g', userId: 'p', interactionId: 'stats', action: 'stats' })
    assert.equal(state.player.buttons, 20); assert.equal(state.player.snowballs, 20)
  } finally { await Promise.all(databases.map(db => db.close())) }
})

test('concurrent gifts cannot overdraw the sender or duplicate a transfer', async t => {
  const f = await fixture(t)
  await f.execute('start', { userId: 'q' })
  const results = await Promise.allSettled([f.execute('gift', { targetId: 'q', amount: 8 }), f.execute('gift', { targetId: 'q', amount: 8 })])
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  assert.equal((await f.execute('stats')).player.snowballs, 2)
  assert.equal((await f.execute('stats', { userId: 'q' })).player.snowballs, 18)
})

test('defeat cannot grant victory currency, marks or a badge', async t => {
  const f = await fixture(t)
  const lost = await f.battle('hen')
  assert.equal(lost.battle.outcome, 'defeat')
  assert.equal(lost.player.state.wins, 0)
  assert.equal((await f.read('SnowFightBadgeProgress')).length, 0)
  assert.equal((await f.read('BadgeOwnership')).length, 0)
  assert.equal((await f.read('SnowFightLedger', "WHERE reason LIKE 'victory:%'")).length, 0)
})

test('real slash and button handlers complete a two-member loop with the transactional store', async t => {
  const f = await fixture(t)
  await f.execute('start', { userId: 'q' })
  const replies = [], handler = createHandler({ authorize: () => null, getStore: () => f.store })
  const base = { guildId: 'g', guild: {}, user: { id: 'p' }, deferReply: async () => {}, deferUpdate: async () => {},
    editReply: async value => { replies.push(value) }, isButton: () => false }
  const slash = (action, extra = {}) => ({ ...base, id: `handler-${action}`, options: {
    getSubcommand: () => action, getString: key => extra[key] || null, getInteger: key => extra[key] || null,
    getUser: () => ({ id: 'q', bot: false }), getMember: () => ({ id: 'q' })
  } })
  await handler(slash('throw'))
  assert.match(replies.at(-1).embeds[0].toJSON().description, /hits/)
  await handler(slash('daily'))
  await handler({ ...base, id: 'buy-cocoa', isButton: () => true, customId: 'sf:p:buy:cocoa' })
  assert.equal((await f.execute('stats')).player.state.cocoa, 1)
  await handler(slash('item-info', { item: 'cocoa' }))
  assert.match(replies.at(-1).embeds[0].toJSON().description, /Owned: 1/)
  await handler(slash('fight', { character: 'hen' }))
  const attack = replies.at(-1).components[0].toJSON().components[0].custom_id
  await handler({ ...base, id: 'handler-attack', isButton: () => true, customId: attack })
  assert.match(replies.at(-1).embeds[0].toJSON().fields[0].value, /Turns: 1/)
  assert.equal((await f.execute('stats', { userId: 'q' })).player.state.timesHit, 1)
})

test('offline startup command selection exposes replacement only in development and preserves production definitions', () => {
  const { offlineDefinitions } = require('../deploy-commands')
  const root = path.resolve(__dirname, '..')
  const development = offlineDefinitions(root, 'development', Date.UTC(2026, 10, 9)).map(c => c.name)
  const production = offlineDefinitions(root, 'production', Date.UTC(2026, 10, 9)).map(c => c.name)
  assert(development.includes('snowball-fight')); assert(!development.includes('snow'))
  assert(!production.includes('snowball-fight'))
  const productionSnow = production.includes('snow')
  assert.equal(productionSnow, commandEnabled({ name: 'snow', environments: ['development', 'production'], eventKey: 'winter' }, 'production', Date.UTC(2026, 10, 9)))
})
