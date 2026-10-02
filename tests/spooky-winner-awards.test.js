const test = require('node:test')
const assert = require('node:assert/strict')
const Sequelize = require('sequelize')
const { config } = require('../services/spooky/config')
const { defineSpookyModels } = require('../services/spooky/models')
const { createEconomy } = require('../services/spooky/economy')
const { createParticipants } = require('../services/spooky/participants')
const { createProgression } = require('../services/spooky/progression')
const { createWinnerSnapshot } = require('../services/spooky/winner-snapshot')
const { createLifecycle } = require('../services/spooky/lifecycle')
const { createDelivery, checkTitleRolePermission } = require('../services/spooky/delivery')
const { createNotifications } = require('../services/spooky/notifications')
const { createAdminResolution } = require('../services/spooky/admin-resolution')
const { winnerConfig, validateWinners, winnerMessages, createTitleGuard, createWinnerAwards, withWinnerAwards } = require('../services/spooky/winner-awards')
const alice = '300000000000000001', admin = '300000000000000002'
const settings = { enabled: true, channelId: '100000000000000001',
  treat: { name: 'Treat Champion', roleId: '200000000000000001' }, trick: { name: 'Trick Champion', roleId: '200000000000000002' } }

async function fixture(t) {
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => sequelize.close())
  for (const [stamp, name] of [['000000', 'core'], ['000001', 'delivery'], ['000002', 'notifications']]) {
    await require(`../migrations/20261001${stamp}-create-spooky-${name}`).up(sequelize.getQueryInterface())
  }
  const models = defineSpookyModels(sequelize), event = { ...config, enabled: true }, scope = { eventId: event.eventId, guildId: 'guild' }
  let now = new Date(event.startsAt), key = 0, permission = true, sendError = false, lookupError = false, memberError = false, writes = 0
  const clock = () => now
  const economy = createEconomy({ sequelize, models, configVersion: event.version, clock })
  const roles = new Map([[alice, new Set()], [admin, new Set()]]), sends = []
  const adapter = {
    async getMember(_, id) { if (memberError) throw new Error('Member unavailable'); return { roleIds: [...(roles.get(id) || [])], nickname: null } },
    async checkRolePermission() { return permission },
    async setRole(_, id, roleId, present) { assert.equal(present, true); writes++; roles.get(id).add(roleId) },
  }
  const makeDelivery = (overrides = {}) => createDelivery({ models, adapter, canDeliver: createTitleGuard({ models, event, settings, clock }), ...overrides })
  const delivery = makeDelivery(), notifications = createNotifications({ models })
  const channel = { id: settings.channelId, guildId: scope.guildId, async send(payload) { sends.push(payload); if (sendError) throw new Error('Ambiguous send'); return { id: String(sends.length) } } }
  const getChannel = async () => { if (lookupError) throw new Error('Channel unavailable'); return channel }
  const make = (overrides = {}) => createWinnerAwards({ models, economy, delivery, notifications, guildId: scope.guildId, event, settings, clock, getChannel, ...overrides })
  const participants = createParticipants({ models, economy, event })
  const progression = createProgression({ models, User: { sequelize }, event, isUnwanted: () => false })
  const run = work => economy.execute({ ...scope, actorId: 'system', workerKey: `fixture-${key++}`, operationType: 'fixture' }, work)
  const register = id => participants.register({ ...scope, actorId: id, interactionId: `register-${id}-${key++}` })
  const score = (id, track) => run(ctx => progression.prestige(ctx, { actorId: id, action: track, outcome: 'standard_gift', overridden: false }, {}))
  const close = async () => {
    now = new Date(event.endsAt)
    return createLifecycle({ models, economy, guildId: scope.guildId, event, delivery,
      playful: { cleanup: async () => ({ cleared: [] }) }, winnerSnapshots: createWinnerSnapshot({ models, event }) }).maintain(`close-${key++}`)
  }
  return { sequelize, models, event, scope, economy, delivery, notifications, roles, sends, channel, adapter, make, makeDelivery, register, score, close, clock,
    permission: value => { permission = value }, sendError: value => { sendError = value }, lookupError: value => { lookupError = value },
    memberError: value => { memberError = value }, time: value => { now = new Date(value) }, writes: () => writes }
}

test('overall Scream Supreme combines both tracks, waits for announced time and awards only one title', async t => {
  const f = await fixture(t)
  await f.register(alice); await f.register(admin)
  await f.score(alice, 'treat'); await f.score(alice, 'trick'); await f.score(admin, 'treat')
  await f.close()
  const combined = { enabled: true, mode: 'overall', channelId: settings.channelId,
    overall: { name: 'SCREAM SUPREME', roleId: '200000000000000003' }, announcementAt: '2026-11-01T20:00:00Z' }
  const delivery = f.makeDelivery({ canDeliver: createTitleGuard({ models: f.models, event: f.event, settings: combined, clock: f.clock }) })
  const worker = f.make({ settings: combined, delivery })
  assert.equal((await worker.tick()).skipped, 'not_due')
  assert.equal(f.sends.length, 0)
  f.time(combined.announcementAt)
  const result = await worker.tick()
  assert.deepEqual(result.receipt.winners, { overall: [alice] })
  assert.ok(f.roles.get(alice).has(combined.overall.roleId)); assert.equal(f.roles.get(admin).size, 0)
  assert.equal(f.sends.length, 1)
  assert.match(f.sends[0].embeds[0].description, /2 treats.*1 tricks.*6 prestige/)
  assert.doesNotMatch(f.sends[0].embeds[0].description, /scoringVersion|success|bonus|delta/)
  await worker.tick(); assert.equal(f.sends.length, 1)
})

test('winner configuration is disabled/incomplete by default and rejects unsafe or reused titles/roles', () => {
  assert.equal(winnerConfig.enabled, false); assert.equal(winnerConfig.channelId, null)
  for (const changes of [{ enabled: 'yes' }, { channelId: null }, { channelId: '@everyone' },
    { treat: { ...settings.treat, name: 'Sweet Tooth' } }, { treat: { ...settings.treat, name: '@everyone' } },
    { treat: { ...settings.treat, name: 'a'.repeat(81) } }, { trick: settings.treat },
    { trick: { ...settings.trick, roleId: settings.treat.roleId } }, { treat: { name: null, roleId: null } }]) {
    assert.throws(() => validateWinners({ ...settings, ...changes }), /winner|winners/i)
  }
  assert.throws(() => validateWinners(settings, [settings.treat.roleId]), /winner/i)
  assert.deepEqual(validateWinners(settings), settings)
})

test('invalid optional winner settings block titles while preserving legacy delivery and completed maintenance', async () => {
  const errors = [], bad = { ...settings, channelId: null }
  const guard = createTitleGuard({ settings: bad, models: {}, onError: error => errors.push(error.message) })
  assert.equal(await guard({ kind: 'final_treat_role' }), false)
  assert.equal(await guard({ kind: 'curse_role' }), true)
  assert.equal(errors.length, 1)
  const maintenance = withWinnerAwards(async () => ({ archived: true }), {
    tick: () => createWinnerAwards({ settings: bad }).tick(),
  })
  assert.deepEqual(await maintenance('close'), { archived: true, winnerAwards: { failed: true } })
})

test('closure award operation grants shared titles/both tracks once from the saved proof, survives restart and deletion', async t => {
  const f = await fixture(t)
  await f.register(alice); await f.register(admin)
  await f.score(alice, 'treat'); await f.score(admin, 'treat'); await f.score(alice, 'trick')
  await f.close()
  // Frozen proof survives deletion; the winner service must not recompute.
  await f.models.Participant.destroy({ where: { userId: admin } })
  await Promise.allSettled([f.make().tick(), f.make().tick(), f.make().tick()])
  await f.make().tick()
  assert.equal(await f.models.Operation.count({ where: { operationType: 'winner_awards' } }), 1)
  assert.equal(await f.models.Delivery.count(), 3)
  assert.equal(await f.models.Notification.count(), 2)
  assert.equal(await f.models.Ledger.count({ where: { resource: 'winner_awards' } }), 1)
  assert.equal(f.writes(), 3); assert.equal(f.sends.length, 2)
  assert.deepEqual([...f.roles.get(alice)].sort(), [settings.treat.roleId, settings.trick.roleId].sort())
  assert.deepEqual([...f.roles.get(admin)], [settings.treat.roleId])
  assert.equal((await f.models.Participant.findOne()).candy, 10)
  assert.equal(await f.models.Inventory.count(), 0)
  assert.ok(f.sends.every(payload => payload.allowedMentions.parse.length === 0 && payload.allowedMentions.roles.length === 0))
  assert.doesNotMatch(JSON.stringify(f.sends), /prestige|scoringVersion|score|badge unlocked|role granted/i)
})

test('disabled/upcoming/active and missing snapshot/archive do not consume award identity or touch Discord', async t => {
  const f = await fixture(t)
  assert.equal((await f.make({ settings: winnerConfig }).tick()).skipped, 'disabled')
  assert.equal((await f.make({ event: config }).tick()).skipped, 'disabled')
  f.time(Date.parse(config.startsAt) - 1); assert.equal((await f.make().tick()).skipped, 'not_closed')
  f.time(config.startsAt); assert.equal((await f.make().tick()).skipped, 'not_closed')
  f.time(config.endsAt); assert.equal((await f.make().tick()).skipped, 'snapshot_not_ready')
  assert.equal(await f.models.Operation.count(), 0); assert.equal(f.sends.length, 0); assert.equal(f.writes(), 0)
})

test('empty tracks announce no qualifying players without creating roles; pages bound large shared ties', async t => {
  const f = await fixture(t); await f.close(); await f.make().tick()
  assert.equal(await f.models.Delivery.count(), 0); assert.equal(f.sends.length, 2)
  assert.ok(f.sends.every(payload => /No qualifying players/.test(payload.embeds[0].description)))
  const ids = Array.from({ length: 130 }, (_, index) => String(300000000000000000n + BigInt(index)))
  const pages = winnerMessages({ tracks: { treat: { userIds: ids }, trick: { userIds: [] } } }, settings)
  assert.equal(pages.length, 6)
  assert.deepEqual(pages.slice(0, 5).flatMap(row => row.payload.allowedMentions.users), ids)
  assert.ok(pages.every(row => row.payload.embeds[0].description.length < 4096 && row.payload.allowedMentions.users.length <= 32))
})

test('permission/member failures retry desired role safely; crash after applied role does not apply twice', async t => {
  const f = await fixture(t); await f.register(alice); await f.score(alice, 'treat'); await f.close()
  f.permission(false); await f.make().tick()
  let row = await f.models.Delivery.findOne()
  assert.equal(row.status, 'pending'); assert.match(row.lastError, /permissions/); assert.equal(f.writes(), 0)
  f.permission(true); f.memberError(true); await f.make().tick()
  assert.match((await f.models.Delivery.findOne()).lastError, /Member unavailable/)
  f.memberError(false)
  // Crash leaves pending after Discord applied it. Fresh desired-state read sees
  // the role and confirms done without another external write.
  f.roles.get(alice).add(settings.treat.roleId)
  await f.make().tick(); row = await f.models.Delivery.findOne()
  assert.equal(row.status, 'done'); assert.equal(f.writes(), 0); assert.equal(f.sends.length, 2)
})

test('lookup failure retries pending announcement; ambiguous send requires inspection and never auto-resends', async t => {
  const f = await fixture(t); await f.close()
  f.lookupError(true); await assert.rejects(() => f.make().tick(), /Channel unavailable/)
  assert.equal((await f.models.Notification.findOne()).status, 'pending')
  f.lookupError(false); f.sendError(true); await assert.rejects(() => f.make().tick(), /Ambiguous/)
  assert.equal((await f.models.Notification.findOne()).status, 'uncertain')
  f.sendError(false); assert.equal((await f.make().tick()).skipped, 'inspection_required')
  assert.equal(f.sends.length, 1)
})

test('configuration drift/disable blocks all role paths without requeuing or overwriting frozen intents', async t => {
  const f = await fixture(t); await f.register(alice); await f.score(alice, 'treat'); await f.close()
  f.permission(false); await f.make().tick(); f.permission(true)
  const original = (await f.models.Delivery.findOne()).get({ plain: true })
  const changed = { ...settings, treat: { ...settings.treat, roleId: '200000000000000099' } }
  assert.equal((await f.make({ settings: changed }).tick()).skipped, 'configuration_changed')
  for (const current of [changed, winnerConfig]) {
    await f.makeDelivery({ canDeliver: createTitleGuard({ models: f.models, event: f.event, settings: current, clock: f.clock }) }).reconcile(f.scope)
  }
  // Default delivery without a title guard is also fail-closed.
  await createDelivery({ models: f.models, adapter: f.adapter }).reconcile(f.scope)
  assert.equal(f.writes(), 0)
  assert.deepEqual((await f.models.Delivery.findOne()).get({ plain: true }), original)
  assert.equal(await f.models.Operation.count({ where: { operationType: 'winner_awards' } }), 1)
  assert.equal(await f.models.Notification.count(), 2)
  await f.make().tick(); assert.equal(f.writes(), 1)
})

test('title guard rejects foreign or forged winner intents; channel owner is rechecked before send', async t => {
  const f = await fixture(t); await f.register(alice); await f.score(alice, 'treat'); await f.close()
  f.permission(false); f.lookupError(true); await assert.rejects(() => f.make().tick(), /Channel/)
  const row = (await f.models.Delivery.findOne()).get({ plain: true })
  const guard = createTitleGuard({ models: f.models, event: f.event, settings, clock: f.clock })
  assert.equal(await guard(row), true)
  assert.equal(await guard({ ...row, userId: admin }), false)
  assert.equal(await guard({ ...row, guildId: 'foreign' }), false)
  assert.equal(await guard({ ...row, payload: { ...row.payload, roleId: settings.trick.roleId } }), false)
  f.lookupError(false)
  await assert.rejects(() => f.make({ getChannel: async () => ({ ...f.channel, guildId: 'foreign' }) }).tick(), /owner mismatch/)
  assert.equal(f.sends.length, 0)
})

test('corrupt proof/notification enqueue failure rolls back all award intents and corrected retry succeeds', async t => {
  const f = await fixture(t); await f.register(alice); await f.score(alice, 'treat'); await f.close()
  const proof = await f.models.Operation.findOne({ where: { operationType: 'winner_snapshot' } }), original = proof.receipt
  await proof.update({ receipt: {} })
  await assert.rejects(() => f.make().tick(), /receipt is invalid/)
  assert.equal(await f.models.Delivery.count(), 0)
  await proof.update({ receipt: original })
  await assert.rejects(() => f.make({ notifications: { async enqueue() { throw new Error('outbox failure') } } }).tick(), /outbox failure/)
  assert.equal(await f.models.Delivery.count(), 0); assert.equal(await f.models.Notification.count(), 0)
  await f.make().tick(); assert.equal(await f.models.Delivery.count(), 1); assert.equal(f.writes(), 1)
})

test('title admin retry/acknowledgement uses scoped evidence and preserves cancellation through award replay', async t => {
  const f = await fixture(t); await f.register(alice); await f.score(alice, 'treat'); await f.close()
  f.permission(false); await f.make().tick()
  const row = await f.models.Delivery.findOne()
  const resolution = createAdminResolution({ models: f.models, economy: f.economy, event: f.event, scope: f.scope,
    checkAccess: async () => {}, readMember: () => f.adapter.getMember('guild', alice) })
  const input = { ...f.scope, actorId: admin, target: 'delivery', id: row.id, expectedStatus: 'pending', expectedRevision: row.revision,
    confirm: true, reason: 'Inspected final title', action: 'retry', interactionId: 'admin-retry' }
  await resolution.resolve(input)
  await assert.rejects(() => resolution.resolve({ ...input, action: 'acknowledge', interactionId: 'admin-ack' }), /does not match/)
  await resolution.resolve({ ...input, action: 'cancel', interactionId: 'admin-cancel' })
  f.permission(true); await f.make().tick()
  assert.equal((await f.models.Delivery.findOne()).status, 'cancelled'); assert.equal(f.writes(), 0)
  assert.equal(await f.models.Operation.count({ where: { operationType: 'winner_awards' } }), 1)
})

test('winner role permission checks awarded-role hierarchy and permits the owner', async () => {
  let manage = true, managed = false, position = 1, owner = 'owner'
  const calls = []
  const guild = { id: 'guild', get ownerId() { return owner }, members: {
    async fetch(request) { calls.push(request); return { id: alice, roles: { highest: {} } } },
    async fetchMe(options) { assert.deepEqual(options, { force: true }); return { permissions: { has: () => manage }, roles: { highest: { comparePositionTo: () => position } } } },
  }, roles: { async fetch() { return new Map([[settings.treat.roleId, { id: settings.treat.roleId, get managed() { return managed } }]]) } } }
  assert.equal(await checkTitleRolePermission(guild, alice, settings.treat.roleId), true)
  assert.deepEqual(calls[0], { user: alice, force: true })
  manage = false; assert.equal(await checkTitleRolePermission(guild, alice, settings.treat.roleId), false)
  manage = true; managed = true; assert.equal(await checkTitleRolePermission(guild, alice, settings.treat.roleId), false)
  managed = false; position = 0; assert.equal(await checkTitleRolePermission(guild, alice, settings.treat.roleId), false)
  position = 1; owner = alice; assert.equal(await checkTitleRolePermission(guild, alice, settings.treat.roleId), true)
})

test('award failure isolation preserves completed maintenance and propagates root cleanup failure', async () => {
  const errors = []
  const run = withWinnerAwards(async () => ({ archived: true }), { tick: async () => { throw new Error('award network failure') } }, error => errors.push(error.message))
  assert.deepEqual(await run('slot'), { archived: true, winnerAwards: { failed: true } })
  assert.deepEqual(errors, ['award network failure'])
  await assert.rejects(() => withWinnerAwards(async () => { throw new Error('cleanup failure') }, { tick: async () => {} })('slot'), /cleanup failure/)
})

test('delayed member/channel lookups recheck guards before external writes or announcements', async t => {
  const f = await fixture(t); await f.register(alice); await f.score(alice, 'treat'); await f.close()
  f.permission(false); f.lookupError(true); await assert.rejects(() => f.make().tick(), /Channel/)
  f.permission(true)
  let allowed = true
  const guarded = f.makeDelivery({ canDeliver: async () => allowed, adapter: {
    ...f.adapter, async getMember(...args) { const member = await f.adapter.getMember(...args); allowed = false; return member },
  } })
  await guarded.reconcile(f.scope)
  assert.equal(f.writes(), 0); assert.equal((await f.models.Delivery.findOne()).status, 'pending')
  f.lookupError(false)
  await f.make({ getChannel: async () => { f.time(config.startsAt); return f.channel } }).tick()
  assert.equal(f.sends.length, 0)
  assert.ok((await f.models.Notification.findAll()).every(row => row.status === 'pending'))
})
