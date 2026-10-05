const test = require('node:test'), assert = require('node:assert/strict')
const { nudge, nudgeChat } = require('../services/sanity-reminder')
test('reminders stay private, actor-scoped and excluded from birthday/level test previews', async t => {
  const prior = { NODE_ENV: process.env.NODE_ENV, GUILDID: process.env.GUILDID }
  t.after(() => { for (const [key, value] of Object.entries(prior)) value === undefined ? delete process.env[key] : process.env[key] = value })
  process.env.NODE_ENV = 'development'; process.env.GUILDID = 'guild'
  let claims = 0
  const messages = [], interaction = { guildId: 'guild', user: { id: 'alice', bot: false }, commandName: 'profile',
    options: { getSubcommand: () => 'birthday' }, deferred: true, followUp: async value => messages.push(value) }
  const service = { claimReminder: async (guild, user) => { claims++; assert.equal(user, 'alice'); return { balance: 24, band: 'waning' } } }
  assert.equal(await nudge(interaction, {}, service), null); assert.equal(claims, 0)
  interaction.options.getSubcommand = () => 'view'
  assert.equal(await nudge(interaction, {}, service), null)
  const message = { guild: { id: 'guild' }, createdTimestamp: Date.now(), author: { id: 'alice', send: async value => messages.push(value) } }
  await nudgeChat(message, service)
  assert.deepEqual(messages[0].allowedMentions, { parse: [] })
  assert.match(messages[0].embeds[0].description, /24\/100/)
  interaction.user.bot = true
  assert.equal(await nudge(interaction, {}, service), null); assert.equal(claims, 1)
})
test('chat DM failure never attempts a public fallback', async t => {
  const prior = process.env.GUILDID; t.after(() => prior === undefined ? delete process.env.GUILDID : process.env.GUILDID = prior)
  process.env.GUILDID = 'guild'
  const message = { guild: { id: 'guild' }, createdTimestamp: Date.now(), author: { id: 'alice', send: async () => { throw Error('closed DM') } } }
  await assert.rejects(nudgeChat(message, { claimReminder: async () => ({ balance: 69, band: 'fading' }) }), /closed DM/)
})
test('maintenance creates no scheduler or storage service in test environment', t => {
  const prior = process.env.NODE_ENV; t.after(() => prior === undefined ? delete process.env.NODE_ENV : process.env.NODE_ENV = prior)
  process.env.NODE_ENV = 'test'
  assert.equal(typeof require('../services/sanity-maintenance').start({}, {}), 'function')
})
