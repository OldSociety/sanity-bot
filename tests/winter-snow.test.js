const { test } = require('node:test')
const assert = require('node:assert/strict')
const { mkdtemp, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { Sequelize } = require('sequelize')
const { createEconomy, SHOVELS } = require('../services/winter/economy')
const { screen } = require('../services/winter/presentation')
const { createHandler, restriction } = require('../services/winter/runtime')

function connection(storage = ':memory:') {
  return new Sequelize({ dialect: 'sqlite', storage, logging: false })
}
async function fixture(t) {
  const db = connection()
  t.after(() => db.close())
  let now = 0, sequence = 0
  const economy = createEconomy({ sequelize: db, clock: () => now, allowRestart: true })
  const input = { guildId: 'guild', userId: 'player' }
  const execute = (action = 'status', quantity, extra = {}) => economy.execute({ ...input, interactionId: String(++sequence), action, quantity, ...extra })
  await execute()
  // Keep the original accrual/cost regression fixtures anchored at zero.
  await db.query('UPDATE WinterPlayers SET snow=0')
  return { db, economy, execute, at: value => { now = value }, advance: value => { now += value } }
}

test('Bare Hands rates and guild/user balance isolation are preserved', async t => {
  const f = await fixture(t)
  const { player } = await f.execute()
  assert.deepEqual([player.snow, player.snowballs, player.diamonds, player.tier, player.rock, player.remainder], [0, 0, 0, 0, 0, 0])
  assert.deepEqual(SHOVELS.map(s => s.rate), [1, 6, 36])
  f.at(10000)
  assert.equal((await f.execute()).player.snow, 10)
  assert.equal((await f.execute('status', undefined, { guildId: 'other' })).player.snow, 10)
  assert.equal((await f.execute('status', undefined, { userId: 'other' })).player.snow, 10)
})

test('frequent fractional accrual equals infrequent accrual and survives backwards clocks', async t => {
  const f = await fixture(t)
  await f.execute('status', undefined, { userId: 'infrequent' })
  await f.db.query('UPDATE WinterPlayers SET snow=0')
  for (let i = 1; i <= 101; i++) { f.at(i * 37); await f.execute() }
  const a = (await f.execute()).player
  const b = (await f.execute('status', undefined, { userId: 'infrequent' })).player
  assert.deepEqual([a.snow, a.remainder], [b.snow, b.remainder])
  assert.deepEqual([a.snow, a.remainder], [3, 737])
  f.at(2000)
  assert.deepEqual((({ snow, remainder, lastAccrual }) => [snow, remainder, lastAccrual])((await f.execute()).player), [3, 737, 3737])
  f.at(4000)
  assert.equal((await f.execute()).player.snow, 4)
})

test('Wooden costs exactly 100; old rate accrues before evolution, including fractions', async t => {
  const f = await fixture(t)
  f.at(100500)
  let p = (await f.execute('upgrade-0')).player
  assert.deepEqual([p.snow, p.tier, p.remainder], [0, 1, 500])
  f.at(101000)
  p = (await f.execute()).player
  assert.deepEqual([p.snow, p.remainder], [3, 500])
  assert.match((await f.execute('upgrade-0')).message, /changed/)
})

test('conversion rates, multipliers, Max and insufficient funds are exact', async t => {
  for (const [resource, cost] of [['snowballs', 10], ['diamonds', 1000]]) {
    const f = await fixture(t)
    f.at(200000000)
    const before = (await f.execute()).player.snow
    let spent = 0, count = 0
    for (const quantity of ['1', '10', '100']) {
      count += Number(quantity); spent += Number(quantity) * cost
      const result = await f.execute(resource, quantity)
      assert.equal(result.player.snow, before - spent)
      assert.equal(result.player[resource], count)
      assert.match(result.message, /Created/)
    }
    const p = (await f.execute(resource, 'max')).player
    assert.equal(p[resource], Math.floor(before / cost))
    assert.equal(p.snow, before % cost)
    const failure = await f.execute(resource, '1')
    assert.match(failure.message, /Not enough/)
    assert.deepEqual(failure.player, p)
    await assert.rejects(f.execute(resource, '-1'), /quantity/)
  }
})

test('Sturdy Rock costs ten diamonds, can be bought with Bare Hands, and is unique', async t => {
  const f = await fixture(t)
  assert.match((await f.execute('buy-rock')).message, /need 10/)
  f.at(11000000)
  await f.execute('diamonds', '10')
  const p = (await f.execute('buy-rock')).player
  assert.deepEqual([p.diamonds, p.rock, p.snow, p.tier], [0, 1, 1000, 0])
  assert.match((await f.execute('buy-rock')).message, /no longer/)
})

test('Stone requires both snow and rock, consumes both once, retains inventory and switches rate', async t => {
  const f = await fixture(t)
  assert.match((await f.execute('upgrade-0')).message, /requirements/)
  f.at(100000)
  await f.execute('upgrade-0')
  f.at(1767000)
  assert.match((await f.execute('upgrade-1')).message, /requirements/)
  await f.execute('diamonds', '10')
  await f.execute('buy-rock')
  assert.match((await f.execute('upgrade-1')).message, /requirements/)
  f.at(3700000)
  await f.execute('snowballs', '10')
  await f.execute('diamonds', '1')
  const before = (await f.execute()).player
  const p = (await f.execute('upgrade-1')).player
  assert.deepEqual([p.snow, p.snowballs, p.diamonds, p.rock, p.tier], [before.snow - 10000, 10, 1, 0, 2])
  f.advance(1000)
  assert.equal((await f.execute()).player.snow, p.snow + 36)
  assert.match((await f.execute('upgrade-1')).message, /changed/)
  assert.match((await f.execute('buy-rock')).message, /no longer/)
  assert.match(screen({ player: p }, 'shovel').embeds[0].toJSON().fields.at(-1).value, /Maximum shovel/)
  assert.equal(screen({ player: p }, 'shop').components.length, 1)
})

test('concurrent conversions cannot overspend; replaying a Discord ID cannot charge twice', async t => {
  const f = await fixture(t)
  f.at(1000000)
  const results = await Promise.all(Array.from({ length: 20 }, () => f.execute('diamonds', '1')))
  assert.equal(results.filter(r => r.message.startsWith('Created')).length, 1)
  assert.deepEqual([results.at(-1).player.snow, results.at(-1).player.diamonds], [0, 1])
  f.at(2000000)
  const input = { guildId: 'guild', userId: 'player', interactionId: 'same', action: 'diamonds', quantity: '1' }
  const replay = await Promise.all(Array.from({ length: 10 }, () => f.economy.execute(input)))
  assert.ok(replay.every(r => JSON.stringify(r) === JSON.stringify(replay[0])))
  assert.equal((await f.execute()).player.diamonds, 2)
  await assert.rejects(f.economy.execute({ ...input, userId: 'other' }), /mismatch/)
})

test('concurrent rock purchases and stale upgrades cannot duplicate or skip equipment', async t => {
  const f = await fixture(t)
  f.at(40000000)
  await f.execute('diamonds', '10')
  const buys = await Promise.all(Array.from({ length: 10 }, () => f.execute('buy-rock')))
  assert.equal(buys.filter(r => r.message.startsWith('Purchased')).length, 1)
  const wooden = await Promise.all(Array.from({ length: 10 }, () => f.execute('upgrade-0')))
  assert.equal(wooden.filter(r => r.message.startsWith('Upgraded')).length, 1)
  assert.equal(wooden.at(-1).player.tier, 1)
  const stone = await Promise.all(Array.from({ length: 10 }, () => f.execute('upgrade-1')))
  assert.equal(stone.filter(r => r.message.startsWith('Upgraded')).length, 1)
  assert.equal(stone.at(-1).player.rock, 0)
})

test('on-disk reopen preserves all resources, fraction, production, and replay receipts', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sanity-winter-'))
  const file = path.join(directory, 'test.sqlite')
  let db = connection(file), other, now = 0, sequence = 0
  t.after(async () => {
    await db.close()
    if (other) await other.close()
    await rm(directory, { recursive: true, force: true })
  })
  let economy = createEconomy({ sequelize: db, clock: () => now })
  const input = { guildId: 'guild', userId: 'player' }
  const execute = (action = 'status', quantity) => economy.execute({ ...input, interactionId: String(++sequence), action, quantity })
  await execute()
  now = 20200123
  await execute('snowballs', '10'); await execute('diamonds', '10'); await execute('buy-rock'); await execute('upgrade-0')
  await execute('attack')
  const before = await execute()
  await db.close()
  db = connection(file)
  economy = createEconomy({ sequelize: db, clock: () => now })
  assert.deepEqual(await economy.execute({ ...input, interactionId: String(sequence), action: 'status' }), before)
  now += 500
  const p = (await execute()).player
  assert.deepEqual([p.snow, p.remainder, p.snowballs, p.diamonds, p.rock, p.tier], [before.player.snow + 3, 123, 9, 0, 1, 1])
  assert.equal((await execute()).progress.dummyHp, 4)
  assert.equal((await execute()).progress.diamondsUnlocked, 1)
  // Two independent SQLite connections contend on the same player record.
  other = connection(file)
  const parallel = createEconomy({ sequelize: other, clock: () => now })
  await parallel.initialize()
  const results = await Promise.all([
    execute('diamonds', 'max'),
    parallel.execute({ ...input, interactionId: 'parallel', action: 'diamonds', quantity: 'max' }),
  ])
  assert.equal(results.filter(r => r.message.startsWith('Created')).length, 1)
  assert.equal((await execute()).player.diamonds, Math.floor(p.snow / 1000))
})

test('event accrual clamps at boundaries and unsafe balances roll back without loss', async t => {
  const db = connection()
  t.after(() => db.close())
  let now = 0
  const economy = createEconomy({ sequelize: db, clock: () => now, startsAt: 1000, endsAt: 5000 })
  const input = { guildId: 'g', userId: 'p', interactionId: 'start' }
  await economy.execute(input)
  now = 10000
  assert.equal((await economy.execute({ ...input, interactionId: 'end' })).player.snow, 14)
  await db.query('UPDATE WinterPlayers SET snow=9007199254740991, lastAccrual=1000')
  await assert.rejects(economy.execute({ ...input, interactionId: 'overflow' }), /safe integer/)
  const [[p]] = await db.query('SELECT * FROM WinterPlayers')
  assert.equal(p.snow, Number.MAX_SAFE_INTEGER)
  assert.equal(p.lastAccrual, 1000)
})

test('Discord slash and button screens are ephemeral, navigable, owner-validated and share logic', async t => {
  const f = await fixture(t)
  const handle = createHandler({ getEconomy: () => f.economy, authorize: () => null })
  function interaction(button = false, customId = '') {
    const calls = []
    return { id: `discord-${Math.random()}`, guildId: 'guild', user: { id: 'player' }, customId, calls,
      isButton: () => button, options: { getSubcommand: () => 'status' },
      deferReply: async p => calls.push(['defer', p]), deferUpdate: async () => calls.push(['update']),
      editReply: async p => calls.push(['edit', p]), reply: async p => calls.push(['reply', p]) }
  }
  const slash = interaction()
  await handle(slash)
  assert.equal(slash.calls[0][1].ephemeral, true)
  const navigation = slash.calls[1][1].components[0].toJSON().components
  assert.equal(navigation.length, 3)
  f.at(10000)
  const convert = interaction(true, 'snow:player:snowballs:1')
  await handle(convert)
  assert.equal(convert.calls[0][0], 'update')
  const embed = convert.calls[1][1].embeds[0].toJSON()
  assert.match(embed.description, /Created 1 snowballs/)
  assert.equal(embed.footer.text, 'Available: 0❄️ · 1⚪️')
  const foreign = interaction(true, 'snow:another:buy-rock')
  await handle(foreign)
  assert.match(foreign.calls[0][1].content, /another player/)
  const malformed = interaction(true, 'snow:player:snowballs:999')
  await handle(malformed)
  assert.match(malformed.calls[0][1].content, /Invalid winter/)
})

test('command schema, winter window and bot-tests policy are enforced on commands and buttons', t => {
  const saved = { NODE_ENV: process.env.NODE_ENV, GUILDID: process.env.GUILDID }
  t.after(() => { for (const [key, value] of Object.entries(saved)) value === undefined ? delete process.env[key] : process.env[key] = value })
  const policy = require('../config/commands/channel-policy.json')
  for (const environment of ['development', 'production']) {
    process.env.NODE_ENV = environment
    process.env.GUILDID = policy[environment].guildId
    const i = { guildId: process.env.GUILDID, channelId: policy[environment].botTestChannelId, user: { id: 'player' } }
    assert.equal(restriction(i, environment, Date.parse('2026-12-01T00:00:00Z')), null)
    assert.match(restriction({ ...i, guildId: 'wrong' }, environment), /configured server/)
    assert.match(restriction({ ...i, channelId: 'wrong' }, environment, Date.parse('2026-12-01T00:00:00Z')), /Use \/snow/)
    if (environment === 'production') {
      assert.match(restriction(i, environment, Date.parse('2026-11-26T07:59:59Z')), /not currently open/)
      assert.equal(restriction(i, environment, Date.parse('2026-11-26T08:00:00Z')), null)
      assert.equal(restriction(i, environment, Date.parse('2027-01-03T07:59:59Z')), null)
      assert.match(restriction(i, environment, Date.parse('2027-01-03T08:00:00Z')), /not currently open/)
    }
  }
  const command = require('../commands/Winter/Snow')
  require('../services/command-registry').validateDefinition(command.data.toJSON())
  assert.deepEqual(command.data.toJSON().options.map(o => o.name), ['hidden', 'train', 'kitchen', 'throw', 'help', 'status', 'snowballs', 'diamonds', 'shop', 'shovel'])
  const { definition } = require('../scripts/command-registry-audit')
  const source = require('node:fs').readFileSync(path.join(__dirname, '../commands/Winter/Snow.js'), 'utf8')
  assert.equal(definition(source, 'commands/Winter/Snow.js', 'production').eventKey, 'winter')
  assert.equal(definition(source, 'commands/Winter/Snow.js', 'development').eventKey, undefined)
})

test('first use welcomes with ten snow; dummy crafting and throwing retain discovered currencies', async t => {
  const db = connection(); t.after(() => db.close())
  let id = 0
  const e = createEconomy({ sequelize: db, clock: () => 0 })
  const run = (action, quantity) => e.execute({ guildId: 'g', userId: 'p', interactionId: `intro-${++id}`, action, quantity })
  const first = await run('throw')
  assert.equal(first.view, 'welcome')
  assert.equal(first.player.snow, 10)
  assert.equal(screen(first, first.view).embeds[0].toJSON().footer.text, 'Available: 10❄️')
  const dummy = await run('throw')
  assert.equal(dummy.progress.dummyHp, 5)
  const crafted = await run('craft', '1')
  assert.equal(crafted.view, 'throw')
  assert.equal(crafted.player.snowballs, 1)
  const attack = await run('attack')
  assert.equal(attack.progress.dummyHp, 4)
  assert.equal(attack.player.snowballs, 0)
  const embed = screen(attack, 'throw').embeds[0].toJSON()
  assert.match(embed.description, /4\/5 HP/)
  assert.equal(embed.footer.text, 'Available: 0❄️ · 0⚪️')
  assert.equal(embed.thumbnail.url, 'attachment://winter-dummy.png')
  assert.match((await run('attack')).message, /need a snowball/)
  assert.equal((await run('help')).progress.dummyHp, 4)
  const reopened = createEconomy({ sequelize: db, clock: () => 0 })
  const saved = await reopened.execute({ guildId: 'g', userId: 'p', interactionId: 'after-reopen' })
  assert.equal(saved.view, undefined)
  assert.equal(saved.progress.dummyHp, 4)
  assert.equal(saved.progress.snowballsUnlocked, 1)
})

test('currency discoveries survive spending all diamonds and appear on every screen', async t => {
  const f = await fixture(t)
  f.at(10000000)
  await f.execute('diamonds', '10')
  const receipt = await f.execute('buy-rock')
  assert.equal(receipt.player.diamonds, 0)
  for (const view of ['welcome', 'status', 'snowballs', 'diamonds', 'shop', 'shovel', 'throw', 'help']) {
    const payload = screen(receipt, view, { development: true })
    assert.match(payload.embeds[0].toJSON().footer.text, /0💎(?: .*💦)?$/)
    assert.equal(payload.components.at(-1).toJSON().components.at(-1).label, 'Restart')
    assert.ok(payload.components.length <= 5)
  }
})

test('confirmed development restart resets only this profile and rejects stale confirmations', async t => {
  const f = await fixture(t)
  f.at(20000000)
  await f.execute('snowballs', '10')
  await f.execute('diamonds', '10')
  await f.execute('buy-rock')
  await f.execute('upgrade-0')
  await f.execute('attack')
  await f.execute('status', undefined, { userId: 'other' })
  const before = await f.execute()
  const prompt = await f.execute('restart')
  assert.deepEqual(prompt.player, before.player)
  assert.equal(prompt.view, 'restart')
  await f.execute('restart-cancel')
  assert.match((await f.execute('restart-confirm', prompt.progress.restartToken)).message, /expired/)
  const prompt2 = await f.execute('restart')
  const reset = await f.execute('restart-confirm', prompt2.progress.restartToken)
  assert.equal(reset.view, 'welcome')
  assert.deepEqual([reset.player.snow, reset.player.snowballs, reset.player.diamonds, reset.player.tier, reset.player.rock, reset.player.remainder], [10, 0, 0, 0, 0, 0])
  assert.deepEqual([reset.progress.snowballsUnlocked, reset.progress.diamondsUnlocked, reset.progress.dummyHp], [0, 0, 5])
  assert.equal(screen(reset, 'welcome').embeds[0].toJSON().footer.text, 'Available: 10❄️')
  assert.equal((await f.execute('status', undefined, { userId: 'other' })).player.snow, 10)
  f.advance(1000)
  assert.equal((await f.execute()).player.snow, 11)
  assert.match((await f.execute('restart-confirm', prompt2.progress.restartToken)).message, /expired/)
  const prod = createEconomy({ sequelize: f.db })
  await assert.rejects(prod.execute({ guildId: 'g', userId: 'p', interactionId: 'prod-reset', action: 'restart' }), /development/)
  assert.ok(!screen(reset, 'status').components.some(r => r.toJSON().components.some(b => b.label === 'Restart')))
})

test('concurrent dummy throws cannot duplicate damage, go below zero or spend unavailable snowballs', async t => {
  const f = await fixture(t)
  f.at(1000000)
  await f.execute('craft', 'max')
  const attacks = await Promise.all(Array.from({ length: 20 }, () => f.execute('attack')))
  assert.equal(attacks.filter(r => r.message.startsWith('You threw')).length, 5)
  const receipt = await f.execute('throw')
  assert.equal(receipt.progress.dummyHp, 0)
  assert.equal(receipt.player.snowballs, 95)
})

test('Discord first-use, dummy buttons and confirmed restart work end to end; production rejects reset controls', async t => {
  const db = connection(); t.after(() => db.close())
  const economy = createEconomy({ sequelize: db, clock: () => 0, allowRestart: true })
  let sequence = 0
  const handle = createHandler({ getEconomy: () => economy, authorize: () => null, environment: () => 'development' })
  const interaction = (action = 'throw', button = false, user = 'p') => {
    const calls = []
    return { id: `buttons-${++sequence}`, guildId: 'g', user: { id: user }, customId: `snow:p:${action}`, calls,
      isButton: () => button, options: { getSubcommand: () => action },
      deferReply: async () => {}, deferUpdate: async () => {}, editReply: async payload => calls.push(payload), reply: async payload => calls.push(payload) }
  }
  const first = interaction(); await handle(first)
  assert.equal(first.calls[0].embeds[0].toJSON().title, 'Welcome to Winter Wars ❄️')
  const craft = interaction('craft:1', true); await handle(craft)
  assert.equal(craft.calls[0].embeds[0].toJSON().title, 'Training Dummy')
  const attack = interaction('attack', true); await handle(attack)
  assert.match(attack.calls[0].embeds[0].toJSON().description, /4\/5 HP/)
  const restart = interaction('restart', true); await handle(restart)
  assert.equal(restart.calls[0].embeds[0].toJSON().title, 'Restart your development profile?')
  const confirmId = restart.calls[0].components[0].toJSON().components[0].custom_id
  const confirm = interaction(confirmId.split(':').slice(2).join(':'), true); await handle(confirm)
  assert.equal(confirm.calls[0].embeds[0].toJSON().footer.text, 'Available: 10❄️')
  const foreign = interaction(confirmId.split(':').slice(2).join(':'), true, 'other'); await handle(foreign)
  assert.match(foreign.calls[0].content, /another player/)
  const prod = createHandler({ getEconomy: () => { throw Error('Must not open storage') }, authorize: () => null, environment: () => 'production' })
  const forged = interaction('restart', true); await prod(forged)
  assert.match(forged.calls[0].content, /development testing/)
})

test('crafting and exchange controls show only affordable quantities; no Status button remains', () => {
  const player = { userId: 'p', snow: 0, snowballs: 0, diamonds: 0, tier: 0, rock: 0 }
  const progress = { dummyHp: 5 }
  const buttons = payload => payload.components.flatMap(r => r.toJSON().components)
  for (const [snow, expected] of [[0, []], [9, []], [10, ['1', 'max']], [99, ['1', 'max']], [100, ['1', '10', 'max']], [999, ['1', '10', 'max']], [1000, ['1', '10', '100', 'max']]]) {
    const receipt = { player: { ...player, snow }, progress }
    const craft = buttons(screen(receipt, 'throw')).filter(b => b.custom_id.includes(':craft:'))
    assert.deepEqual(craft.map(b => b.custom_id.split(':').at(-1)), expected)
    assert.ok(craft.every(b => !b.disabled))
    const factory = buttons(screen(receipt, 'snowballs')).filter(b => /:snowballs:/.test(b.custom_id))
    assert.deepEqual(factory.map(b => b.custom_id.split(':').at(-1)), expected)
  }
  for (const view of ['welcome', 'status', 'snowballs', 'diamonds', 'shop', 'shovel', 'throw', 'help', 'broken', 'broken-again', 'shovel-gift', 'snowman-purchased']) {
    const payload = screen({ player, progress }, view, { development: true })
    assert.ok(buttons(payload).every(b => !b.custom_id.endsWith(':status') && !/Status/.test(b.label)), view)
    assert.equal(buttons(payload).at(-1).label, 'Restart')
    assert.ok(payload.components.length <= 5)
    assert.ok(payload.components.every(r => r.toJSON().components.length >= 1 && r.toJSON().components.length <= 5))
  }
  const exchange = buttons(screen({ player: { ...player, snow: 1000 }, progress }, 'diamonds'))
  assert.deepEqual(exchange.filter(b => /:diamonds:/.test(b.custom_id)).map(b => b.label), ['×1', 'Max'])
})

test('broken dummy leads to Requia gift, first diamond, one-diamond snowman and persistent 50 HP target', async t => {
  const f = await fixture(t)
  assert.match((await f.execute('shop-help')).message, /training dummy first/)
  f.at(100000)
  await f.execute('craft', '10')
  for (let i = 0; i < 4; i++) await f.execute('attack')
  const broken = await f.execute('attack')
  assert.equal(broken.view, 'broken')
  const brokenEmbed = screen(broken, broken.view).embeds[0].toJSON()
  assert.equal(brokenEmbed.title, 'Oh No!')
  assert.match(brokenEmbed.description, /You broke it! What were you thinking/)
  assert.equal(brokenEmbed.thumbnail.url, 'attachment://winter-broken-dummy.png')
  const revisit = await f.execute('throw')
  assert.equal(revisit.view, 'broken-again')
  assert.match(screen(revisit, revisit.view).embeds[0].toJSON().description, /I told you/)
  const shop = await f.execute('shop')
  const first = screen(shop, 'shop')
  assert.equal(first.embeds[0].toJSON().title, 'Requia’s Winter Shop')
  assert.match(first.embeds[0].toJSON().description, /looks like you broke/)
  assert.equal(first.components.length, 1)
  assert.equal(first.components[0].toJSON().components[0].label, 'Please help me 🙏🏽')
  assert.equal(first.components[0].toJSON().components[0].style, 3)
  assert.match((await f.execute('buy-snowman')).message, /Ask Requia/)
  f.at(100500)
  const gift = await f.execute('shop-help')
  assert.equal(gift.view, 'shovel-gift')
  assert.deepEqual([gift.player.tier, gift.player.snow, gift.player.remainder], [1, 0, 500])
  assert.equal(gift.shopProgress.helped, 1)
  assert.equal(screen(gift, gift.view).components[0].toJSON().components[0].label, 'Back to Shop')
  f.at(101000)
  assert.deepEqual([...(p => [p.snow, p.remainder])((await f.execute()).player)], [3, 500])
  assert.match((await f.execute('shop-help')).message, /already received/)
  const returning = screen(await f.execute('shop'), 'shop')
  assert.match(returning.embeds[0].toJSON().description, /You’re back/)
  assert.equal(returning.embeds[0].toJSON().fields, undefined)
  assert.equal(returning.components[0].toJSON().components[0].label, '💎 Exchange')
  assert.match((await f.execute('buy-snowman')).message, /need 1/)
  assert.equal((await f.execute('throw')).view, 'broken-again')
  f.at(300000)
  const diamond = await f.execute('diamonds', '1')
  assert.equal(diamond.progress.diamondsUnlocked, 1)
  assert.match(screen(diamond, 'diamonds').embeds[0].toJSON().footer.text, /1💎(?: .*💦)?$/)
  const wares = screen(await f.execute('shop'), 'shop')
  assert.equal(wares.embeds[0].toJSON().fields[0].name, '`Rough Snowman` ⛄️')
  const bought = await f.execute('buy-snowman')
  assert.equal(bought.view, 'snowman-purchased')
  assert.equal(bought.player.diamonds, 0)
  assert.equal(bought.shopProgress.snowmanHp, 50)
  assert.equal(bought.shopProgress.snowmanOwned, 1)
  assert.match(screen(bought, bought.view).embeds[0].toJSON().description, /new way to practice/)
  assert.match(screen(bought, bought.view).embeds[0].toJSON().footer.text, /0💎(?: .*💦)?$/)
  const target = screen(await f.execute('throw'), 'throw').embeds[0].toJSON()
  assert.equal(target.title, 'Rough Snowman ⛄️')
  assert.match(target.description, /50\/50 HP/)
  assert.equal(target.thumbnail.url, 'attachment://winter-snowman.png')
  await f.execute('craft', '1')
  const hit = await f.execute('attack')
  assert.equal(hit.shopProgress.snowmanHp, 49)
  assert.equal(hit.progress.dummyHp, 0)
  assert.match((await f.execute('buy-snowman')).message, /already own/)
  const reopened = createEconomy({ sequelize: f.db, clock: () => 300000, allowRestart: true })
  const saved = await reopened.execute({ guildId: 'guild', userId: 'player', interactionId: 'shop-reopen', action: 'throw' })
  assert.deepEqual(saved.shopProgress, hit.shopProgress)
  const reset = await f.execute('restart')
  const fresh = await f.execute('restart-confirm', reset.progress.restartToken)
  assert.deepEqual([fresh.shopProgress.helped, fresh.shopProgress.brokenSeen, fresh.shopProgress.snowmanOwned, fresh.shopProgress.snowmanHp], [0, 0, 0, 50])
  assert.equal(fresh.progress.dummyHp, 5)
})

test('concurrent shop help and snowman purchases grant once and cannot restore a damaged snowman', async t => {
  const f = await fixture(t)
  f.at(10000000)
  await f.execute('craft', '10')
  for (let i = 0; i < 5; i++) await f.execute('attack')
  const gifts = await Promise.all(Array.from({ length: 8 }, () => f.execute('shop-help')))
  assert.equal(gifts.filter(r => r.view === 'shovel-gift').length, 1)
  await f.execute('diamonds', '1')
  const purchases = await Promise.all(Array.from({ length: 8 }, () => f.execute('buy-snowman')))
  assert.equal(purchases.filter(r => r.view === 'snowman-purchased').length, 1)
  assert.ok(purchases.every(r => r.player.diamonds === 0))
  const stock = (await f.execute('craft', '100')).player.snowballs
  const attacks = await Promise.all(Array.from({ length: 110 }, () => f.execute('attack')))
  assert.equal(attacks.filter(r => r.message.startsWith('You threw')).length, 3)
  assert.equal(attacks.at(-1).shopProgress.snowmanHp, 47)
  assert.equal(attacks.at(-1).player.snowballs, stock - 3)
  assert.match((await f.execute('buy-snowman')).message, /already own/)
})

test('shop and snowman progress survive closing and reopening SQLite', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sanity-winter-shop-'))
  const file = path.join(directory, 'test.sqlite')
  let db = connection(file), now = 0, sequence = 0
  t.after(async () => { await db.close(); await rm(directory, { recursive: true, force: true }) })
  let economy = createEconomy({ sequelize: db, clock: () => now })
  const execute = (action = 'status', quantity) => economy.execute({ guildId: 'g', userId: 'p', interactionId: `disk-shop-${++sequence}`, action, quantity })
  await execute()
  now = 1000000
  await execute('craft', '10')
  for (let i = 0; i < 5; i++) await execute('attack')
  await execute('shop-help')
  now = 2000000
  await execute('beg')
  await execute('buy-snowman')
  await execute('craft', '1')
  await execute('attack')
  await execute('attack')
  await execute('attack')
  await execute('pepper')
  const before = await execute('pepper')
  await db.close()
  db = connection(file)
  economy = createEconomy({ sequelize: db, clock: () => now })
  const after = await execute('throw')
  assert.deepEqual(after.shopProgress, before.shopProgress)
  assert.equal(after.shopProgress.snowmanHp, 47)
  assert.equal(after.kitchen.peppers, 2)
  await execute('pepper')
  assert.equal((await execute('mix')).kitchen.spicyUnlocked, 1)
  assert.equal(after.shopProgress.helped, 1)
  assert.equal(after.player.diamonds, 0)
  assert.equal(after.progress.diamondsUnlocked, 1)
  assert.equal(after.tutorialGifts.diamondGift, 1)
  assert.match((await execute('beg')).message, /already have/)
  assert.ok(screen(after, 'shop').components.flatMap(r => r.toJSON().components).every(b => !b.custom_id.endsWith(':buy-snowman')))
  const composed = await execute('ingredient', 'garlic')
  await db.close()
  db = connection(file)
  economy = createEconomy({ sequelize: db, clock: () => now })
  const restored = await execute('kitchen')
  assert.deepEqual(restored.recipeDraft, composed.recipeDraft)
  assert.equal(restored.kitchen.spicyUnlocked, 1)
})

test('Discord routes shop help, exchange, purchase and snowman buttons to the correct screens', async t => {
  const db = connection(); t.after(() => db.close())
  let now = 0, sequence = 0
  const economy = createEconomy({ sequelize: db, clock: () => now })
  const handle = createHandler({ getEconomy: () => economy, authorize: () => null, environment: () => 'development' })
  const run = async (action, button = true) => {
    let payload
    await handle({ id: `shop-handler-${++sequence}`, guildId: 'g', user: { id: 'p' }, customId: `snow:p:${action}`,
      isButton: () => button, options: { getSubcommand: () => action }, deferReply: async () => {}, deferUpdate: async () => {},
      editReply: async p => { payload = p }, reply: async p => { payload = p } })
    assert.ok(payload.embeds, payload.content)
    return payload
  }
  await run('throw', false)
  now = 100000
  await run('craft:10')
  let result
  for (let i = 0; i < 5; i++) result = await run('attack')
  assert.equal(result.embeds[0].toJSON().title, 'Oh No!')
  await run('shop', false)
  result = await run('shop-help')
  assert.equal(result.embeds[0].toJSON().title, 'Congratulations!')
  result = await run('shop')
  assert.equal(result.components[0].toJSON().components[0].label, '💎 Exchange')
  now = 300000
  result = await run('diamonds:1')
  assert.equal(result.embeds[0].toJSON().title, '💎 Exchange')
  result = await run('shop')
  assert.match(result.components[0].toJSON().components[0].custom_id, /:buy-snowman$/)
  result = await run('buy-snowman')
  assert.equal(result.embeds[0].toJSON().title, 'Rough Snowman purchased! ⛄️')
  result = await run('throw', false)
  assert.match(result.embeds[0].toJSON().description, /50\/50 HP/)
})

test('Shop navigation stays hidden on every early screen until the dummy breaks', () => {
  const player = { userId: 'p', snow: 10000, snowballs: 10, diamonds: 0, tier: 0, rock: 0 }
  const buttons = payload => payload.components.flatMap(r => r.toJSON().components)
  for (const view of ['welcome', 'throw', 'help', 'status', 'shovel', 'snowballs', 'diamonds']) {
    const before = screen({ player, progress: { dummyHp: 5 } }, view, { development: true })
    assert.ok(buttons(before).every(b => !b.custom_id.endsWith(':shop')), view)
    assert.ok(before.components.every(r => r.toJSON().components.length > 0))
  }
  for (const view of ['broken', 'broken-again', 'throw', 'help', 'status', 'shovel', 'snowballs', 'diamonds']) {
    const after = screen({ player, progress: { dummyHp: 0 }, shopProgress: { snowmanOwned: 1, snowmanHp: 50 } }, view)
    assert.ok(buttons(after).some(b => b.custom_id.endsWith(':shop')), view)
  }
})

test('Beg gives exactly one free first diamond, updates wares and cannot be repeated after spending it', async t => {
  const f = await fixture(t)
  assert.match((await f.execute('beg')).message, /Ask Requia/)
  f.at(100000)
  await f.execute('craft', '10')
  for (let i = 0; i < 5; i++) await f.execute('attack')
  await f.execute('shop-help')
  const initial = await f.execute('diamonds')
  const exchange = screen(initial, 'diamonds', { development: true })
  const buttons = p => p.components.flatMap(r => r.toJSON().components)
  assert.equal(buttons(exchange)[0].label, 'Beg')
  assert.ok(buttons(exchange).every(b => !['Throw', 'Status'].includes(b.label)))
  const gifts = await Promise.all(Array.from({ length: 8 }, () => f.execute('beg')))
  assert.equal(gifts.filter(r => r.view === 'diamond-gift').length, 1)
  assert.ok(gifts.every(r => r.player.diamonds === 1 && r.player.snow === initial.player.snow))
  const gift = gifts.find(r => r.view === 'diamond-gift')
  assert.equal(gift.tutorialGifts.diamondGift, 1)
  const received = screen(gift, gift.view, { development: true })
  assert.match(received.embeds[0].toJSON().description, /Fine!.*paying full price.*business to run/)
  assert.equal(buttons(received)[0].label, 'Back to Shop')
  assert.match(received.embeds[0].toJSON().footer.text, /1💎(?: .*💦)?$/)
  assert.ok(buttons(received).every(b => b.label !== 'Throw' && b.label !== 'Beg'))
  const wares = screen(await f.execute('shop'), 'shop').embeds[0].toJSON()
  assert.equal(wares.description, '_Now you’re ready to replace that training dummy with something a bit tougher._')
  assert.equal(wares.fields[0].name, '`Rough Snowman` ⛄️')
  await f.execute('buy-snowman')
  assert.match((await f.execute('beg')).message, /already have/)
  assert.equal((await f.execute()).player.diamonds, 0)
  f.at(300000)
  const manual = await f.execute('diamonds', '1')
  assert.equal(manual.player.diamonds, 1)
  assert.equal(manual.tutorialGifts.diamondGift, 1)
  const prompt = await f.execute('restart')
  const reset = await f.execute('restart-confirm', prompt.progress.restartToken)
  assert.equal(reset.tutorialGifts.diamondGift, 0)
  assert.equal(reset.progress.diamondsUnlocked, 0)
})

test('a crafted first diamond also retires Beg, and the gift never precedes Requia help', async t => {
  const f = await fixture(t)
  f.at(10000000)
  await f.execute('diamonds', '1')
  await f.execute('craft', '10')
  for (let i = 0; i < 5; i++) await f.execute('attack')
  assert.match((await f.execute('beg')).message, /Ask Requia/)
  await f.execute('shop-help')
  assert.match((await f.execute('beg')).message, /already have/)
  const receipt = await f.execute('diamonds')
  assert.equal(receipt.player.diamonds, 1)
  assert.ok(screen(receipt, 'diamonds').components.flatMap(r => r.toJSON().components).every(b => b.label !== 'Beg' && b.label !== 'Throw'))
})

test('third successful snowman throw replaces its HP display with the Kitchen prompt', async t => {
  const f = await fixture(t)
  f.at(1000000)
  await f.execute('craft', '10')
  for (let i = 0; i < 5; i++) {
    const hit = await f.execute('attack')
    if (i === 2) assert.match(screen(hit, 'throw').embeds[0].toJSON().description, /2\/5 HP/)
  }
  await f.execute('shop-help')
  await f.execute('beg')
  await f.execute('buy-snowman')
  // Unfunded attacks are not successful throws and do not advance the tutorial.
  await f.db.query('UPDATE WinterPlayers SET snowballs=0')
  assert.match((await f.execute('attack')).message, /need a snowball/)
  await f.execute('craft', '10')
  for (let i = 1; i <= 2; i++) {
    const hit = await f.execute('attack')
    assert.match(screen(hit, 'throw').embeds[0].toJSON().description, new RegExp(`${50 - i}/50 HP`))
  }
  const third = await f.execute('attack')
  const payload = screen(third, 'throw')
  assert.equal(third.shopProgress.snowmanHp, 47)
  assert.equal(payload.embeds[0].toJSON().description, '_This is going to take forever. Let’s go to the Kitchen and create something a bit more impactful._')
  assert.doesNotMatch(payload.embeds[0].toJSON().description, /HP|🟩|⬛/)
  const reopened = createEconomy({ sequelize: f.db, clock: () => 1000000 })
  const saved = await reopened.execute({ guildId: 'guild', userId: 'player', interactionId: 'kitchen-reopen', action: 'throw' })
  assert.equal(screen(saved, 'throw').embeds[0].toJSON().description, payload.embeds[0].toJSON().description)
})

test('Discord routes Beg to the gift screen with Back to Shop as its first button', async t => {
  const f = await fixture(t)
  f.at(1000000)
  await f.execute('craft', '10')
  for (let i = 0; i < 5; i++) await f.execute('attack')
  await f.execute('shop-help')
  let payload
  const handle = createHandler({ getEconomy: () => f.economy, authorize: () => null, environment: () => 'development' })
  await handle({ id: 'discord-beg', guildId: 'guild', user: { id: 'player' }, customId: 'snow:player:beg', isButton: () => true,
    deferUpdate: async () => {}, editReply: async p => { payload = p }, reply: async p => { payload = p } })
  assert.match(payload.embeds[0].toJSON().description, /Fine!.*paying full price.*business to run/)
  assert.equal(payload.components[0].toJSON().components[0].label, 'Back to Shop')
  assert.equal(payload.components.at(-1).toJSON().components[0].label, 'Restart')
  assert.ok(payload.components.length <= 5)
})

async function kitchenFixture(t) {
  const f = await fixture(t)
  f.at(1000000)
  await f.execute('craft', '10')
  for (let i = 0; i < 5; i++) await f.execute('attack')
  await f.execute('shop-help')
  await f.execute('beg')
  await f.execute('buy-snowman')
  for (let i = 0; i < 3; i++) await f.execute('attack')
  return f
}
const allButtons = payload => payload.components.flatMap(r => r.toJSON().components)

test('rapid Rough Snowman clicks acknowledge immediately and queue safely behind a slow Discord edit', async t => {
  const f = await kitchenFixture(t)
  for (let i = 0; i < 3; i++) await f.execute('pepper')
  await f.execute('mix')
  await f.db.query('UPDATE WinterPlayers SET snowballs=10')
  const handle = createHandler({ getEconomy: () => f.economy, authorize: () => null, environment: () => 'development' })
  const acknowledged = [], delivered = [], rejected = []
  let unblock, entered
  const editing = new Promise(resolve => { entered = resolve })
  const slowEdit = new Promise(resolve => { unblock = resolve })
  const click = id => handle({ id, guildId: 'guild', user: { id: 'player' }, customId: 'snow:player:attack',
    isButton: () => true, deferUpdate: async () => { acknowledged.push(id) },
    reply: async p => { rejected.push(p) }, editReply: async p => {
      if (id === 'rough-first') { entered(); await slowEdit }
      delivered.push(p)
    } })
  const first = click('rough-first')
  await editing
  const second = click('rough-second'), third = click('rough-third')
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(acknowledged, ['rough-first', 'rough-second', 'rough-third'])
  assert.equal((await f.execute('throw')).shopProgress.snowmanHp, 46)
  unblock()
  await Promise.all([first, second, third])
  assert.deepEqual(rejected, [])
  assert.equal(delivered.length, 3)
  const final = await f.execute('throw')
  assert.equal(final.shopProgress.snowmanHp, 44)
  assert.equal(final.player.snowballs, 7)
  assert.equal(handle.live.busy.size, 0)
})

test('Kitchen gate removes throw/crafting until the three-pepper recipe is mixed', async t => {
  const f = await kitchenFixture(t)
  const prompt = await f.execute('throw')
  const buttons = allButtons(screen(prompt, 'throw', { development: true }))
  assert.deepEqual(buttons.map(b => b.label), ['Kitchen 🌶️', 'Shop', 'Restart'])
  const blocked = await f.execute('attack')
  assert.equal(blocked.player.snowballs, prompt.player.snowballs)
  assert.equal(blocked.shopProgress.snowmanHp, 47)
  assert.equal((await f.execute('craft', '1')).player.snow, prompt.player.snow)
  const first = await f.execute('kitchen')
  const initial = screen(first, 'kitchen')
  assert.equal(initial.embeds[0].toJSON().title, 'Kylax’s Kitchen 🌶️')
  assert.match(initial.embeds[0].toJSON().description, /Each recipe requires 3 to 7 \*\*Ingredients\*\*/)
  assert.equal(initial.embeds[0].toJSON().fields[0].name, 'Recipes')
  assert.equal(initial.embeds[0].toJSON().fields[0].value, '❔❔❔❔❔❔❔')
  assert.deepEqual(allButtons(initial).map(b => b.label), ['🌶️'])
  assert.equal((await f.execute('mix')).kitchen.spicyUnlocked, 0)
  for (let i = 1; i <= 3; i++) {
    const pepper = await f.execute('pepper')
    const kitchen = screen(pepper, 'kitchen')
    assert.equal(kitchen.embeds[0].toJSON().fields[0].value, '🌶️'.repeat(i) + '❔'.repeat(7 - i))
    assert.deepEqual(allButtons(kitchen).map(b => b.label), i === 3 ? ['Mix'] : ['🌶️'])
  }
  const mixed = await f.execute('mix')
  assert.equal(mixed.view, 'spicy-unlocked')
  const reward = screen(mixed, mixed.view)
  assert.equal(reward.embeds[0].toJSON().title, 'New Snowball Unlocked!')
  assert.match(reward.embeds[0].toJSON().description, /🔴 Spicy Snowball. Snowmen everywhere beware!/)
  assert.deepEqual(allButtons(reward).map(b => [b.label, b.custom_id]), [['Back to Shop', 'snow:player:shop']])
  assert.match(reward.embeds[0].toJSON().footer.text, /0🔴 · \d+💎$/)
  const returning = screen(await f.execute('kitchen'), 'kitchen')
  assert.equal(returning.embeds[0].toJSON().description, '_Welcome back._')
  assert.deepEqual(allButtons(returning).map(b => b.label), ['🌶️', '🍒', '🥑', '🧄', '🍆', 'Cancel'])
  const shop = screen(await f.execute('shop'), 'shop').embeds[0].toJSON()
  assert.equal(shop.title, 'Requia’s Winter Shop')
  assert.deepEqual(shop.fields.map(f => [f.name, f.value]), [['🔴 `Spicy Snowballs`', '**1💎**'], ['`Old Skipping Stone`', '**10💎**']])
})

test('Kitchen ingredients cap at three, concurrent mixes unlock once, early/stale actions cannot bypass discovery', async t => {
  const early = await fixture(t)
  assert.equal((await early.execute('pepper')).kitchen.peppers, 0)
  assert.equal((await early.execute('mix')).kitchen.spicyUnlocked, 0)
  assert.match((await early.execute('buy-spicy')).message, /Discover/)
  assert.match((await early.execute('buy-old-stone')).message, /Discover/)
  const f = await kitchenFixture(t)
  const peppers = await Promise.all(Array.from({ length: 10 }, () => f.execute('pepper')))
  assert.equal(peppers.at(-1).kitchen.peppers, 3)
  const mixes = await Promise.all(Array.from({ length: 10 }, () => f.execute('mix')))
  assert.equal(mixes.filter(r => r.view === 'spicy-unlocked').length, 1)
  assert.ok(mixes.every(r => r.kitchen.spicyUnlocked === 1 && r.kitchen.spicy === 0))
  assert.equal((await f.execute('pepper')).kitchen.peppers, 0)
})

test('Spicy Snowballs cost one diamond, deal ten damage, melt the snowman and reveal the one-diamond Sturdy Snowman', async t => {
  const f = await kitchenFixture(t)
  for (let i = 0; i < 3; i++) await f.execute('pepper')
  await f.execute('mix')
  assert.match((await f.execute('buy-spicy')).message, /need 1/)
  f.at(10000000)
  await f.execute('diamonds', '1')
  const before = await f.execute()
  const buys = await Promise.all(Array.from({ length: 8 }, () => f.execute('buy-spicy')))
  assert.equal(buys.filter(r => r.message.startsWith('Purchased')).length, 1)
  assert.ok(buys.every(r => r.player.diamonds === 0 && r.kitchen.spicy === 1 && r.player.snow === before.player.snow))
  const hit = await f.execute('attack-spicy', undefined, { interactionId: 'spicy-hit-retry' })
  assert.equal(hit.shopProgress.snowmanHp, 37)
  assert.equal(hit.kitchen.spicy, 0)
  assert.deepEqual(await f.execute('attack-spicy', undefined, { interactionId: 'spicy-hit-retry' }), hit)
  assert.match((await f.execute('attack-spicy')).message, /need a 🔴/)
  await f.execute('diamonds', '10')
  for (let i = 0; i < 4; i++) await f.execute('buy-spicy')
  let melted
  for (let i = 0; i < 4; i++) melted = await f.execute('attack-spicy')
  assert.equal(melted.view, 'melted')
  assert.equal(melted.shopProgress.snowmanHp, 0)
  assert.equal(melted.kitchen.spicy, 0)
  const result = screen(melted, melted.view)
  assert.equal(result.embeds[0].toJSON().description, '_Not again! You know what to do._')
  assert.equal(result.embeds[0].toJSON().thumbnail.url, 'attachment://winter-melted-snowman.png')
  assert.deepEqual(allButtons(result).map(b => b.label), ['Shop'])
  assert.equal((await f.execute('throw')).view, 'melted')
  const shop = screen(await f.execute('shop'), 'shop')
  assert.deepEqual(shop.embeds[0].toJSON().fields.find(f => f.name === '`Sturdy Snowman` ⛄️'), { name: '`Sturdy Snowman` ⛄️', value: '**1💎**', inline: true })
  assert.ok(allButtons(shop).some(b => /buy-sturdy/.test(b.custom_id)))
  assert.equal(allButtons(shop).find(b => /buy-sturdy/.test(b.custom_id)).label, 'Sturdy ⛄️ · 1💎')
  assert.equal(allButtons(shop).find(b => /buy-spicy/.test(b.custom_id)).label, 'Spicy 🔴 ×1 · 1💎')
  await f.db.query('UPDATE WinterPlayers SET diamonds=1')
  const purchased = await f.execute('buy-sturdy')
  assert.equal(purchased.player.diamonds, 0)
  assert.equal(purchased.battle.sturdyOwned, 1)
  const again = await f.execute('attack-spicy')
  assert.equal(again.kitchen.spicy, 0)
  assert.equal(again.player.snowballs, melted.player.snowballs)
})

test('Old Skipping Stone costs ten diamonds once and grants the Stone Shovel', async t => {
  const f = await kitchenFixture(t)
  for (let i = 0; i < 3; i++) await f.execute('pepper')
  await f.execute('mix')
  assert.match((await f.execute('buy-old-stone')).message, /need 10/)
  f.at(10000000)
  await f.execute('diamonds', '10')
  const before = await f.execute()
  const buys = await Promise.all(Array.from({ length: 8 }, () => f.execute('buy-old-stone')))
  assert.equal(buys.filter(r => r.view === 'stone-unlocked').length, 1)
  assert.ok(buys.every(r => r.player.diamonds === 0 && r.kitchen.oldStone === 1 && r.player.tier === 2 && r.player.rock === before.player.rock))
  const result = buys.find(r => r.view === 'stone-unlocked')
  assert.equal(screen(result, result.view).embeds[0].toJSON().title, 'New Shovel Unlocked!')
  const prompt = await f.execute('restart')
  const reset = await f.execute('restart-confirm', prompt.progress.restartToken)
  assert.deepEqual([reset.kitchen.peppers, reset.kitchen.spicyUnlocked, reset.kitchen.spicy, reset.kitchen.oldStone], [0, 0, 0, 0])
  assert.equal(reset.progress.dummyHp, 5)
  assert.equal(reset.shopProgress.snowmanHp, 50)
  assert.equal((await f.execute()).progress.dummyHp, 5)
})

test('legacy target caps reduce once, preserving damage, profile balances, ownership and completed targets', async t => {
  const db = connection(); t.after(() => db.close())
  await db.query(`CREATE TABLE WinterProgress (eventId TEXT,guildId TEXT,userId TEXT,welcomed INTEGER DEFAULT 1,snowballsUnlocked INTEGER DEFAULT 1,diamondsUnlocked INTEGER DEFAULT 1,dummyHp INTEGER DEFAULT 10,restartToken TEXT,PRIMARY KEY(eventId,guildId,userId))`)
  await db.query(`CREATE TABLE WinterShopProgress (eventId TEXT,guildId TEXT,userId TEXT,helped INTEGER DEFAULT 1,brokenSeen INTEGER DEFAULT 0,snowmanOwned INTEGER DEFAULT 1,snowmanHp INTEGER DEFAULT 100,PRIMARY KEY(eventId,guildId,userId))`)
  for (const [user, dummy, snowman] of [['dummy', 9, 100], ['snowman', 0, 97], ['done', 0, 0]]) {
    await db.query('INSERT INTO WinterProgress(eventId,guildId,userId,dummyHp) VALUES ($event,$guild,$user,$hp)', { bind: { event: 'winter-2026', guild: 'g', user, hp: dummy } })
    await db.query('INSERT INTO WinterShopProgress(eventId,guildId,userId,snowmanHp) VALUES ($event,$guild,$user,$hp)', { bind: { event: 'winter-2026', guild: 'g', user, hp: snowman } })
  }
  const e = createEconomy({ sequelize: db, clock: () => 0 })
  let id = 0
  const run = userId => e.execute({ guildId: 'g', userId, interactionId: `legacy-${++id}` })
  assert.equal((await run('dummy')).progress.dummyHp, 4)
  assert.equal((await run('snowman')).shopProgress.snowmanHp, 47)
  assert.equal((await run('done')).shopProgress.snowmanHp, 0)
  const again = await run('snowman')
  assert.equal(again.shopProgress.snowmanHp, 47)
  assert.equal(again.player.snow, 10)
  assert.equal(again.shopProgress.snowmanOwned, 1)
  assert.equal(again.tutorialGifts.diamondGift, 0)
})

test('Discord Kitchen, Mix, new wares and spicy throw routes preserve screen flow and component limits', async t => {
  const f = await kitchenFixture(t)
  let sequence = 0
  const handle = createHandler({ getEconomy: () => f.economy, authorize: () => null, environment: () => 'development' })
  const run = async action => {
    let payload
    await handle({ id: `kitchen-ui-${++sequence}`, guildId: 'guild', user: { id: 'player' }, customId: `snow:player:${action}`,
      isButton: () => true, deferUpdate: async () => {}, editReply: async p => { payload = p }, reply: async p => { payload = p } })
    assert.ok(payload.embeds, payload.content)
    assert.ok(payload.components.length <= 5)
    assert.ok(payload.components.every(r => r.toJSON().components.length > 0 && r.toJSON().components.length <= 5))
    assert.ok(allButtons(payload).every(b => b.custom_id.length <= 100))
    assert.equal(allButtons(payload).at(-1).label, 'Restart')
    return payload
  }
  const intro = await run('kitchen')
  assert.equal(intro.embeds[0].toJSON().title, 'Kylax’s Kitchen 🌶️')
  for (let i = 0; i < 3; i++) await run('pepper')
  const unlocked = await run('mix')
  assert.equal(unlocked.embeds[0].toJSON().title, 'New Snowball Unlocked!')
  assert.equal(allButtons(unlocked)[0].label, 'Back to Shop')
  const kitchen = await run('kitchen')
  assert.equal(allButtons(kitchen)[0].label, '🌶️')
  const shop = await run('shop')
  assert.equal(shop.embeds[0].toJSON().title, 'Requia’s Winter Shop')
  f.at(10000000)
  await f.execute('diamonds', '10')
  await f.execute('diamonds', '10')
  await run('buy-spicy')
  const hit = await run('attack-spicy')
  assert.match(hit.embeds[0].toJSON().description, /37\/50 HP/)
  assert.match(hit.embeds[0].toJSON().footer.text, /0🔴 · \d+💎$/)
  const stone = await run('buy-old-stone')
  assert.equal(stone.embeds[0].toJSON().title, 'New Shovel Unlocked!')
})

test('returning Kitchen lists ten recipes and shuffles five ingredients while retaining a seven-slot draft', async t => {
  const f = await kitchenFixture(t)
  for (let i = 0; i < 3; i++) await f.execute('pepper')
  await f.execute('mix')
  const initial = await f.execute('kitchen')
  const opening = screen(initial, 'kitchen', { development: true })
  const fields = opening.embeds[0].toJSON().fields
  assert.equal(opening.embeds[0].toJSON().description, '_Welcome back._')
  assert.equal(fields[0].name, 'Recipes')
  assert.equal(fields[0].value.split('\n').length, 10)
  assert.equal(fields[0].value.split('\n')[0], '1. 🌶️🌶️🌶️')
  assert.ok(fields[0].value.split('\n').slice(1).every(line => line.endsWith('❔❔❔❔❔❔❔')))
  assert.deepEqual(fields[1], { name: 'Enter Recipe:', value: '❔❔❔❔❔❔❔' })
  assert.equal(allButtons(opening).filter(b => b.custom_id.includes(':ingredient:')).length, 5)
  assert.deepEqual(opening.components[1].toJSON().components.map(b => [b.label, b.style]), [['Cancel', 4]])
  let previous = initial.recipeDraft.ingredientOrder, receipt
  const selected = ['cherry', 'avocado', 'garlic', 'eggplant', 'pepper', 'cherry', 'avocado']
  for (let i = 0; i < selected.length; i++) {
    receipt = await f.execute('ingredient', selected[i])
    assert.deepEqual(receipt.recipeDraft.ingredients, selected.slice(0, i + 1))
    assert.notDeepEqual(receipt.recipeDraft.ingredientOrder, previous)
    assert.deepEqual([...receipt.recipeDraft.ingredientOrder].sort(), ['avocado', 'cherry', 'eggplant', 'garlic', 'pepper'])
    previous = receipt.recipeDraft.ingredientOrder
    const payload = screen(receipt, 'kitchen', { development: true })
    assert.ok(payload.components.length <= 5)
    assert.deepEqual(payload.components[1].toJSON().components.map(b => [b.label, b.style]), i < 2 ? [['Cancel', 4]] : [['Mix', 3], ['Cancel', 4]])
  }
  assert.ok(screen(receipt, 'kitchen').components[0].toJSON().components.every(b => b.disabled))
  const full = await f.execute('ingredient', 'pepper')
  assert.equal(full.recipeDraft.ingredients.length, 7)
  assert.match(full.message, /at most seven/)
  const mixed = await f.execute('mix')
  assert.match(mixed.message, /did not unlock/)
  assert.deepEqual(mixed.recipeDraft.ingredients, [])
  assert.equal(mixed.kitchen.spicyUnlocked, 1)
  assert.equal(mixed.kitchen.spicy, 0)
})

test('recipe drafts dedupe clicks, mix known recipes without duplicate rewards, cancel and restart safely', async t => {
  const f = await kitchenFixture(t)
  for (let i = 0; i < 3; i++) await f.execute('pepper')
  await f.execute('mix')
  const first = await f.execute('ingredient', 'pepper', { interactionId: 'same-ingredient' })
  const retry = await f.execute('ingredient', 'pepper', { interactionId: 'same-ingredient' })
  assert.deepEqual(retry, first)
  assert.equal((await f.execute('mix')).recipeDraft.ingredients.length, 1)
  await f.execute('ingredient', 'pepper')
  await f.execute('ingredient', 'pepper')
  const known = await f.execute('mix')
  assert.match(known.message, /already know/)
  assert.deepEqual(known.recipeDraft.ingredients, [])
  assert.equal(known.kitchen.spicy, 0)
  await f.execute('ingredient', 'eggplant')
  const cancelled = await f.execute('recipe-cancel')
  assert.equal(cancelled.view, 'kitchen')
  assert.deepEqual(cancelled.recipeDraft.ingredients, [])
  assert.equal(cancelled.kitchen.spicyUnlocked, 1)
  assert.equal(cancelled.player.snow, known.player.snow)
  const concurrent = await Promise.all(Array.from({ length: 12 }, () => f.execute('ingredient', 'cherry')))
  assert.equal(concurrent.at(-1).recipeDraft.ingredients.length, 7)
  await assert.rejects(f.execute('ingredient', 'invalid'), /quantity/)
  const prompt = await f.execute('restart')
  const reset = await f.execute('restart-confirm', prompt.progress.restartToken)
  assert.deepEqual(reset.recipeDraft.ingredients, [])
  assert.equal(reset.kitchen.spicyUnlocked, 0)
})

test('shuffle matches Arena Fisher-Yates and guarantees a changed control order', () => {
  const { IDS, shuffleIngredients } = require('../services/winter/recipes')
  const draws = []
  const shuffled = shuffleIngredients(IDS, bound => { draws.push(bound); return bound - 1 })
  assert.deepEqual(draws, [5, 4, 3, 2])
  assert.notDeepEqual(shuffled, IDS)
  assert.deepEqual(shuffled.slice().sort(), IDS.slice().sort())
})

test('Discord returning Kitchen handles all ingredients and cancellation without exposing another player draft', async t => {
  const f = await kitchenFixture(t)
  for (let i = 0; i < 3; i++) await f.execute('pepper')
  await f.execute('mix')
  let serial = 0, payload
  const handle = createHandler({ getEconomy: () => f.economy, authorize: () => null, environment: () => 'development' })
  const run = async (action, userId = 'player') => {
    await handle({ id: `returning-ui-${++serial}`, guildId: 'guild', user: { id: userId }, customId: `snow:player:${action}`,
      isButton: () => true, deferUpdate: async () => {}, editReply: async p => { payload = p }, reply: async p => { payload = p } })
    return payload
  }
  await run('ingredient:garlic')
  assert.equal(payload.embeds[0].toJSON().fields[1].value, '🧄❔❔❔❔❔❔')
  await run('ingredient:cherry')
  await run('ingredient:avocado')
  assert.deepEqual(payload.components[1].toJSON().components.map(b => b.label), ['Mix', 'Cancel'])
  await run('recipe-cancel')
  assert.equal(payload.embeds[0].toJSON().title, 'Kylax’s Kitchen 🌶️')
  await run('kitchen')
  assert.equal(payload.embeds[0].toJSON().fields[1].value, '❔❔❔❔❔❔❔')
  await run('ingredient:eggplant', 'someone-else')
  assert.match(payload.content, /another player/)
  await run('ingredient:invalid')
  assert.match(payload.content, /Invalid recipe/)
})

test('Stone Shovel switches to 36 per second after old-rate accrual, including earlier unlock-only purchases', async t => {
  const f = await kitchenFixture(t)
  for(let i=0;i<3;i++)await f.execute('pepper')
  await f.execute('mix')
  f.at(10000500)
  await f.execute('diamonds','10')
  const before=await f.execute()
  const bought=await f.execute('buy-old-stone')
  assert.equal(bought.player.tier,2)
  assert.equal(bought.player.snow,before.player.snow)
  f.advance(1000)
  assert.equal((await f.execute()).player.snow,bought.player.snow+36)
  await f.db.query('UPDATE WinterPlayers SET tier=1')
  const anchor=await f.execute()
  assert.equal(anchor.player.tier,2)
  await f.db.query('UPDATE WinterPlayers SET tier=1')
  f.advance(500)
  const honored=await f.execute()
  assert.equal(honored.player.snow,anchor.player.snow+3)
  assert.equal(honored.player.diamonds,anchor.player.diamonds)
  assert.equal(honored.player.tier,2)
  f.advance(1000)
  assert.equal((await f.execute()).player.snow,honored.player.snow+36)
})

test('accuracy, enemy attacks and Sweat begin only with Sturdy combat; its footer transition persists', async t => {
  const f = await fixture(t)
  let now = 1000000, id = 0
  const economy = createEconomy({ sequelize:f.db,clock:()=>now,allowRestart:true,random:()=>{throw Error('Tutorial must never roll accuracy')} })
  const run=(action='status',quantity)=>economy.execute({guildId:'guild',userId:'player',interactionId:`boundary-${++id}`,action,quantity})
  await run('craft','10')
  for(let i=0;i<5;i++){
    const hit=await run('attack')
    assert.equal(hit.progress.dummyHp,4-i)
    assert.equal(hit.battle.sweat,0)
    assert.equal(hit.battle.enemyAttacks,0)
    assert.doesNotMatch(screen(hit,hit.view||'throw').embeds[0].toJSON().footer.text,/💦/)
  }
  await run('shop-help');await run('beg');await run('buy-snowman')
  for(let i=0;i<3;i++)await run('attack')
  for(let i=0;i<3;i++)await run('pepper')
  await run('mix')
  now=10000000
  await run('diamonds','10');await run('diamonds','10')
  for(let i=0;i<5;i++)await run('buy-spicy')
  const spicy=await run('attack-spicy')
  assert.equal(spicy.shopProgress.snowmanHp,37)
  assert.equal(spicy.battle.sweat,0)
  assert.equal(spicy.battle.enemyAttacks,0)
  for(let i=0;i<4;i++)await run('attack-spicy')
  const bought=await run('buy-sturdy')
  const before=screen(bought,bought.view).embeds[0].toJSON().footer.text
  assert.match(before,/⚪️/)
  assert.doesNotMatch(before,/💦/)
  // Historical pre-fight Sweat flags must not prematurely expose the currency.
  const legacy={...bought,battle:{...bought.battle,sweat:99,sweatUnlocked:1}}
  assert.doesNotMatch(screen(legacy,'status').embeds[0].toJSON().footer.text,/💦/)
  const started=await run('battle-start',bought.battle.fightId)
  assert.equal(started.battle.sweat,0)
  for(const view of ['fight','shop','kitchen','status','train']){
    const footer=screen(started,view).embeds[0].toJSON().footer.text
    assert.doesNotMatch(footer,/⚪️/)
    assert.match(footer,/🔴/)
    assert.match(footer,/\d+💎 · 0💦$/)
  }
  const paused=await run('battle-pause',started.battle.fightId)
  assert.doesNotMatch(screen(paused,'opponents').embeds[0].toJSON().footer.text,/⚪️/)
  const prompt=await run('restart')
  const reset=await run('restart-confirm',prompt.progress.restartToken)
  assert.equal(reset.battle.idleStarted,0)
  assert.doesNotMatch(screen(reset,'welcome').embeds[0].toJSON().footer.text,/💦/)
})
