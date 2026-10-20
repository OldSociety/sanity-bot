const test = require('node:test')
const assert = require('node:assert/strict')
const Sequelize = require('sequelize')
const { createActions } = require('../services/spooky/actions')
const { config } = require('../services/spooky/config')

async function fixture(t, { drop = .029999, bank = 0, fail = false } = {}) {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => db.close())
  const User = require('../Models/User/User')(db, Sequelize.DataTypes)
  await User.sync()
  await require('../migrations/20261001000000-create-spooky-core').up(db.getQueryInterface())
  const models = require('../services/spooky/models').defineSpookyModels(db)
  const event = { ...config, enabled: true }
  const economy = require('../services/spooky/economy').createEconomy({ sequelize: db, models,
    clock: () => new Date(event.startsAt), configVersion: event.version })
  const participants = require('../services/spooky/participants').createParticipants({ models, economy, event })
  const input = { eventId: event.eventId, guildId: 'guild', actorId: 'alice', action: 'treat', interactionId: 'action' }
  await participants.register({ ...input, interactionId: 'register' })
  const user = await User.create({ user_id: 'alice', user_name: 'Alice', bank, fate_points: 50 })
  let calls = 0
  const actions = createActions({ User, models, economy, participants, event, getCurseState: () => false,
    // First draw picks lost_candy; the second is the independent Fate drop.
    random: () => ++calls % 2 ? 0 : drop,
    handlers: { lost_candy: async () => ({ noEffect: 'lost' }) },
    finalizeReceipt: async (_ctx, receipt) => { if (fail) throw Error('receipt failure'); return receipt } })
  return { actions, input, user, models, calls: () => calls }
}

test('3% drop adds exactly one banked Fate even on a failed game outcome; concurrent replay never rerolls', async t => {
  const f = await fixture(t)
  const results = await Promise.all(Array.from({ length: 5 }, () => f.actions.execute(f.input)))
  assert.equal(results.filter(r => !r.replayed).length, 1)
  assert.equal(f.calls(), 2)
  assert.equal(results[0].receipt.result.fateDrop, 1)
  assert.equal((await f.user.reload()).bank, 1)
  assert.equal(f.user.fate_points, 50)
  assert.equal(results[0].receipt.candy, 9)
  const ledger = await f.models.Ledger.findAll({ where: { resource: 'bank' } })
  assert.equal(ledger.length, 1)
  assert.equal(ledger[0].metadata.reason, 'spooky_action_drop')
  assert.equal(ledger[0].delta, 1)
})

test('the exact 3% boundary misses; full and historical above-cap banks are preserved', async t => {
  const miss = await fixture(t, { drop: .03 })
  assert.equal((await miss.actions.execute(miss.input)).receipt.result.fateDrop, undefined)
  assert.equal((await miss.user.reload()).bank, 0)
  for (const bank of [99, 100, 120]) {
    const f = await fixture(t, { bank })
    const r = await f.actions.execute(f.input)
    assert.equal(r.receipt.result.fateDrop, bank < 100 ? 1 : 0)
    assert.equal((await f.user.reload()).bank, bank < 100 ? 100 : bank)
  }
})

test('receipt failure rolls back the drop, candy payment, ledger and operation together', async t => {
  const f = await fixture(t, { fail: true })
  await assert.rejects(() => f.actions.execute(f.input), /receipt failure/)
  assert.equal((await f.user.reload()).bank, 0)
  assert.equal(await f.models.Ledger.count({ where: { resource: 'bank' } }), 0)
  assert.equal(await f.models.Operation.count({ where: { operationId: 'discord:action' } }), 0)
  assert.equal((await f.models.Participant.findOne()).candy, 10)
})

test('player receipt explains the bank deposit', () => {
  const messages = require('../services/spooky/presentation').actionMessages({ action: 'treat', outcome: 'lost_candy',
    candy: 9, eyes: 0, result: { fateDrop: 1, bank: 1, fatePoints: 50 } }, {
    actorId: 'alice', members: [{ userId: 'alice', displayName: 'Alice' }], registeredIds: new Set(), variantKey: 'test' })
  assert.match(JSON.stringify(messages), /Fate Point found/)
  assert.match(JSON.stringify(messages), /added to your bank/)
})
