const test = require('node:test'), assert = require('node:assert/strict'), Sequelize = require('sequelize')
async function fixture(t, dependencies = {}) {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }); t.after(() => db.close())
  const User = require('../Models/User/User')(db, Sequelize.DataTypes); await User.sync()
  const keys = ['GUILDID','SPOOKYCHANNELID','UNWANTEDROLEID','BOOSTERROLEID'], saved = keys.map(key => process.env[key])
  process.env.GUILDID = 'guild'; process.env.SPOOKYCHANNELID = 'spooky'
  process.env.UNWANTEDROLEID = 'unwanted'; process.env.BOOSTERROLEID = 'booster'
  t.after(() => keys.forEach((key, i) => saved[i] === undefined ? delete process.env[key] : process.env[key] = saved[i]))
  let handler; const cursed = []
  const client = { user: { id: 'bot' }, on: (_name, callback) => { handler = callback } }
  require('../handlers/messageHandler')(client, User, { detectHaiku: async () => null,
    handleSpooky: async message => cursed.push(message.id), profileNotification: async () => null,
    random: () => 0, clock: () => new Date('2026-10-02T12:00:00Z'), qualifiesPersonalXp: () => true, ...dependencies })
  const message = { id: 'message', guild: { id: 'guild' }, channelId: 'chat', channel: { send: async () => {} },
    author: { id: 'alice', username: 'Alice', bot: false, displayAvatarURL: () => 'https://example.com/avatar.png' }, member: { roles: { cache: { has: () => false } } },
    content: 'Some ordinary conversation', mentions: { has: () => false } }
  return { User, message, cursed, run: overrides => handler({ ...message, ...overrides }) }
}
test('Spooky channel and threads award no XP/Fate while cursed messages still run', async t => {
  const f = await fixture(t)
  await f.User.create({ user_id: 'alice', user_name: 'Alice', chat_exp: 150, bank: 17, fate_points: 30 })
  const before = (await f.User.findByPk('alice')).get({ plain: true })
  await f.run({ id: 'spooky-chat', channelId: 'spooky' })
  await f.run({ id: 'spooky-thread', channelId: 'thread', channel: { parentId: 'spooky' } })
  assert.deepEqual((await f.User.findByPk('alice')).get({ plain: true }), before)
  assert.deepEqual(f.cursed, ['spooky-chat','spooky-thread'])
})

test('guild owner earns no chat XP, Fate or level-up notification while seasonal processing continues', async t => {
  let cards = 0
  const sent = []
  const f = await fixture(t, { handleCommunity: async () => null,
    profileNotification: async () => { cards++; return null } })
  await f.User.create({ user_id: 'alice', user_name: 'Alice', chat_exp: 150, fate_points: 30, bank: 17 })
  const before = (await f.User.findByPk('alice')).get({ plain: true })
  await f.run({ guild: { id: 'guild', ownerId: 'alice' },
    member: { roles: { cache: new Map([['unwanted', { name: 'Unwanted' }], ['admin', { name: 'Admin' }]]) } },
    channel: { send: async payload => sent.push(payload) } })
  assert.deepEqual((await f.User.findByPk('alice')).get({ plain: true }), before)
  assert.equal(cards, 0); assert.deepEqual(sent, [])
  assert.deepEqual(f.cursed, ['message'])
})

test('owner chat creates no XP account; ownership transfer changes eligibility without hardcoded player IDs', async t => {
  const f = await fixture(t, { handleCommunity: async () => null })
  await f.run({ guild: { id: 'guild', ownerId: 'alice' } })
  assert.equal(await f.User.count(), 0)
  await f.User.create({ user_id: 'alice', user_name: 'Alice', chat_exp: 0 })
  await f.run({ guild: { id: 'guild', ownerId: 'bob' } })
  assert.equal((await f.User.findByPk('alice')).chat_exp, 10)
  await f.run({ guild: { id: 'guild', ownerId: 'bob' }, author: { id: 'bob', username: 'Bob', bot: false } })
  assert.equal(await f.User.findByPk('bob'), null)
  assert.deepEqual(f.cursed, ['message', 'message', 'message'])
})

test('community pipeline failure preserves personal XP and capped Fate rewards and seasonal processing', async t => {
  let messages = 0
  const f = await fixture(t, { communityConfig: () => ({ enabled: true, guildId: 'guild' }),
    handleCommunity: async () => { messages++; throw new Error('Community test unavailable') }, badgeField: async () => ({ name: 'Badges', value: 'None' }) })
  await f.User.create({ user_id: 'alice', user_name: 'Alice', chat_exp: 150, fate_points: 98, bank: 63 })
  await f.run({ member: { roles: { cache: { has: id => id === 'unwanted' } } } })
  const user = await f.User.findByPk('alice')
  assert.equal(user.chat_level, 2); assert.equal(user.fate_points, 100); assert.equal(user.bank, 63)
  assert.equal(messages, 1); assert.deepEqual(f.cursed, ['message'])
})

test('one qualifying chat can award both personal and communal level-up Fate without overwriting either', async t => {
  let community, messageId = 0
  const f = await fixture(t, { handleCommunity: message => community.earn({ guildId: 'guild', userId: message.author.id,
    messageId: `community-${messageId++}`, now: new Date('2026-10-02T12:00:00Z') }),
    badgeField: async () => ({ name: 'Badges', value: 'None' }) })
  const db = f.User.sequelize
  await require('../migrations/community-leveling').up(db.getQueryInterface())
  const models = require('../services/community-leveling/models').defineModels(db)
  community = require('../services/community-leveling/economy').createCommunity({ User: f.User, models,
    config: { enabled: true, guildId: 'guild', timezone: 'America/Los_Angeles' },
    resolveRecipients: async () => [{ userId: 'alice', userName: 'Alice' }] })
  await models.Guild.create({ guildId: 'guild', xp: 299 })
  await f.User.create({ user_id: 'alice', user_name: 'Alice', chat_exp: 150, fate_points: 90, bank: 63 })
  await f.run({ member: { roles: { cache: { has: id => id === 'unwanted' } } } })
  const user = await f.User.findByPk('alice'), guild = await models.Guild.findByPk('guild')
  assert.equal(user.chat_level, 2); assert.equal(user.fate_points, 100); assert.equal(user.bank, 63)
  assert.equal(guild.level, 2); assert.equal(guild.xp, 0)
  assert.equal((await models.Receipt.findOne({ where: { guildId: 'guild', messageId: 'community-0' } })).result.rewards[0].credited, 5)
})
test('slash commands, interaction messages and bot/webhook output cannot award message XP anywhere', async t => {
  const f = await fixture(t)
  for (const override of [{ content: '/spooky treat' }, { content: '  /some-other-bot play' },
    { type: 20 }, { type: 23 }, { interactionMetadata: { id: 'command' } }, { interaction: { id: 'legacy' } },
    { webhookId: 'webhook' }, { author: { id: 'other-bot', bot: true } }]) await f.run(override)
  assert.equal(await f.User.count(), 0); assert.deepEqual(f.cursed, [])
})
test('ordinary chat outside Spooky keeps legacy XP and selected-guild isolation', async t => {
  const f = await fixture(t)
  await f.User.create({ user_id: 'alice', user_name: 'Alice', chat_exp: 0 })
  await f.run({}); assert.equal((await f.User.findByPk('alice')).chat_exp, 10)
  await f.run({ guild: { id: 'other-guild' }, channelId: 'spooky', author: { id: 'bob', username: 'Bob', bot: false } })
  assert.equal((await f.User.findByPk('bob')).chat_exp, 4) // Legacy first-chat seed.
})

test('Bots-role members earn no personal XP/Fate in production, while development permits test members', async t => {
  const original = process.env.NODE_ENV
  t.after(() => { process.env.NODE_ENV = original })
  const f = await fixture(t, { badgeField: async () => ({ name: 'Badges', value: 'None' }) })
  await f.User.create({ user_id: 'alice', user_name: 'Alice', chat_exp: 150, fate_points: 40 })
  const member = { roles: { cache: new Map([['unwanted', { name: 'Unwanted' }], ['bots', { name: 'Bots' }]]) } }
  process.env.NODE_ENV = 'production'
  await f.run({ member })
  assert.equal((await f.User.findByPk('alice')).chat_exp, 150)
  assert.equal((await f.User.findByPk('alice')).fate_points, 40)
  process.env.NODE_ENV = 'development'
  await f.run({ member })
  assert.equal((await f.User.findByPk('alice')).chat_level, 2)
  assert.equal((await f.User.findByPk('alice')).fate_points, 45)
})

test('personal channel restriction blocks XP and user creation without blocking seasonal processing or consuming cooldown', async t => {
  const source = { environments: { test: { guildId: 'guild', channelIds: ['table', 'forum', 'hell'] } } }
  const f = await fixture(t, { qualifiesPersonalXp: message => require('../services/personal-xp-channels').qualifiesPersonalXp(message, { environment: 'test', source }) })
  await f.run({ channelId: 'party', channel: { type: 0 } })
  assert.equal(await f.User.count(), 0)
  await f.User.create({ user_id: 'alice', user_name: 'Alice', chat_exp: 0 })
  await f.run({ channelId: 'private', channel: { type: 12, parentId: 'forum' } })
  assert.equal((await f.User.findByPk('alice')).last_chat_message, null)
  await f.run({ channelId: 'forum-post', channel: { type: 11, parentId: 'forum' } })
  assert.equal((await f.User.findByPk('alice')).chat_exp, 10)
  assert.equal(f.cursed.length, 3)
})

test('production chat level-up sends the designed PNG with the committed level and reward balances', async t => {
  const environment = process.env.NODE_ENV
  t.after(() => { process.env.NODE_ENV = environment })
  let notify, captured
  const sent = []
  const f = await fixture(t, { handleCommunity: async () => null,
    profileNotification: request => notify({ ...request, sanity: null }),
    badgeField: async () => ({ name: 'Badges', value: 'None' }) })
  process.env.NODE_ENV = 'production'
  notify = require('../services/profile-notification').createProfileNotification({ User: f.User,
    environment: 'production', guildId: 'guild', badgeService: { details: async () => [] },
    download: async () => null, render: async input => {
      captured = input
      return require('../services/profile-card').renderProfileCard(input)
    } })
  await f.User.create({ user_id: 'alice', user_name: 'Alice', chat_exp: 150, fate_points: 5, bank: 17 })
  await f.run({ channel: { send: async payload => sent.push(payload) },
    member: { id: 'alice', displayName: 'Alice', user: { username: 'alice' }, displayAvatarURL: () => null,
      roles: { cache: new Map([['unwanted', { name: 'Unwanted' }]]) } } })
  assert.equal(sent.length, 1)
  assert.equal(sent[0].files[0].name, 'profile-level-up.png')
  assert.equal(sent[0].embeds, undefined)
  assert.deepEqual(sent[0].allowedMentions, { parse: [] })
  const metadata = await require('sharp')(sent[0].files[0].attachment).metadata()
  assert.equal(metadata.width, 1200); assert.equal(metadata.height, 480)
  assert.equal(captured.occasion, 'level-up')
  assert.equal(captured.before.chat_level, 1); assert.equal(captured.user.chat_level, 2)
  assert.equal(captured.before.fate_points, 5); assert.equal(captured.user.fate_points, 10)
  assert.equal(captured.user.bank, 17)
  const saved = await f.User.findByPk('alice')
  assert.equal(saved.chat_level, 2); assert.equal(saved.fate_points, 10); assert.equal(saved.bank, 17)
  assert.deepEqual(f.cursed, ['message'])
})

test('a failed level-up render retains the awarded level and sends the fallback once', async t => {
  const sent = []
  const f = await fixture(t, { handleCommunity: async () => null,
    profileNotification: async () => { throw new Error('Synthetic render failure') },
    badgeField: async () => ({ name: 'Badges', value: 'None' }) })
  await f.User.create({ user_id: 'alice', user_name: 'Alice', chat_exp: 150, fate_points: 5 })
  await f.run({ channel: { send: async payload => sent.push(payload) },
    member: { roles: { cache: new Map([['unwanted', { name: 'Unwanted' }]]) } } })
  assert.equal(sent.length, 1); assert.equal(sent[0].embeds[0].data.title, 'Level Up!')
  const saved = await f.User.findByPk('alice')
  assert.equal(saved.chat_level, 2); assert.equal(saved.fate_points, 10)
  assert.deepEqual(f.cursed, ['message'])
})
