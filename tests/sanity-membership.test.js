const test = require('node:test'), assert = require('node:assert/strict'), Sequelize = require('sequelize')
const { createSanity, handleInteraction } = require('../services/sanity')
const { hasUnwantedRole } = require('../services/sanity-membership')

async function fixture(t) {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => db.close())
  const User = require('../Models/User/User')(db, Sequelize.DataTypes)
  await User.sync()
  await require('../migrations/sanity').up(db.getQueryInterface())
  await require('../migrations/sanity-daily').up(db.getQueryInterface())
  await require('../migrations/sanity-account-names').up(db.getQueryInterface())
  const config = { ...require('../config/sanity/sanity.json'), enabled: true, starting: 50 }
  const service = createSanity({ sequelize: db, config })
  const at = days => new Date(Date.parse('2026-10-04T16:00:00Z') + days * 86400000)
  const sync = (eligible, days, names = {}) => service.syncMember({ guildId: 'guild', userId: 'alice', eligible, now: at(days), ...names })
  return { db, User, service, config, at, sync }
}

test('Unwanted eligibility uses exact role IDs, supports Discord payloads and fails closed', () => {
  assert.equal(hasUnwantedRole({ roles: ['unwanted'] }, 'unwanted'), true)
  assert.equal(hasUnwantedRole({ roles: { cache: new Map([['unwanted', {}]]) } }, 'unwanted'), true)
  assert.equal(hasUnwantedRole({ roles: ['other'] }, 'unwanted'), false)
  assert.equal(hasUnwantedRole({ roles: ['unwanted'] }, ''), false)
})

test('non-Unwanted interactions create no accounts, presence, receipts or reminders', async t => {
  const f = await fixture(t)
  const interaction = { id: 'no-role', guild: { id: 'guild' }, user: { id: 'alice', username: 'Alice' },
    member: { roles: ['other'] }, isChatInputCommand: () => true, createdTimestamp: +f.at(0) }
  assert.equal(await handleInteraction(interaction, null, { config: { enabled: true }, service: f.service, guildId: 'guild', unwantedRoleId: 'unwanted' }), null)
  assert.equal(await f.service.models.Account.count(), 0)
  assert.equal(await f.service.models.Day.count(), 0)
  assert.equal(await f.service.models.Receipt.count(), 0)
})

test('names refresh without changing balances and role loss freezes tracking; rejoining never charges exempt days', async t => {
  const f = await fixture(t)
  await f.sync(true, 0, { userName: 'oldname', displayName: 'Alice' })
  await f.sync(true, 0, { userName: 'newname', displayName: 'New Alice' })
  let account = await f.service.models.Account.findOne()
  assert.equal(account.userName, 'newname'); assert.equal(account.displayName, 'New Alice'); assert.equal(account.balance, 50)
  await f.sync(false, 1)
  assert.equal(await f.service.view('guild', 'alice', f.at(20)), null)
  assert.equal(await f.service.gain({ guildId: 'guild', userId: 'alice', messageId: 'excluded', now: f.at(20) }), null)
  assert.equal(await f.service.claimReminder('guild', 'alice', f.at(20)), null)
  assert.equal(await f.service.models.Day.count(), 0)
  assert.equal((await account.reload()).balance, 50)
  await f.sync(true, 21)
  assert.equal((await f.service.view('guild', 'alice', f.at(21))).balance, 50)
  assert.equal((await f.service.view('guild', 'alice', f.at(22))).balance, 49)
})

test('name migration is additive, backfills stored usernames and is idempotent', async t => {
  const f = await fixture(t)
  await f.User.create({ user_id: 'alice', user_name: 'alice-name' })
  await f.sync(true, 0)
  const before = (await f.service.models.Account.findOne()).get({ plain: true })
  await require('../migrations/sanity-account-names').up(f.db.getQueryInterface())
  await require('../migrations/sanity-account-names').up(f.db.getQueryInterface())
  const after = (await f.service.models.Account.findOne()).get({ plain: true })
  assert.equal(after.userName, 'alice-name'); assert.equal(after.displayName, 'alice-name')
  assert.equal(after.balance, before.balance); assert.equal(after.lastActiveAt.valueOf(), before.lastActiveAt.valueOf())
})

test('temporary pause freezes activity, decay and reminders while keeping the saved balance visible', async t => {
  const f = await fixture(t)
  await f.sync(true, 0)
  f.config.pausedUserIds = ['alice']
  assert.deepEqual(await f.sync(true, 30), { balance: 50, maximum: 100, paused: true })
  assert.equal((await f.service.models.Account.findOne()).trackingEnabled, false)
  assert.equal((await f.service.view('guild', 'alice', f.at(60))).balance, 50)
  assert.equal(await f.service.gain({ guildId: 'guild', userId: 'alice', messageId: 'paused', now: f.at(60) }), null)
  assert.equal(await f.service.claimReminder('guild', 'alice', f.at(60)), null)
  assert.equal(await f.service.models.Day.count(), 0)
  assert.equal(await f.service.models.Receipt.count(), 0)
  assert.equal((await f.sync(false, 60)).balance, 50)
  f.config.pausedUserIds = []
  assert.equal((await f.sync(true, 61)).balance, 50)
  assert.equal((await f.service.view('guild', 'alice', f.at(62))).balance, 49)
})
