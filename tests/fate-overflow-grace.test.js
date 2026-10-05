const test = require('node:test'), assert = require('node:assert/strict'), Sequelize = require('sequelize')
const { selectedGrace, activeGrace, launchWindow, graceNotice } = require('../services/fate-overflow-grace')
const policy = { enabled: true, startsAt: '2026-10-05T19:00:00.000Z', endsAt: '2026-12-05T20:00:00.000Z' }
async function fixture(t) {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }); t.after(() => db.close())
  const User = require('../Models/User/User')(db, Sequelize.DataTypes); await User.sync()
  return { db, User }
}
test('grace is inactive until an explicit launch, starts inclusively and ends exactly after two Pacific calendar months', () => {
  assert.equal(selectedGrace('production').enabled, false); assert.equal(selectedGrace('development').enabled, false)
  assert.equal(selectedGrace('test').enabled, false)
  assert.deepEqual(launchWindow(policy.startsAt), policy)
  assert.equal(activeGrace('2026-10-05T18:59:59Z', policy), false)
  assert.equal(activeGrace(policy.startsAt, policy), true)
  assert.equal(activeGrace('2026-12-05T19:59:59Z', policy), true)
  assert.equal(activeGrace(policy.endsAt, policy), false)
  assert.equal(launchWindow('2026-12-31T20:00:00Z').endsAt, '2027-02-28T20:00:00.000Z')
  assert.equal(launchWindow('2027-02-05T20:00:00Z').endsAt, '2027-04-05T19:00:00.000Z')
  assert.throws(() => activeGrace(policy.startsAt, { enabled: true, startsAt: policy.startsAt, endsAt: null }), /bounded/)
})
test('pure plans bank only new overflow in the window, keep Bank cap and preserve existing balances', () => {
  const { reward } = require('../services/fate-rules')
  assert.deepEqual(reward(63, 98, 5, { now: policy.startsAt, overflowGrace: policy }), { fatePoints: 100, bank: 66 })
  assert.deepEqual(reward(63, 98, 5, { now: policy.endsAt, overflowGrace: policy }), { fatePoints: 100, bank: 63 })
  assert.deepEqual(reward(99, 100, 5, { now: policy.startsAt, overflowGrace: policy }), { fatePoints: 100, bank: 100 })
  assert.deepEqual(reward(105, 100, 5, { now: policy.startsAt, overflowGrace: policy }), { fatePoints: 100, bank: 105 })
  assert.equal(graceNotice(0), null); assert.match(graceNotice(1, 4), /4 additional Fate/)
})
test('personal grace is role-independent, capped, exactly once on concurrent messages and expires', async t => {
  const { User } = await fixture(t), { applyChatMessage } = require('../services/fate-wallet')
  await User.create({ user_id: 'alice', user_name: 'Alice', chat_exp: 150, fate_points: 98, bank: 63 })
  const input = { userId: 'alice', userName: 'Alice', now: new Date(policy.startsAt), xp: 10, unwanted: true, booster: false, overflowGrace: policy }
  const results = await Promise.all([applyChatMessage(User, input), applyChatMessage(User, input)])
  const result = results.find(item => item.levelUp)
  assert.equal(results.filter(item => item.levelUp).length, 1)
  assert.equal(result.user.bank, 66); assert.equal(result.user.fate_points, 100); assert.equal(result.bankedOverflow, 3); assert.equal(result.discardedOverflow, 0)
  await User.update({ chat_exp: 220, bank: 99 }, { where: { user_id: 'alice' } })
  const capped = await applyChatMessage(User, { ...input, now: new Date(Date.parse(policy.startsAt) + 60000) })
  assert.equal(capped.bankedOverflow, 1); assert.equal(capped.discardedOverflow, 4)
  await User.update({ chat_exp: 295, bank: 50 }, { where: { user_id: 'alice' } })
  const expired = await applyChatMessage(User, { ...input, now: new Date(policy.endsAt), booster: true })
  assert.equal(expired.bankedOverflow, 0); assert.equal(expired.user.bank, 50)
})
test('communal grace snapshots actual Bank transitions, rewards noncontributors and replay never adds again', async t => {
  const { db, User } = await fixture(t)
  await require('../migrations/community-leveling').up(db.getQueryInterface())
  const models = require('../services/community-leveling/models').defineModels(db)
  const service = require('../services/community-leveling/economy').createCommunity({ User, models,
    config: { enabled: true, guildId: 'guild', timezone: 'America/Los_Angeles' }, overflowGrace: policy,
    resolveRecipients: async () => [{ userId: 'alice', userName: 'Alice' }, { userId: 'bob', userName: 'Bob' }] })
  await models.Guild.create({ guildId: 'guild', xp: 299 })
  await User.create({ user_id: 'alice', user_name: 'Alice', fate_points: 98, bank: 63 })
  await User.create({ user_id: 'bob', user_name: 'Bob', fate_points: 100, bank: 99 })
  const input = { guildId: 'guild', userId: 'spectator', messageId: 'level', now: new Date(policy.startsAt) }
  const first = await service.earn(input), replay = await service.earn(input)
  assert.equal(first.rewards[0].bankCredited, 3); assert.match(first.rewards[0].note, /first two months/)
  assert.equal(first.rewards[1].bankCredited, 1); assert.match(first.rewards[1].note, /4 additional Fate/)
  assert.deepEqual(replay.rewards, first.rewards); assert.equal(replay.replayed, true)
  assert.equal((await User.findByPk('alice')).bank, 66); assert.equal((await User.findByPk('bob')).bank, 100)
  assert.equal(await User.findByPk('spectator'), null)
})
