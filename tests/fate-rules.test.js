const test = require('node:test'), assert = require('node:assert/strict')
const { payment, reward } = require('../services/fate-rules')
test('rerolls cost ten and exhaust Bank before combining normal Fate', () => {
  assert.deepEqual(payment(6, 4, { kind: 'reroll' }), { bankBefore: 6, bank: 0, fateBefore: 4, fatePoints: 0, bankSpent: 6, fateSpent: 4 })
  assert.equal(payment(15, 0, { kind: 'reroll' }).bank, 5)
  assert.throws(() => payment(6, 3, { kind: 'reroll' }), /Insufficient/)
})
test('ordinary purchases cannot spend Bank; only explicitly exceptional overflow banks', () => {
  assert.throws(() => payment(100, 9), /Insufficient/)
  assert.deepEqual(reward(63, 98, 5), { fatePoints: 100, bank: 63 })
  assert.deepEqual(reward(63, 98, 5, { exceptional: true }), { fatePoints: 100, bank: 66 })
  assert.deepEqual(reward(99, 100, 10, { exceptional: true }), { fatePoints: 100, bank: 100 })
  const plan = require('../services/spooky/fate-purchases').planFatePayment(63, 12, 10, 'normal-fate-only')
  assert.equal(plan.bank, 63); assert.equal(plan.fatePoints, 2)
})

test('real reroll command combines Bank and Fate, then reports insufficient funds without a second debit', async t => {
  assert.equal(process.env.NODE_ENV, 'test')
  const { User } = require('../Models/model'), command = require('../commands/Fatepoints/Fate')
  t.after(() => User.sequelize.close()); await User.sync()
  const saved = { BOTTESTCHANNELID: process.env.BOTTESTCHANNELID, UNWANTEDROLEID: process.env.UNWANTEDROLEID }
  process.env.BOTTESTCHANNELID = 'test-channel'; process.env.UNWANTEDROLEID = 'player-role'
  t.after(() => { for (const [key, value] of Object.entries(saved)) value === undefined ? delete process.env[key] : process.env[key] = value })
  await User.create({ user_id: 'alice', user_name: 'Alice', bank: 6, fate_points: 4 })
  const replies = [], interaction = { user: { id: 'alice', username: 'Alice' }, guildId: 'test-guild', channel: { id: 'test-channel' },
    member: { roles: { cache: new Map([['player-role', {}]]) } }, options: { getSubcommand: () => 'reroll' }, reply: async payload => replies.push(payload) }
  await command.execute(interaction)
  assert.equal((await User.findByPk('alice')).bank, 0); assert.equal((await User.findByPk('alice')).fate_points, 0)
  await command.execute(interaction)
  assert.match(replies[0].embeds[0].data.description, /6 Bank \+ 4 Fate/)
  assert.equal(replies[1].embeds[0].data.description, 'Not enough fate points.')
})
