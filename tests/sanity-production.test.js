const test = require('node:test'), assert = require('node:assert/strict')
const { Sequelize } = require('sequelize')
test('production chat earns Sanity without activating Community XP and excludes Bots-role members', async t => {
  const prior = { NODE_ENV: process.env.NODE_ENV, GUILDID: process.env.GUILDID }
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(async () => { await db.close(); for (const [key, value] of Object.entries(prior)) value === undefined ? delete process.env[key] : process.env[key] = value })
  process.env.NODE_ENV = 'production'
  const config = require('../services/community-leveling/config').selectConfig()
  process.env.GUILDID = config.guildId
  assert.equal(config.enabled, false)
  await require('../migrations/sanity').up(db.getQueryInterface())
  await require('../migrations/sanity-daily').up(db.getQueryInterface())
  const User = { sequelize: db }, sanity = require('../services/sanity'), service = sanity.runtime(User)
  const now = Date.now(), message = { id: 'first', guild: { id: config.guildId }, author: { id: 'player', bot: false, send: async () => { throw Error('Unexpected reminder at full Sanity') } },
    member: { user: { bot: false }, roles: { cache: new Map() } }, content: 'Hello everyone', channelId: config.channelIds[0], channel: { type: 0 }, createdTimestamp: now }
  assert.equal((await sanity.handleMessage(message, User)).after, 100)
  assert.equal((await sanity.handleMessage(message, User)).replayed, true)
  message.member.roles.cache.set('bots', { name: 'Bots' }); message.author.id = 'excluded'; message.id = 'excluded'
  assert.equal(await sanity.handleMessage(message, User), null)
  assert.equal(await service.models.Account.count(), 1)
  const tables = await db.getQueryInterface().showAllTables()
  assert.equal(tables.some(name => name.startsWith('Community')), false)
  const stop = require('../services/sanity-maintenance').start({}, User)
  await stop()
})
