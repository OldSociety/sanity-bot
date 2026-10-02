const test = require('node:test')
const assert = require('node:assert/strict')
const Sequelize = require('sequelize')
const migration = require('../migrations/20261001000000-create-spooky-core')
const { defineSpookyModels } = require('../services/spooky/models')
const { createEconomy } = require('../services/spooky/economy')
const { config } = require('../services/spooky/config')
const { calculateRefill, createParticipants } = require('../services/spooky/participants')
const start = Date.parse(config.startsAt), hour = 3600000

async function fixture(t, event = { ...config, enabled: true }) {
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => sequelize.close())
  await migration.up(sequelize.getQueryInterface())
  const models = defineSpookyModels(sequelize)
  let now = start
  const economy = createEconomy({ sequelize, models, clock: () => new Date(now) })
  const service = createParticipants({ models, economy, event })
  const input = key => ({ eventId: event.eventId, guildId: 'guild', actorId: 'alice', interactionId: key })
  return { models, economy, service, input, time: value => { now = value } }
}

test('refill boundaries, partial intervals, downtime and capped surplus are deterministic', () => {
  const calc = (candy, elapsed, anchor = start) => calculateRefill({ candy, refillAnchor: anchor, now: start + elapsed })
  assert.equal(calc(10, 3 * hour - 1).delta, 0)
  assert.equal(calc(10, 3 * hour).candy, 20)
  assert.equal(calc(10, 10 * hour).refillAnchor.getTime(), start + 9 * hour)
  const capped = calc(10, 100 * hour)
  assert.equal(capped.candy, 80)
  assert.equal(capped.refillAnchor.getTime(), start + 100 * hour)
  assert.equal(calc(79, 101 * hour, capped.refillAnchor).delta, 0)
  assert.equal(calc(80, hour).refillAnchor.getTime(), start + hour)
  assert.equal(calc(10, -hour).delta, 0)
  const end = Date.parse(config.endsAt)
  assert.equal(calculateRefill({ candy: 0, refillAnchor: end - 3 * hour, now: end + 10 * hour }).candy, 10)
})

test('nonparticipant first touch and later registration reuse balances without catch-up or starter duplication', async t => {
  const f = await fixture(t)
  f.time(start + 15 * 24 * hour)
  const first = await f.service.refill({ ...f.input('victim'), userId: 'bob' })
  assert.equal(first.receipt.candy, 10)
  assert.equal(first.receipt.registeredAt, null)
  await f.economy.execute({ ...f.input('theft'), operationType: 'test_theft' }, async ctx => {
    await ctx.changeBalance('bob', 'candy', -1)
    return { stolen: 1 }
  })
  f.time(start + 15 * 24 * hour + 3 * hour)
  const registered = await f.service.register({ ...f.input('register'), actorId: 'bob' })
  assert.equal(registered.receipt.candy, 19)
  assert.equal(registered.receipt.created, false)
  assert.equal(registered.receipt.newlyRegistered, true)
  const again = await f.service.register({ ...f.input('register-again'), actorId: 'bob' })
  assert.equal(again.receipt.newlyRegistered, false)
  assert.equal(await f.models.Participant.count(), 1)
  assert.equal(await f.models.Ledger.count({ where: { resource: 'registration' } }), 1)
})

test('concurrent refill and interaction replay credit a due interval only once', async t => {
  const f = await fixture(t)
  await f.service.register(f.input('initial'))
  f.time(start + 3 * hour)
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => f.service.refill(f.input(`refill-${i}`))))
  assert.equal(results.reduce((sum, result) => sum + result.receipt.refilled, 0), 10)
  f.time(start + 6 * hour)
  const replay = await f.service.refill(f.input('refill-0'))
  assert.equal(replay.replayed, true)
  assert.equal(replay.receipt.candy, 20)
  assert.equal((await f.models.Participant.findOne()).candy, 20)
  await assert.rejects(() => f.service.refill({ ...f.input('refill-0'), userId: 'bob' }), /identity mismatch/)
})

test('disabled, upcoming, closed, archived and paused registration fail without writes; pause permits refill', async t => {
  const f = await fixture(t)
  const disabled = createParticipants({ models: f.models, economy: f.economy })
  await assert.rejects(() => disabled.register(f.input('disabled')), /disabled/)
  f.time(start - 1)
  await assert.rejects(() => f.service.register(f.input('upcoming')), /not active/)
  f.time(Date.parse(config.endsAt))
  await assert.rejects(() => f.service.refill(f.input('closed')), /not active/)
  assert.equal(await f.models.Operation.count(), 0)
  f.time(start)
  const state = await f.models.EventState.create({ eventId: config.eventId, guildId: 'guild', actionsPaused: true })
  await assert.rejects(() => f.service.register(f.input('paused')), /paused/)
  await f.service.refill(f.input('maintenance'))
  f.time(start + 3 * hour)
  assert.equal((await f.service.refill(f.input('paused-refill'))).receipt.candy, 20)
  await state.update({ archivedAt: new Date(start) })
  await assert.rejects(() => f.service.refill(f.input('archived')), /archived/)
})

test('guild scopes are isolated, event mismatch rolls back and registration cannot enroll another actor', async t => {
  const f = await fixture(t)
  await f.service.register(f.input('guild1'))
  await f.service.register({ ...f.input('guild2'), guildId: 'other' })
  assert.equal(await f.models.Participant.count(), 2)
  await assert.rejects(() => f.service.refill({ ...f.input('wrong-event'), eventId: 'other-event' }), /event mismatch/)
  assert.throws(() => f.service.register({ ...f.input('other-user'), userId: 'bob' }), /actor/)
  assert.equal(await f.models.Operation.count(), 2)
})

test('prepare joins the root transaction so later failure rolls back seed, refill and registration', async t => {
  const f = await fixture(t)
  await assert.rejects(() => f.economy.execute({ ...f.input('failed'), operationType: 'gameplay' }, async ctx => {
    await f.service.prepare(ctx, 'alice', { register: true })
    throw new Error('effect failed')
  }), /effect failed/)
  assert.equal(await f.models.Participant.count(), 0)
  assert.equal(await f.models.Ledger.count(), 0)
  assert.equal(await f.models.Operation.count(), 0)
})

test('spending after downtime at capacity starts a fresh interval and receipts replay after closure', async t => {
  const f = await fixture(t)
  await f.service.register(f.input('start'))
  f.time(start + 100 * hour)
  await f.economy.execute({ ...f.input('spend'), operationType: 'action' }, async ctx => {
    await f.service.prepare(ctx, 'alice')
    const participant = await ctx.changeBalance('alice', 'candy', -10)
    return { candy: participant.candy }
  })
  f.time(start + 103 * hour - 1)
  assert.equal((await f.service.refill(f.input('before'))).receipt.candy, 70)
  f.time(start + 103 * hour)
  assert.equal((await f.service.refill(f.input('due'))).receipt.candy, 80)
  f.time(Date.parse(config.endsAt))
  assert.equal((await f.service.refill(f.input('due'))).replayed, true)
  await assert.rejects(() => f.service.refill(f.input('after-end')), /not active/)
})
