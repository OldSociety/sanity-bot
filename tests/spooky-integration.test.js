const test = require('node:test')
const assert = require('node:assert/strict')
const Sequelize = require('sequelize')
const defineUser = require('../Models/User/User')
const migration = require('../migrations/20261001000000-create-spooky-core')
const notifyMigration = require('../migrations/20261001000002-create-spooky-notifications')
const { defineSpookyModels } = require('../services/spooky/models')
const { createEconomy } = require('../services/spooky/economy')
const { createNotifications } = require('../services/spooky/notifications')
const { saveWallet, awardLevelUp, creditBank } = require('../services/fate-wallet')
const { snapshotMembers, deliverCursedMessage } = require('../services/spooky/runtime')
const liveCommand = require('../commands/Holiday/TrickorTreat')

async function fixture(t) {
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => sequelize.close())
  const User = defineUser(sequelize, Sequelize.DataTypes); await User.sync()
  await migration.up(sequelize.getQueryInterface()); await notifyMigration.up(sequelize.getQueryInterface())
  const models = defineSpookyModels(sequelize), economy = createEconomy({ sequelize, models })
  const notifications = createNotifications({ models })
  const run = (key, callback) => economy.execute({ eventId: 'spooky-2026', guildId: 'guild', actorId: 'alice', interactionId: key, operationType: 'test' }, callback)
  return { sequelize, User, models, notifications, run }
}
test('stale legacy fate mutation cannot overwrite a completed bank debit; fresh retry succeeds', async t => {
  const f = await fixture(t)
  await f.User.create({ user_id: 'alice', user_name: 'Alice', bank: 20, fate_points: 50 })
  const stale = await f.User.findByPk('alice')
  await f.User.update({ bank: 10 }, { where: { user_id: 'alice' } })
  stale.fate_points += 5
  await assert.rejects(() => saveWallet(f.User, stale), /balance changed/)
  assert.equal((await f.User.findByPk('alice')).bank, 10)
  const fresh = await f.User.findByPk('alice'); fresh.fate_points += 5
  await saveWallet(f.User, fresh)
  assert.equal((await f.User.findByPk('alice')).fate_points, 55)
})
test('level-up overflow credits current bank atomically and preserves purchase debit', async t => {
  const f = await fixture(t)
  await f.User.create({ user_id: 'alice', user_name: 'Alice', bank: 20, fate_points: 99 })
  await f.User.update({ bank: 10 }, { where: { user_id: 'alice' } })
  const updated = await awardLevelUp(f.User, 'alice', { chat_level: 2 }, { unwanted: true, booster: true })
  assert.equal(updated.bank, 14); assert.equal(updated.fate_points, 100)
  const capped = await awardLevelUp(f.User, 'alice', { chat_level: 3 }, { unwanted: true, booster: false })
  assert.equal(capped.bank, 14)
})
test('notification enqueue is atomic; persistent sent state prevents delayed duplicate send after reconstruction', async t => {
  const f = await fixture(t)
  await assert.rejects(() => f.run('fail', async ctx => {
    await f.notifications.enqueue(ctx, 'channel', [{ public: true, payload: { content: 'reward' } }]); throw new Error('rollback')
  }), /rollback/)
  assert.equal(await f.models.Notification.count(), 0)
  const result = await f.run('ok', async ctx => { await f.notifications.enqueue(ctx, 'channel', [{ public: true, payload: { content: 'reward' } }]); return {} })
  let sends = 0
  const channel = { id: 'channel', send: async payload => { sends++; assert.ok(payload.nonce.length <= 25); return { id: 'public-message' } } }
  await f.notifications.deliver(result.operationId, channel)
  await createNotifications({ models: f.models }).deliver(result.operationId, channel)
  assert.equal(sends, 1)
  assert.equal((await f.models.Notification.findOne()).messageId, 'public-message')
})
test('ambiguous notification failure stays uncertain and is not resent automatically', async t => {
  const f = await fixture(t)
  const result = await f.run('uncertain', async ctx => { await f.notifications.enqueue(ctx, 'channel', [{ public: true, payload: {} }]); return {} })
  let sends = 0
  const channel = { id: 'channel', send: async () => { sends++; throw new Error('network timeout') } }
  await assert.rejects(() => f.notifications.deliver(result.operationId, channel), /timeout/)
  assert.equal((await f.models.Notification.findOne()).status, 'uncertain')
  await assert.rejects(() => f.notifications.deliver(result.operationId, channel), /inspection/)
  assert.equal(sends, 1)
})

test('cancelled or missing cursed replacement retains the original; confirmed delivery permits deletion', async () => {
  let deleted = 0, allSent = false
  const service = { notifications: { deliver: async () => ({ allSent }) } }
  const result = { receipt: { transformed: true }, operationId: 'replacement' }
  const message = { channel: {}, delete: async () => { deleted++ } }
  await deliverCursedMessage(service, result, message)
  assert.equal(deleted, 0)
  allSent = true
  await deliverCursedMessage(service, result, message)
  assert.equal(deleted, 1)
})
test('complete membership snapshot requirement rejects partial fetch instead of treating it as empty', async () => {
  const guild = { memberCount: 2, members: { fetch: async () => new Map(), fetchMe: async () => ({}) }, roles: { fetch: async () => new Map() } }
  await assert.rejects(() => snapshotMembers(guild, {}), /Complete guild membership/)
})
test('notification migration reverses independently and preserves core operation receipts', async t => {
  const f = await fixture(t)
  await f.run('sentinel', async () => ({ saved: true }))
  await notifyMigration.down(f.sequelize.getQueryInterface())
  assert.equal(await f.models.Operation.count(), 1)
  await notifyMigration.up(f.sequelize.getQueryInterface())
  assert.equal(await f.models.Notification.count(), 0)
})

test('wired slash command stays disabled in an allowed channel without loading the real database runtime', async t => {
  let response
  const keys = ['GUILDID', 'SPOOKYCHANNELID', 'BOTTESTCHANNELID'], saved = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  Object.assign(process.env, { GUILDID: '100000000000000001', SPOOKYCHANNELID: '100000000000000002', BOTTESTCHANNELID: '100000000000000003' })
  t.after(() => { for (const key of keys) if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key] })
  assert.deepEqual(liveCommand.data.toJSON().options.map(option => option.name), ['help','register','collection','leaderboard','trick','treat','fate'])
  await liveCommand.execute({ guildId: process.env.GUILDID, channelId: process.env.SPOOKYCHANNELID,
    options: { getSubcommand: () => 'trick' }, reply: async payload => { response = payload } })
  assert.equal(response.ephemeral, true)
  assert.ok(response.embeds[0].title.includes('Not Enabled'))
})

test('booster/birthday bank credits use current balances, respect cap and count actual booster rewards', async t => {
  const f = await fixture(t)
  await f.User.create({ user_id: 'alice', user_name: 'Alice', bank: 99 })
  const boosted = await creditBank(f.User, 'alice', 1, { countBoost: true })
  assert.equal(boosted.bank, 100); assert.equal(boosted.boosterTotal, 1)
  const capped = await creditBank(f.User, 'alice', 1, { countBoost: true })
  assert.equal(capped.boosterTotal, 1)
  await f.User.update({ bank: 90 }, { where: { user_id: 'alice' } })
  assert.equal((await creditBank(f.User, 'alice', 10)).bank, 100)
})
