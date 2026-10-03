const test = require('node:test')
const assert = require('node:assert/strict')
const Sequelize = require('sequelize')
const migration = require('../migrations/20261001000000-create-spooky-core')
const { defineSpookyModels } = require('../services/spooky/models')
const { createEconomy } = require('../services/spooky/economy')
const { createParticipants } = require('../services/spooky/participants')
const { selectAction, createActions } = require('../services/spooky/actions')
const { config } = require('../services/spooky/config')

async function fixture(t, { random = () => 0, cursed = false, handlers = {} } = {}) {
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => sequelize.close())
  await migration.up(sequelize.getQueryInterface())
  const models = defineSpookyModels(sequelize), event = { ...config, enabled: true }
  const economy = createEconomy({ sequelize, models, configVersion: event.version, clock: () => new Date(config.startsAt) })
  const participants = createParticipants({ models, economy, event })
  const service = createActions({ models, economy, participants, event, handlers, random, getCurseState: () => cursed })
  const input = key => ({ eventId: event.eventId, guildId: 'guild', actorId: 'alice', interactionId: key, action: 'trick' })
  await participants.register(input('register'))
  return { models, economy, participants, service, input }
}

test('every normal table interval is reachable with exact boundaries and no independent Eye roll', () => {
  for (const action of ['trick', 'treat']) {
    let boundary = 0
    for (const outcome of config[`${action}Outcomes`]) {
      for (const value of [boundary / 100, (boundary + outcome.percent / 2) / 100, (boundary + outcome.percent) / 100 - 1e-10]) {
        let calls = 0
        assert.equal(selectAction({ action, random: () => { calls++; return value } }).outcome, outcome.id)
        assert.equal(calls, 1)
      }
      boundary += outcome.percent
    }
  }
})

test('curse override boundary preserves 10%, 20/80 treat split and normal table selection', () => {
  const select = (action, values) => selectAction({ action, cursed: true, random: () => values.shift() })
  assert.equal(select('treat', [.09999, .19999]).outcome, 'curse_spread')
  assert.equal(select('treat', [0, .2]).outcome, 'curse_distribute_three')
  assert.equal(select('trick', [0]).outcome, 'curse_distribute_two')
  assert.equal(select('treat', [.1, .99]).outcome, 'find_eye')
  assert.equal(select('trick', [.1, .99]).outcome, 'steal_or_find_eye')
  for (const value of [-1, 1, NaN]) assert.throws(() => selectAction({ action: 'treat', random: () => value }), /Random value/)
})

test('successful theft spends candy before credit, records activity and concurrent replay runs once', async t => {
  let calls = 0
  const f = await fixture(t, { handlers: { steal_candy: async (ctx, plan) => {
    calls++
    await ctx.transfer('bob', plan.actorId, 'candy', 1)
    return { stolen: 1 }
  } } })
  await f.participants.refill({ ...f.input('victim'), userId: 'bob' })
  const results = await Promise.all(Array.from({ length: 10 }, () => f.service.execute(f.input('steal'))))
  assert.equal(calls, 1)
  assert.equal(results[0].receipt.candySpent, 1)
  const alice = await f.models.Participant.findOne({ where: { userId: 'alice' } })
  assert.equal(alice.candy, 10)
  assert.ok(alice.lastActive)
  assert.equal((await f.models.Participant.findOne({ where: { userId: 'bob' } })).candy, 9)
  const rows = await f.models.Ledger.findAll({ where: { operationId: 'discord:steal', resource: 'candy' } })
  assert.equal(rows.reduce((sum, row) => sum + row.delta, 0), -1)
})

test('break curse and cursed distributions each cost one regardless of delivered gifts', async t => {
  const normal = await fixture(t, { random: () => .5, handlers: { break_curse: async () => ({ broken: true }) } })
  assert.equal((await normal.service.execute({ ...normal.input('break'), action: 'treat' })).receipt.candy, 9)
  const cursed = await fixture(t, { cursed: true, random: () => .05, handlers: { curse_spread: async () => ({ spread: true }),
    curse_distribute_two: async () => ({ deliveredCandy: 2 }) } })
  const result = await cursed.service.execute(cursed.input('distribution'))
  assert.equal(result.receipt.candySpent, 1)
  assert.equal(result.receipt.candy, 9)
})

test('effect failure, no-target rejection and missing handler refund all writes without rerolling', async t => {
  const f = await fixture(t, { handlers: { steal_candy: async ctx => {
    await ctx.changeBalance('alice', 'candy', 2)
    throw new Error('No eligible target')
  } } })
  await assert.rejects(() => f.service.execute(f.input('fail')), /No eligible target/)
  assert.equal((await f.models.Participant.findOne()).candy, 10)
  assert.equal(await f.models.Operation.count(), 1)
  const missing = await fixture(t)
  await assert.rejects(() => missing.service.execute(missing.input('missing')), /not implemented/)
  assert.equal((await missing.models.Participant.findOne()).candy, 10)
})

test('explicit paid no-effect outcome costs one; insufficient/paused/unregistered actions fail safely', async t => {
  const f = await fixture(t, { handlers: { steal_candy: async () => ({ noEffect: 'no_target' }) } })
  assert.equal((await f.service.execute(f.input('paid'))).receipt.candy, 9)
  const alice = await f.models.Participant.findOne()
  await alice.update({ candy: 0 })
  await assert.rejects(() => f.service.execute(f.input('poor')), /Insufficient candy/)
  await alice.update({ candy: 10 })
  await f.models.EventState.create({ eventId: config.eventId, guildId: 'guild', actionsPaused: true })
  await assert.rejects(() => f.service.execute(f.input('pause')), /paused/)
  await assert.rejects(() => f.service.execute({ ...f.input('new'), actorId: 'bob' }), /registration/)
  assert.equal(await f.models.Participant.count(), 1)
})

test('choice wait holds no transaction; pause, depleted candy and changed curse roll back without a second roll', async t => {
  for (const change of ['pause', 'candy', 'curse']) {
    const f = await fixture(t)
    let rolls = 0, cursed = false
    const service = createActions({ models: f.models, economy: f.economy, participants: f.participants,
      event: { ...config, enabled: true }, clock: () => new Date(config.startsAt),
      random: () => { rolls++; return 0.45 }, getCurseState: async () => cursed,
      handlers: { curse_target: async () => ({ cursedUserId: 'bob' }) },
      prepareChoice: {
        candidates: async () => [{ userId: 'bob' }],
        choose: async () => {
          // A queued DB read succeeds here: no read/write transaction is held
          // across the UI wait. Root validation still observes the new state.
          await f.economy.read(async transaction => {
            if (change === 'pause') await f.models.EventState.create({ eventId: config.eventId, guildId: 'guild', actionsPaused: true }, { transaction })
            if (change === 'candy') await f.models.Participant.update({ candy: 0 }, { where: { userId: 'alice' }, transaction })
          })
          if (change === 'curse') cursed = true
          return 'bob'
        },
      },
    })
    await assert.rejects(service.execute(f.input(`choice-${change}`)), /paused|Insufficient candy|curse changed/)
    assert.equal(rolls, 1)
    assert.equal(await f.models.Operation.count(), 1)
    assert.equal(await f.models.Ledger.count({ where: { resource: 'candy', delta: -1 } }), 0)
  }
})
