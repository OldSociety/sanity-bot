const test = require('node:test'), assert = require('node:assert/strict')
const { Sequelize, DataTypes } = require('sequelize')
const { resetPersonalXp } = require('../services/personal-xp-reset')
async function fixture(t) {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => db.close())
  const User = require('../Models/User/User')(db, DataTypes)
  await User.sync(); await require('../migrations/wallet-operations')(db)
  await User.create({ user_id: 'alice', user_name: 'Alice', fate_points: 100, bank: 63, chat_level: 28, chat_exp: 1024, last_chat_message: new Date('2026-10-05T12:00:00Z'), birthday: new Date('1990-02-01T12:00:00Z') })
  return { User, db }
}
const input = { guildId: 'guild', launchId: 'personal-2026', now: new Date('2026-10-05T19:00:00Z') }
test('reset changes only XP, level and cooldown; repeating the launch does not erase subsequent XP', async t => {
  const { User } = await fixture(t)
  const before = (await User.findByPk('alice')).get({ plain: true })
  assert.equal((await resetPersonalXp(User, input)).receipt.count, 1)
  const after = (await User.findByPk('alice')).get({ plain: true })
  assert.equal(after.chat_exp, 0); assert.equal(after.chat_level, 1); assert.equal(after.last_chat_message, null)
  for (const key of Object.keys(before).filter(key => !['chat_exp', 'chat_level', 'last_chat_message'].includes(key))) assert.deepEqual(after[key], before[key])
  await User.update({ chat_exp: 10 }, { where: { user_id: 'alice' } })
  assert.equal((await resetPersonalXp(User, input)).replayed, true)
  assert.equal((await User.findByPk('alice')).chat_exp, 10)
})
test('failure to save launch receipt rolls the whole reset back', async t => {
  const { User, db } = await fixture(t)
  const before = (await User.findByPk('alice')).get({ plain: true })
  require('../services/wallet-operation').operationModel(db).addHook('beforeCreate', () => { throw Error('receipt failed') })
  await assert.rejects(resetPersonalXp(User, input), /receipt failed/)
  assert.deepEqual((await User.findByPk('alice')).get({ plain: true }), before)
})
test('personal-only leveling after reset awards capped Fate with the approved temporary Bank overflow', async t => {
  const { User } = await fixture(t)
  await resetPersonalXp(User, input)
  const wallet = require('../services/fate-wallet'), grace = require('../services/fate-overflow-grace').launchWindow(input.now)
  for (let n = 0; n < 16; n++) await wallet.applyChatMessage(User, { userId: 'alice', userName: 'Alice', now: new Date(input.now.getTime() + n * 60000), xp: 10, unwanted: true, overflowGrace: grace })
  const user = await User.findByPk('alice')
  assert.equal(user.chat_level, 2); assert.equal(user.chat_exp, 5); assert.equal(user.fate_points, 100); assert.equal(user.bank, 68)
  assert.equal((await User.sequelize.getQueryInterface().showAllTables()).some(name => name.startsWith('Community')), false)
})
