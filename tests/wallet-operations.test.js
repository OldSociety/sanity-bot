const test = require('node:test'), assert = require('node:assert/strict')
const { Sequelize, DataTypes } = require('sequelize')
const { mkdtempSync, rmSync } = require('node:fs'), { tmpdir } = require('node:os'), { join } = require('node:path')
const { operationModel, reroll, birthday, notifyBirthday } = require('../services/wallet-operation')
const migrate = require('../migrations/wallet-operations')
async function fixture(t, storage = ':memory:') {
  const db = new Sequelize({ dialect: 'sqlite', storage, logging: false })
  const User = require('../Models/User/User')(db, DataTypes)
  await User.sync(); await migrate(db)
  t.after(() => db.close())
  return { db, User, Operation: operationModel(db) }
}
const input = { guildId: 'guild', userId: 'alice', interactionId: 'interaction' }
test('concurrent reroll retries debit once, combine Bank first and freeze their result', async t => {
  const { User, Operation } = await fixture(t)
  await User.create({ user_id: 'alice', user_name: 'Alice', bank: 6, fate_points: 94 })
  const results = await Promise.all(Array.from({ length: 8 }, () => reroll(User, input)))
  assert.equal(results.filter(r => !r.replayed).length, 1)
  assert.equal((await User.findByPk('alice')).fate_points, 90)
  assert.equal((await User.findByPk('alice')).bank, 0)
  assert.equal(await Operation.count(), 1)
  await User.update({ fate_points: 100 }, { where: { user_id: 'alice' } })
  assert.equal((await reroll(User, input)).receipt.after.fate_points, 90)
  assert.equal((await User.findByPk('alice')).fate_points, 100)
  await assert.rejects(reroll(User, { ...input, userId: 'bob' }), /identity/)
  await assert.rejects(reroll(User, { ...input, guildId: 'other' }), /identity/)
})
test('a failed reroll stays failed on retry after a refill; a new interaction can pay', async t => {
  const { User } = await fixture(t)
  await User.create({ user_id: 'alice', user_name: 'Alice', bank: 6, fate_points: 3 })
  assert.equal((await reroll(User, input)).receipt.success, false)
  await User.update({ fate_points: 50 }, { where: { user_id: 'alice' } })
  assert.equal((await reroll(User, input)).receipt.success, false)
  assert.equal((await reroll(User, { ...input, interactionId: 'new' })).receipt.after.fate_points, 46)
})
test('failed receipt commit rolls the debit back', async t => {
  const { User, Operation } = await fixture(t)
  await User.create({ user_id: 'alice', user_name: 'Alice', bank: 20 })
  Operation.addHook('beforeCreate', () => { throw Error('injected receipt failure') })
  await assert.rejects(reroll(User, input), /injected/)
  assert.equal((await User.findByPk('alice')).bank, 20)
  assert.equal(await Operation.count(), 0)
})
test('birthday annual receipts preserve caps, survive spending and allow the next year', async t => {
  const { User } = await fixture(t)
  await User.create({ user_id: 'alice', user_name: 'Alice', bank: 98, fate_points: 100 })
  const request = { guildId: 'guild', userId: 'alice', year: 2026 }
  const results = await Promise.all([birthday(User, request), birthday(User, request)])
  assert.equal(results.filter(r => !r.replayed).length, 1)
  assert.equal(results[0].receipt.credited, 2)
  await User.update({ bank: 63 }, { where: { user_id: 'alice' } })
  assert.equal((await birthday(User, request)).receipt.after.bank, 100)
  assert.equal((await User.findByPk('alice')).bank, 63)
  assert.equal((await birthday(User, { ...request, year: 2027 })).receipt.after.bank, 73)
})
test('birthday delivery failure and repeated jobs never pay or send twice', async t => {
  const { User, Operation } = await fixture(t)
  await User.create({ user_id: 'alice', user_name: 'Alice', bank: 0 })
  const result = await birthday(User, { guildId: 'guild', userId: 'alice', year: 2026 })
  let calls = 0
  await assert.rejects(notifyBirthday(User, result.operationId, async () => { calls++; throw Error('unknown send result') }), /unknown/)
  assert.equal(await notifyBirthday(User, result.operationId, async () => { calls++ }), false)
  assert.equal(calls, 1)
  assert.equal((await Operation.findByPk(result.operationId)).notificationStatus, 'uncertain')
  assert.equal((await User.findByPk('alice')).bank, 10)
})
test('birthday at or above the Bank cap records zero without lowering legacy balances', async t => {
  const { User } = await fixture(t)
  for (const bank of [100, 125]) {
    const userId = `user-${bank}`
    await User.create({ user_id: userId, user_name: userId, bank })
    const result = await birthday(User, { guildId: 'guild', userId, year: 2026 })
    assert.equal(result.receipt.credited, 0)
    assert.equal((await User.findByPk(userId)).bank, bank)
  }
})
test('concurrent birthday notification claims send only once', async t => {
  const { User, Operation } = await fixture(t)
  await User.create({ user_id: 'alice', user_name: 'Alice' })
  const result = await birthday(User, { guildId: 'guild', userId: 'alice', year: 2026 })
  let sent = 0
  await Promise.all(Array.from({ length: 6 }, () => notifyBirthday(User, result.operationId, async () => { sent++; return { id: 'message' } })))
  assert.equal(sent, 1)
  assert.equal((await Operation.findByPk(result.operationId)).messageId, 'message')
})
test('reroll and annual birthday receipts survive closing and reopening SQLite', async t => {
  const folder = mkdtempSync(join(tmpdir(), 'wallet-replay-')), storage = join(folder, 'wallet.sqlite')
  t.after(() => rmSync(folder, { recursive: true, force: true }))
  let db = new Sequelize({ dialect: 'sqlite', storage, logging: false })
  let User = require('../Models/User/User')(db, DataTypes)
  await User.sync(); await migrate(db)
  await User.create({ user_id: 'alice', user_name: 'Alice', bank: 20 })
  await reroll(User, input)
  const request = { guildId: 'guild', userId: 'alice', year: 2026 }
  await birthday(User, request); await db.close()
  db = new Sequelize({ dialect: 'sqlite', storage, logging: false })
  User = require('../Models/User/User')(db, DataTypes)
  try {
    assert.equal(await migrate(db), false)
    assert.equal((await reroll(User, input)).replayed, true)
    assert.equal((await birthday(User, request)).replayed, true)
    assert.equal((await User.findByPk('alice')).bank, 20)
  } finally { await db.close() }
})
test('birthday worker isolates failed delivery, checks eligibility and uses Pacific dates', async t => {
  const { User } = await fixture(t), { runBirthdays, pacificDate } = require('../services/birthday-rewards')
  assert.deepEqual(pacificDate('2027-01-01T07:59:00Z'), { month: 12, day: 31, year: 2026 })
  for (const id of ['alice', 'bob', 'bot', 'spectator']) await User.create({ user_id: id, user_name: id, birthday: new Date('1990-10-05T12:00:00Z') })
  const sent = [], errors = [], guild = { id: 'guild', members: { fetch: async ({ user }) => ({ user: { id: user, bot: user === 'bot' }, roles: { cache: new Map(user === 'spectator' ? [] : [['player', {}]]) } }) } }
  const channel = { guildId: 'guild', send: async payload => { sent.push(payload); if (payload.includes('<@alice>')) throw Error('network'); return { id: 'message' } } }
  const client = { guilds: { cache: new Map([['guild', guild]]) }, channels: { cache: new Map([['channel', channel]]) } }
  const options = { User, client, guildId: 'guild', roleId: 'player', channelId: 'channel', now: new Date('2026-10-05T13:00:00Z'), logger: { error: (...args) => errors.push(args) } }
  await runBirthdays(options); await runBirthdays(options)
  assert.equal(sent.length, 2); assert.equal(errors.length, 1)
  assert.equal((await User.findByPk('alice')).bank, 10); assert.equal((await User.findByPk('bob')).bank, 10)
  assert.equal((await User.findByPk('bot')).bank, 0); assert.equal((await User.findByPk('spectator')).bank, 0)
})
test('closed shop is omitted in every environment and direct calls touch no storage', async () => {
  const shop = require('../commands/Shop/Shop'), { commandEnabled } = require('../services/command-environment')
  for (const environment of ['development', 'production', 'test']) assert.equal(commandEnabled(shop, environment), false)
  const replies = []
  await shop.execute({ reply: async payload => replies.push(payload) })
  assert.equal(replies[0].ephemeral, true); assert.match(replies[0].content, /temporarily closed/)
})
