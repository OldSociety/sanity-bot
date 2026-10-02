const test = require('node:test')
const assert = require('node:assert/strict')
const Sequelize = require('sequelize')
const defineUser = require('../Models/User/User')
const migration = require('../migrations/20261001000000-create-spooky-core')
const deliveryMigration = require('../migrations/20261001000001-create-spooky-delivery')
const { defineSpookyModels } = require('../services/spooky/models')
const { createEconomy } = require('../services/spooky/economy')
const { createParticipants } = require('../services/spooky/participants')
const { createEffects } = require('../services/spooky/effects')
const { createPlayful } = require('../services/spooky/playful')
const { createDelivery } = require('../services/spooky/delivery')
const { createLifecycle, createMaintenanceScheduler } = require('../services/spooky/lifecycle')
const { config } = require('../services/spooky/config')

async function fixture(t) {
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => sequelize.close())
  const User = defineUser(sequelize, Sequelize.DataTypes); await User.sync()
  await migration.up(sequelize.getQueryInterface()); await deliveryMigration.up(sequelize.getQueryInterface())
  const models = defineSpookyModels(sequelize), event = { ...config, enabled: true }
  let now = new Date(config.startsAt), calls = 0, failure = false, key = 0
  const clock = () => now
  const economy = createEconomy({ sequelize, models, configVersion: event.version, clock })
  const participants = createParticipants({ models, economy, event })
  const effects = createEffects({ models, participants, event })
  const scope = { eventId: config.eventId, guildId: 'guild' }
  const member = { nickname: null, roleIds: [] }
  const adapter = {
    async getMember() { calls++; if (failure) throw new Error('permissions'); return member },
    async setNickname(_g, _u, value) { calls++; member.nickname = value },
    async setRole(_g, _u, id, present) { calls++; member.roleIds = member.roleIds.filter(r => r !== id); if (present) member.roleIds.push(id) },
  }
  const delivery = createDelivery({ models, adapter })
  const playful = createPlayful({ models, participants, effects, delivery, collection: {}, listMembers: () => [],
    roleIds: { curse: 'curse-role', sweetTooth: 'sweet-role' }, event })
  const make = (changes = {}) => createLifecycle({ models, economy, playful, delivery, guildId: 'guild', event, ...changes })
  const run = callback => economy.execute({ ...scope, actorId: 'alice', workerKey: `setup-${key++}`, operationType: 'setup' }, callback)
  await run(async ctx => { await participants.prepare(ctx, 'alice', { register: true }); return {} })
  await User.create({ user_id: 'alice', user_name: 'Alice', bank: 42, fate_points: 15 })
  const player = await models.Participant.findOne({ where: { ...scope, userId: 'alice' } })
  await models.Inventory.create({ participantId: player.id, pieceId: 'had_tl', quantity: 3 })
  return { sequelize, models, event, economy, effects, delivery, playful, make, run, scope, member, player, User,
    calls: () => calls, clock, time: date => { now = new Date(date) }, fail: value => { failure = value } }
}

test('Pacific start/end boundaries freeze once and preserve inventory, scores, wallet and pause', async t => {
  const f = await fixture(t), lifecycle = f.make()
  await f.models.Participant.update({ treatPrestige: 12, trickPrestige: 7 }, { where: { id: f.player.id } })
  await f.models.EventState.create({ ...f.scope, configVersion: config.version, actionsPaused: true, pauseReason: 'inspection' })
  f.time(Date.parse(config.startsAt) - 1)
  assert.equal((await lifecycle.maintain('before-open')).receipt.phase, 'UPCOMING')
  assert.equal(f.calls(), 0)
  f.time(config.startsAt)
  assert.equal((await lifecycle.maintain('opening')).receipt.phase, 'ACTIVE')
  f.time(Date.parse(config.endsAt) - 1)
  assert.equal((await lifecycle.maintain('last-millisecond')).receipt.phase, 'ACTIVE')
  assert.equal((await f.models.EventState.findOne()).archivedAt, null)
  f.time(config.endsAt)
  assert.equal((await lifecycle.maintain('close')).receipt.newlyArchived, true)
  assert.equal((await f.make().maintain('close')).replayed, true)
  assert.equal((await lifecycle.maintain('later-slot')).receipt.newlyArchived, false)
  const state = await f.models.EventState.findOne()
  assert.equal(state.archivedAt.toISOString(), config.endsAt)
  assert.equal(state.actionsPaused, true); assert.equal(state.pauseReason, 'inspection')
  assert.equal(await f.models.Ledger.count({ where: { resource: 'event_archive' } }), 1)
  assert.equal(await f.models.Participant.count(), 1)
  assert.equal((await f.models.Participant.findByPk(f.player.id)).treatPrestige, 12)
  assert.equal((await f.models.Inventory.findOne()).quantity, 3)
  assert.equal((await f.User.findByPk('alice')).bank, 42)
})

test('startup after downtime restores owned effects; committed replay retries pending delivery', async t => {
  const f = await fixture(t)
  await f.run(async ctx => {
    await f.effects.put(ctx, 'alice', 'curse', { expiresAt: config.endsAt, metadata: { botOwnedRole: true, roleId: 'curse-role' } })
    await f.effects.put(ctx, 'alice', 'reversed_nickname', { expiresAt: config.endsAt,
      metadata: { originalNickname: null, appliedNickname: 'ecilA' } })
    await f.effects.put(ctx, 'alice', 'theft_protection', { expiresAt: new Date(ctx.now.getTime() + 3600000) })
    return {}
  })
  f.member.nickname = 'ecilA'; f.member.roleIds = ['curse-role', 'sweet-role']
  f.time(Date.parse(config.endsAt) + 86400000); f.fail(true)
  const closed = await f.make().maintain('startup')
  assert.equal(closed.receipt.cleared.length, 3)
  assert.equal(await f.models.Effect.count(), 0)
  assert.equal(await f.models.Delivery.count({ where: { status: 'pending' } }), 2)
  f.fail(false)
  const replay = await f.make().maintain('startup')
  assert.equal(replay.replayed, true)
  assert.equal(f.member.nickname, null)
  assert.deepEqual(f.member.roleIds, ['sweet-role'])
  assert.equal(await f.models.Delivery.count({ where: { status: 'done' } }), 2)
  assert.equal(await f.models.Ledger.count({ where: { resource: 'event_archive' } }), 1)
})

test('active expiry cleans shields without waiting for play; closure catches overlong effects and respects scope', async t => {
  const f = await fixture(t)
  await f.run(async ctx => { await f.effects.put(ctx, 'alice', 'theft_protection', { expiresAt: new Date(ctx.now.getTime() + 3600000) }); return {} })
  const outsider = await f.models.Participant.create({ ...f.scope, guildId: 'other', userId: 'alice', refillAnchor: new Date(config.startsAt) })
  await f.models.Effect.create({ participantId: outsider.id, effectType: 'theft_protection', expiresAt: new Date(config.startsAt), metadata: {} })
  f.time(Date.parse(config.startsAt) + 3599999)
  assert.equal((await f.make().maintain('before-expiry')).receipt.cleared.length, 0)
  f.time(Date.parse(config.startsAt) + 3600000)
  assert.equal((await f.make().maintain('expiry')).receipt.cleared.length, 1)
  await f.models.Effect.create({ participantId: f.player.id, effectType: 'curse', expiresAt: new Date(Date.parse(config.endsAt) + 999999), metadata: { botOwnedRole: true, roleId: 'curse-role' } })
  f.time(config.endsAt)
  assert.equal((await f.make().maintain('close')).receipt.cleared.length, 1)
  assert.equal(await f.models.Effect.count({ where: { participantId: outsider.id } }), 1)
})

test('cleanup failure rolls back closure/restoration; repaired data allows the same key to succeed', async t => {
  const f = await fixture(t)
  await f.models.Effect.create({ participantId: f.player.id, effectType: 'reversed_nickname', expiresAt: new Date(config.endsAt), metadata: { appliedNickname: 'bad' } })
  f.time(config.endsAt)
  const before = await f.models.Operation.count()
  await assert.rejects(() => f.make().maintain('close'), /metadata is invalid/)
  assert.equal(await f.models.Operation.count(), before)
  assert.equal(await f.models.EventState.count(), 0)
  assert.equal(await f.models.Effect.count(), 1)
  assert.equal(await f.models.Delivery.count(), 0)
  await f.models.Effect.update({ metadata: { originalNickname: null, appliedNickname: 'bad' } }, { where: { participantId: f.player.id } })
  f.member.nickname = 'independent change'
  assert.equal((await f.make().maintain('close')).receipt.newlyArchived, true)
  assert.equal(f.member.nickname, 'independent change')
  assert.equal((await f.models.Delivery.findOne()).status, 'conflict')
})

test('cleanup preserves pre-existing curse roles and cancels stale additions; disabled worker does nothing', async t => {
  const f = await fixture(t)
  await f.run(async ctx => {
    await f.effects.put(ctx, 'alice', 'curse', { expiresAt: config.endsAt, metadata: { botOwnedRole: false } })
    await f.delivery.enqueue(ctx, 'alice', 'curse_role', { roleId: 'curse-role', present: true }); return {}
  })
  f.member.roleIds = ['curse-role']; f.time(config.endsAt)
  assert.deepEqual(await f.make({ event: { ...f.event, enabled: false } }).maintain('disabled'), { skipped: 'disabled' })
  assert.equal(await f.models.Effect.count(), 1); assert.equal(f.calls(), 0)
  await f.make().maintain('close')
  assert.deepEqual(f.member.roleIds, ['curse-role'])
  assert.equal((await f.models.Delivery.findOne()).status, 'cancelled')
})

test('queued pre-close maintenance uses execution time; concurrent closure writes one archive ledger entry', async t => {
  const f = await fixture(t)
  f.time(Date.parse(config.endsAt) - 1)
  let entered, release
  const started = new Promise(resolve => { entered = resolve })
  const blocker = f.run(async () => { entered(); await new Promise(resolve => { release = resolve }); return {} })
  await started
  const pending = f.make().maintain('queued-before-close')
  f.time(config.endsAt); release(); await blocker
  const first = await pending
  assert.equal(first.receipt.phase, 'CLOSED')
  assert.equal(first.receipt.newlyArchived, true)
  const results = await Promise.all([f.make().maintain('concurrent-a'), f.make().maintain('concurrent-b')])
  assert.ok(results.every(r => r.receipt.newlyArchived === false))
  assert.equal(await f.models.Ledger.count({ where: { resource: 'event_archive' } }), 1)
})

test('scheduler starts immediately, deduplicates slot keys, skips overlap/readiness, retries errors and stops', async () => {
  let scheduled, cleared = 0, time = Date.parse(config.startsAt), ready = true, errors = 0, fail = false
  const calls = [], event = { ...config, enabled: true }
  let release
  const service = { async maintenance(key) { calls.push(key); if (fail) throw new Error('DB unavailable'); if (release) await new Promise(resolve => { release = resolve }); return {} } }
  const scheduler = createMaintenanceScheduler({ event, getService: () => service, clock: () => time,
    isReady: () => ready, onError: () => errors++, setTimer: fn => { scheduled = fn; return { unref() {} } }, clearTimer: () => cleared++ })
  await scheduler.start(); await scheduler.start(); await scheduler.tick()
  assert.equal(calls.length, 2); assert.equal(calls[0], calls[1]); assert.equal(typeof scheduled, 'function')
  time += 60000; await scheduler.tick(); assert.notEqual(calls[1], calls[2])
  ready = false; assert.equal((await scheduler.tick()).skipped, 'not_ready'); ready = true
  release = true
  const pending = scheduler.tick(); assert.equal((await scheduler.tick()).skipped, 'busy')
  const complete = release; release = null; complete(); await pending
  fail = true; assert.equal((await scheduler.tick()).failed, true); assert.equal(errors, 1)
  fail = false; await scheduler.tick()
  scheduler.stop(); assert.equal(cleared, 1); assert.equal((await scheduler.tick()).skipped, 'stopped')
  let constructed = 0
  const disabled = createMaintenanceScheduler({ getService: () => { constructed++; throw new Error('must not open DB') }, setTimer: () => { throw new Error('must not create timer') } })
  assert.equal((await disabled.start()).skipped, 'disabled'); assert.equal((await disabled.tick()).skipped, 'disabled'); assert.equal(constructed, 0)
})
