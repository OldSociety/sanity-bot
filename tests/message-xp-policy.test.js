const test = require('node:test'), assert = require('node:assert/strict'), Sequelize = require('sequelize')
async function fixture(t, dependencies = {}) {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }); t.after(() => db.close())
  const User = require('../Models/User/User')(db, Sequelize.DataTypes); await User.sync()
  const keys = ['GUILDID','SPOOKYCHANNELID'], saved = keys.map(key => process.env[key])
  process.env.GUILDID = 'guild'; process.env.SPOOKYCHANNELID = 'spooky'
  t.after(() => keys.forEach((key, i) => saved[i] === undefined ? delete process.env[key] : process.env[key] = saved[i]))
  let handler; const cursed = []
  const client = { user: { id: 'bot' }, on: (_name, callback) => { handler = callback } }
  require('../handlers/messageHandler')(client, User, { detectHaiku: async () => null,
    handleSpooky: async message => cursed.push(message.id), random: () => 0, clock: () => new Date('2026-10-02T12:00:00Z'), ...dependencies })
  const message = { id: 'message', guild: { id: 'guild' }, channelId: 'chat', channel: { send: async () => {} },
    author: { id: 'alice', username: 'Alice', bot: false }, member: { roles: { cache: { has: () => false } } },
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

test('community launch preserves personal XP but replaces personal Fate; pipeline failure does not block seasonal processing', async t => {
  let messages = 0
  const f = await fixture(t, { communityConfig: () => ({ enabled: true, guildId: 'guild' }),
    handleCommunity: async () => { messages++; throw new Error('Community test unavailable') }, badgeField: async () => ({ name: 'Badges', value: 'None' }) })
  await f.User.create({ user_id: 'alice', user_name: 'Alice', chat_exp: 150, fate_points: 98, bank: 63 })
  await f.run({ member: { roles: { cache: { has: () => true } } } })
  const user = await f.User.findByPk('alice')
  assert.equal(user.chat_level, 2); assert.equal(user.fate_points, 98); assert.equal(user.bank, 63)
  assert.equal(messages, 1); assert.deepEqual(f.cursed, ['message'])
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
