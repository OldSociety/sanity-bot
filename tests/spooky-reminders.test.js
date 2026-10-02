const test = require('node:test')
const assert = require('node:assert/strict')
const Sequelize = require('sequelize')
const core = require('../migrations/20261001000000-create-spooky-core')
const outbox = require('../migrations/20261001000002-create-spooky-notifications')
const { defineSpookyModels } = require('../services/spooky/models')
const { createEconomy } = require('../services/spooky/economy')
const { createNotifications } = require('../services/spooky/notifications')
const { config } = require('../services/spooky/config')
const { reminderConfig, validateReminders, latestReminderSlot, reminderPayload, createReminders, withReminders } = require('../services/spooky/reminders')

const settings = { enabled: true, timezone: 'America/Los_Angeles', everyDays: 3,
  channelId: '100000000000000001', roleIds: ['200000000000000001', '200000000000000002'], localTime: '12:00' }
async function fixture(t) {
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => sequelize.close())
  await core.up(sequelize.getQueryInterface()); await outbox.up(sequelize.getQueryInterface())
  const models = defineSpookyModels(sequelize), event = { ...config, enabled: true }
  let now = new Date('2026-10-01T19:00:00Z'), fail = false, fetchFail = false, lookups = 0
  const clock = () => now
  const economy = createEconomy({ sequelize, models, configVersion: event.version, clock })
  const notifications = createNotifications({ models }), sends = []
  const channel = { id: settings.channelId, guildId: 'guild', async send(payload) { sends.push(payload); if (fail) throw new Error('ambiguous network failure'); return { id: String(sends.length) } } }
  const getChannel = async () => { lookups++; if (fetchFail) throw new Error('channel unavailable'); return channel }
  const make = (overrides = {}) => createReminders({ models, economy, notifications, guildId: 'guild', event, settings, clock, getChannel, ...overrides })
  return { sequelize, models, economy, notifications, event, channel, sends, make, clock,
    time: value => { now = new Date(value) }, fail: value => { fail = value }, fetchFail: value => { fetchFail = value }, lookups: () => lookups }
}

test('weekly Fate reminders have independent identity and a strict Unwanted-only role mention', async t => {
  const f = await fixture(t)
  const weekly = { ...settings, everyDays: 7, roleIds: [settings.roleIds[0]] }
  const make = () => createReminders({ models: f.models, economy: f.economy, notifications: f.notifications,
    event: f.event, guildId: 'guild', settings: weekly, clock: f.clock, getChannel: async () => f.channel,
    namespace: 'fate-reminder', operationType: 'fate_reminder', payload: value => ({
      content: `<@&${value.roleIds[0]}>`, allowedMentions: { parse: [], roles: value.roleIds, users: [] },
      embeds: [{ title: 'Fate', description: '10 banked Fate Points buy a quarter with /spooky fate during October.' }],
    }) })
  await f.make().tick(); await make().tick()
  assert.equal(f.sends.length, 2)
  await make().tick(); assert.equal(f.sends.length, 2)
  assert.deepEqual(f.sends[1].allowedMentions.roles, weekly.roleIds)
  f.time('2026-10-07T19:00:00Z'); await make().tick(); assert.equal(f.sends.length, 2)
  f.time('2026-10-08T19:00:00Z'); await make().tick(); assert.equal(f.sends.length, 3)
})

test('reminder settings fail closed; payload mentions only configured Resident roles', () => {
  assert.equal(reminderConfig.enabled, false); assert.equal(reminderConfig.channelId, null)
  for (const changes of [{ channelId: null }, { roleIds: [] }, { roleIds: ['@everyone'] },
    { roleIds: [settings.roleIds[0], settings.roleIds[0]] }, { localTime: '24:00' },
    { localTime: null }, { everyDays: 1 }, { timezone: 'PST' }]) {
    assert.throws(() => validateReminders({ ...settings, ...changes }), /reminder|reminders/i)
  }
  const payload = reminderPayload(settings)
  assert.deepEqual(payload.allowedMentions, { parse: [], roles: settings.roleIds, users: [], repliedUser: false })
  assert.equal(payload.content, '<@&200000000000000001> <@&200000000000000002>')
  assert.match(payload.embeds[0].description, /\/spooky register/)
  assert.doesNotMatch(payload.embeds[0].description, /\/trick\b|\/treat\b|prestige|permanent badge/i)
})

test('latest due slot uses Pacific calendar days, local send time and exact October boundaries', () => {
  const slot = now => latestReminderSlot(now, settings)
  assert.equal(slot('2026-10-01T06:59:59Z'), null)
  assert.equal(slot(config.startsAt), null)
  assert.equal(slot('2026-10-01T18:59:59Z'), null)
  assert.equal(slot('2026-10-01T19:00:00Z'), '2026-10-01')
  assert.equal(slot('2026-10-04T18:59:59Z'), '2026-10-01')
  assert.equal(slot('2026-10-04T19:00:00Z'), '2026-10-04')
  assert.equal(slot('2026-10-31T19:00:00Z'), '2026-10-31')
  assert.equal(slot('2026-11-01T06:59:59Z'), '2026-10-31')
  assert.equal(slot(config.endsAt), null)
  // An injected longer window crosses the November Pacific offset transition.
  const later = { ...config, startsAt: '2026-10-30T07:00:00Z', endsAt: '2026-11-06T08:00:00Z' }
  assert.equal(latestReminderSlot('2026-11-02T19:59:59Z', settings, later), '2026-10-30')
  assert.equal(latestReminderSlot('2026-11-02T20:00:00Z', settings, later), '2026-11-02')
})

test('one durable reminder per slot survives restarts/concurrent ticks without resources', async t => {
  const f = await fixture(t)
  const results = await Promise.allSettled([f.make().tick(), f.make().tick(), f.make().tick()])
  assert.ok(results.some(r => r.status === 'fulfilled'))
  assert.equal(f.sends.length, 1)
  await f.make().tick()
  assert.equal(f.sends.length, 1)
  assert.equal(await f.models.Notification.count(), 1)
  assert.equal(await f.models.Operation.count({ where: { operationType: 'event_reminder' } }), 1)
  assert.equal(await f.models.Participant.count(), 0)
  assert.equal(await f.models.Inventory.count(), 0)
  assert.equal(await f.models.Ledger.count({ where: { resource: 'event_reminder' } }), 1)
  assert.equal((await f.models.Notification.findOne()).status, 'sent')
  f.time('2026-10-04T19:00:00Z'); await f.make().tick()
  assert.equal(f.sends.length, 2)
})

test('crash after enqueue or channel lookup failure retries pending current slot; uncertain never retries', async t => {
  const f = await fixture(t)
  f.fetchFail(true)
  await assert.rejects(() => f.make().tick(), /channel unavailable/)
  assert.equal((await f.models.Notification.findOne()).status, 'pending')
  f.fetchFail(false); f.fail(true)
  await assert.rejects(() => f.make().tick(), /ambiguous/)
  assert.equal((await f.models.Notification.findOne()).status, 'uncertain')
  assert.equal((await f.make().tick()).skipped, 'inspection_required')
  assert.equal(f.sends.length, 1); assert.equal(f.lookups(), 2)
  const pending = await fixture(t)
  pending.fetchFail(true); await assert.rejects(() => pending.make().tick(), /channel unavailable/)
  pending.fetchFail(false); await pending.make().tick(); await pending.make().tick()
  assert.equal(pending.sends.length, 1)
})

test('downtime expires pending older reminders and queues only the latest slot; foreign guild rows untouched', async t => {
  const f = await fixture(t)
  f.fetchFail(true); await assert.rejects(() => f.make().tick(), /channel unavailable/)
  const other = createReminders({ models: f.models, economy: f.economy, notifications: f.notifications,
    guildId: 'other', event: f.event, settings, clock: f.clock, getChannel: async () => { throw new Error('offline other') } })
  await assert.rejects(() => other.tick(), /offline other/)
  f.fetchFail(false); f.time('2026-10-11T19:00:00Z'); await f.make().tick()
  assert.equal(f.sends.length, 1)
  assert.equal(await f.models.Notification.count({ where: { status: 'cancelled' } }), 1)
  assert.equal(await f.models.Notification.count({ where: { status: 'pending' } }), 1)
  const operation = await f.models.Operation.findOne({ where: { guildId: 'guild', operationType: 'event_reminder', operationId: { [Sequelize.Op.like]: '%2026-10-10' } } })
  assert.equal(operation.receipt.slot, '2026-10-10')
  assert.equal(await f.models.Operation.count({ where: { guildId: 'guild', operationType: 'event_reminder' } }), 2)
})

test('paused/archived states suppress reminders without consuming due slot; disabled accesses no storage', async t => {
  const f = await fixture(t)
  const state = await f.models.EventState.create({ eventId: config.eventId, guildId: 'guild', configVersion: config.version, actionsPaused: true })
  assert.equal((await f.make().tick()).skipped, 'not_due')
  assert.equal(await f.models.Operation.count(), 0)
  await state.update({ actionsPaused: false }); await f.make().tick()
  assert.equal(f.sends.length, 1)
  await state.update({ archivedAt: f.clock() }); f.time('2026-10-04T19:00:00Z')
  assert.equal((await f.make().tick()).skipped, 'not_due'); assert.equal(f.sends.length, 1)
  const disabled = createReminders({ models: {}, economy: {}, notifications: {}, guildId: 'guild', settings: reminderConfig,
    event: f.event, getChannel: () => { throw new Error('no Discord') } })
  assert.deepEqual(await disabled.tick(), { skipped: 'disabled' })
  assert.deepEqual(await f.make({ event: { ...f.event, enabled: false } }).tick(), { skipped: 'disabled' })
})

test('slow channel lookup crossing end/pause skips before claim; closure cancels pending without sending', async t => {
  const f = await fixture(t)
  await f.make({ getChannel: async () => { f.time(config.endsAt); return f.channel } }).tick()
  assert.equal(f.sends.length, 0)
  assert.equal((await f.models.Notification.findOne()).status, 'cancelled')
  const paused = await fixture(t)
  await paused.make({ getChannel: async () => {
    await paused.models.EventState.create({ eventId: config.eventId, guildId: 'guild', configVersion: config.version, actionsPaused: true }); return paused.channel
  } }).tick()
  assert.equal(paused.sends.length, 0)
  assert.equal((await paused.models.Notification.findOne()).status, 'pending')
  await paused.models.EventState.update({ actionsPaused: false }, { where: { guildId: 'guild' } })
  await paused.make().tick(); assert.equal(paused.sends.length, 1)
})

test('wrong guild/channel fails before claim; changing configuration cancels pending old payload, never sends both', async t => {
  const f = await fixture(t)
  await assert.rejects(() => f.make({ getChannel: async () => ({ ...f.channel, guildId: 'foreign' }) }).tick(), /configured guild/)
  assert.equal(f.sends.length, 0); assert.equal((await f.models.Notification.findOne()).status, 'pending')
  const changed = { ...settings, roleIds: ['200000000000000003'] }
  await f.make({ settings: changed }).tick()
  assert.equal((await f.models.Notification.findOne()).status, 'cancelled'); assert.equal(f.sends.length, 0)
  f.time('2026-10-04T19:00:00Z'); await f.make({ settings: changed }).tick()
  assert.deepEqual(f.sends[0].allowedMentions.roles, changed.roleIds)
})

test('delayed database claim crossing closure releases unsent claim and expires it safely', async t => {
  const f = await fixture(t), update = f.models.Notification.update.bind(f.models.Notification)
  f.models.Notification.update = async (values, options) => {
    const result = await update(values, options)
    if (values.status === 'sending') f.time(config.endsAt)
    return result
  }
  await f.make().tick()
  assert.equal(f.sends.length, 0)
  assert.equal((await f.models.Notification.findOne()).status, 'cancelled')
})

test('outbox creation failure rolls back slot, ledger and notification; same-slot retry succeeds', async t => {
  const f = await fixture(t)
  const broken = { ...f.notifications, async enqueue(ctx, ...args) { await f.notifications.enqueue(ctx, ...args); throw new Error('write failure') } }
  await assert.rejects(() => f.make({ notifications: broken }).tick(), /write failure/)
  assert.equal(await f.models.Operation.count(), 0)
  assert.equal(await f.models.Notification.count(), 0)
  assert.equal(await f.models.Ledger.count(), 0)
  await f.make().tick(); assert.equal(f.sends.length, 1)
})

test('reminder failure does not block committed lifecycle maintenance; lifecycle failures still propagate', async () => {
  let errors = 0, ticks = 0
  const reminder = { async tick() { ticks++; throw new Error('channel unavailable') } }
  const maintain = withReminders(async key => ({ key, receipt: { newlyArchived: true } }), reminder, () => errors++)
  const result = await maintain('slot')
  assert.equal(result.receipt.newlyArchived, true)
  assert.equal(result.reminder.failed, true); assert.equal(errors, 1)
  await assert.rejects(() => withReminders(async () => { throw new Error('cleanup failure') }, reminder)('slot'), /cleanup failure/)
  assert.equal(ticks, 1)
})
