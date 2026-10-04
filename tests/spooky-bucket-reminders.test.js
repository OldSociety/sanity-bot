const test = require('node:test')
const assert = require('node:assert/strict')
const Sequelize = require('sequelize')
const core = require('../migrations/20261001000000-create-spooky-core')
const outbox = require('../migrations/20261001000002-create-spooky-notifications')
const { defineSpookyModels } = require('../services/spooky/models')
const { createEconomy } = require('../services/spooky/economy')
const { createParticipants } = require('../services/spooky/participants')
const { createNotifications } = require('../services/spooky/notifications')
const { config } = require('../services/spooky/config')
const { createBucketReminders, WEEK } = require('../services/spooky/bucket-reminders')

async function fixture(t) {
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => sequelize.close())
  await core.up(sequelize.getQueryInterface()); await outbox.up(sequelize.getQueryInterface())
  const models = defineSpookyModels(sequelize), event = { ...config, enabled: true }
  let now = new Date(config.startsAt), mode = 'ok', duringLookup = async () => {}
  const clock = () => now, scope = { eventId: event.eventId, guildId: 'guild' }
  const economy = createEconomy({ sequelize, models, clock, configVersion: event.version })
  const participants = createParticipants({ models, economy, event })
  const notifications = createNotifications({ models }), sends = [], errors = []
  const channel = { id: 'channel', guildId: 'guild', async send(payload) {
    sends.push(payload); if (mode === 'ambiguous') throw new Error('network uncertainty')
    return { id: String(sends.length) }
  } }
  const make = () => createBucketReminders({ models, economy, participants, notifications, event, ...scope,
    channelId: channel.id, clock, onError: error => errors.push(error.message),
    getChannel: async () => { await duringLookup(); if (mode === 'lookup') throw new Error('channel unavailable'); return channel } })
  const seed = async (userId, registered = true) => models.Participant.create({ ...scope, userId,
    candy: 80, refillAnchor: now, registeredAt: registered ? now : null })
  return { models, economy, participants, event, scope, seed, make, sends, errors,
    time: ms => { now = new Date(Date.parse(config.startsAt) + ms) },
    mode: value => { mode = value }, lookup: fn => { duringLookup = fn } }
}

test('steady refill yields one candy at 18 minutes and 80/day without overflow surplus', () => {
  const { calculateRefill } = require('../services/spooky/participants')
  const start = Date.parse(config.startsAt), interval = 18 * 60 * 1000
  assert.equal(config.candy.refillAmount, 1); assert.equal(config.candy.refillIntervalMs, interval)
  const calc = elapsed => calculateRefill({ candy: 0, refillAnchor: start, now: start + elapsed })
  assert.equal(calc(interval - 1).candy, 0); assert.equal(calc(interval).candy, 1)
  assert.equal(calc(interval * 2 - 1).candy, 1); assert.equal(calc(86400000).candy, 80)
})

test('only registered full buckets are mentioned; weekly cooldown survives restarts and concurrent ticks', async t => {
  const f = await fixture(t), full = await f.seed('alice')
  await f.seed('outsider', false)
  const partial = await f.seed('bob'); await partial.update({ candy: 10 })
  const service = f.make()
  await Promise.all([service.tick(), service.tick()])
  assert.equal(f.sends.length, 1)
  assert.deepEqual(f.sends[0].allowedMentions.users, ['alice'])
  assert.deepEqual(f.sends[0].allowedMentions.roles, [])
  assert.match(f.sends[0].embeds[0].description, /spooky treat/)
  assert.equal(full.candy, 80)
  await partial.update({ registeredAt: null })
  f.time(WEEK - 1); await f.make().tick(); assert.equal(f.sends.length, 1)
  f.time(WEEK); await f.make().tick(); assert.equal(f.sends.length, 2)
  assert.equal(f.errors.length, 0)
})

test('naturally full bucket materializes refill atomically without enrolling outsiders', async t => {
  const f = await fixture(t)
  const player = await f.seed('alice'); await player.update({ candy: 79 })
  f.time(config.candy.refillIntervalMs - 1); await f.make().tick(); assert.equal(f.sends.length, 0)
  f.time(config.candy.refillIntervalMs); await f.make().tick()
  await player.reload(); assert.equal(player.candy, 80)
  assert.equal(f.sends.length, 1)
  assert.equal(await f.models.Ledger.sum('delta', { where: { resource: 'candy' } }), 1)
})

test('lookup failure retries pending reminder; spending before send cancels stale reminder', async t => {
  const f = await fixture(t), player = await f.seed('alice')
  f.mode('lookup'); await f.make().tick()
  assert.equal((await f.models.Notification.findOne()).status, 'pending')
  f.mode('ok'); f.lookup(async () => { await player.update({ candy: 79 }) })
  await f.make().tick(); assert.equal(f.sends.length, 0)
  await f.make().tick(); assert.equal((await f.models.Notification.findOne()).status, 'cancelled')
  await player.update({ candy: 80 }); await f.make().tick(); assert.equal(f.sends.length, 0)
})

test('ambiguous sends never automatically resend; pause/closure/disable prevent messages', async t => {
  const f = await fixture(t); await f.seed('alice')
  const state = await f.models.EventState.create({ ...f.scope, actionsPaused: true })
  await f.make().tick(); assert.equal(f.sends.length, 0)
  await state.update({ actionsPaused: false })
  f.mode('ambiguous'); await f.make().tick()
  assert.equal((await f.models.Notification.findOne()).status, 'uncertain')
  f.mode('ok'); await f.make().tick(); assert.equal(f.sends.length, 1)
  f.event.enabled = false; f.time(WEEK); await f.make().tick(); assert.equal(f.sends.length, 1)
  f.event.enabled = true; f.time(Date.parse(config.endsAt) - Date.parse(config.startsAt))
  await f.make().tick(); assert.equal(f.sends.length, 1)
})

test('pending reminders cannot tag removed registration or send after event closes', async t => {
  const f = await fixture(t), player = await f.seed('alice')
  f.mode('lookup'); await f.make().tick()
  await player.update({ registeredAt: null })
  f.mode('ok'); await f.make().tick()
  assert.equal((await f.models.Notification.findOne()).status, 'cancelled')
  assert.equal(f.sends.length, 0)
})

test('closure during channel lookup blocks delivery and next sweep cancels; different workers cannot duplicate', async t => {
  const f = await fixture(t); await f.seed('alice')
  await Promise.all([f.make().tick(), f.make().tick()])
  assert.equal(f.sends.length, 1)
  assert.equal(await f.models.Operation.count({ where: { operationType: 'candy_bucket_reminder' } }), 1)
  f.time(WEEK); f.mode('lookup'); await f.make().tick()
  f.mode('ok'); f.lookup(async () => { f.time(Date.parse(config.endsAt) - Date.parse(config.startsAt)) })
  await f.make().tick(); assert.equal(f.sends.length, 1)
  await f.make().tick()
  assert.equal(await f.models.Notification.count({ where: { status: 'pending' } }), 0)
})
