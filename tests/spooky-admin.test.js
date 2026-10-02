const test = require('node:test')
const assert = require('node:assert/strict')
const Sequelize = require('sequelize')
const { PermissionFlagsBits } = require('discord.js')
const { config, pieces } = require('../services/spooky/config')
const { defineSpookyModels } = require('../services/spooky/models')
const { createEconomy } = require('../services/spooky/economy')
const { createAdmin } = require('../services/spooky/admin')
const { createAdminController, inspectionScreen } = require('../services/spooky/admin-command')
const { authorize } = require('../services/spooky/admin-runtime')
const command = require('../commands/Holiday/SpookyAdmin')

async function fixture(t, permitted = true, options = {}) {
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => sequelize.close())
  const User = require('../Models/User/User')(sequelize, Sequelize.DataTypes)
  await User.sync()
  for (const name of ['core', 'delivery', 'notifications']) {
    const stamp = { core: '000000', delivery: '000001', notifications: '000002' }[name]
    await require(`../migrations/20261001${stamp}-create-spooky-${name}`).up(sequelize.getQueryInterface())
  }
  const models = defineSpookyModels(sequelize)
  const economy = createEconomy({ sequelize, models, configVersion: config.version, clock: () => new Date('2026-10-10T12:00:00Z') })
  const delivery = options.adapter ? require('../services/spooky/delivery').createDelivery({ models, adapter: options.adapter }) : options.delivery
  const admin = createAdmin({ sequelize, models, User, economy, guildId: 'guild', event: config, environment: 'test', authorize: async () => permitted, ...options, delivery })
  const inspect = (view, extra = {}) => admin.inspect({ view, guildId: 'guild', actorId: 'admin', ...extra })
  const run = (key, work, scope = {}) => economy.execute({ eventId: config.eventId, guildId: 'guild', actorId: 'alice', interactionId: key,
    operationType: 'fixture', ...scope }, work)
  return { sequelize, User, models, economy, admin, inspect, run, delivery }
}
test('admin access fails closed for every view and mismatched guild before database reads', async t => {
  const f = await fixture(t, false)
  for (const view of ['player', 'transactions', 'config', 'deliveries']) await assert.rejects(() => f.inspect(view, { userId: 'alice' }), /permission/)
  await assert.rejects(() => f.inspect('config', { guildId: 'other' }), /scope/)
  assert.equal(await f.models.Operation.count(), 0)
  assert.equal(await f.models.Participant.count(), 0)
})

test('transaction activity identifies who acted, command, outcome and charged candy without mutating state', async t => {
  const f = await fixture(t)
  await f.User.create({ user_id: 'alice', user_name: 'Alice' })
  await f.run('logged-trick', async ctx => {
    await ctx.record({ userId: 'alice', resource: 'candy', delta: -1, before: 10, after: 9 })
    return { outcome: 'caught_stealing', candySpent: 1, candy: 9 }
  }, { operationType: 'spooky_trick' })
  const result = await f.inspect('transactions', { userId: 'alice' })
  assert.equal(result.activity.length, 1)
  assert.equal(result.activity[0].actorName, 'Alice')
  assert.equal(result.activity[0].actorId, 'alice')
  assert.equal(result.activity[0].command, '/spooky trick')
  assert.equal(result.activity[0].outcome, 'caught_stealing')
  assert.equal(result.activity[0].candySpent, 1)
  assert.equal(result.activity[0].candyAfter, 9)
  assert.equal(result.activity[0].interactionId, 'logged-trick')
  assert.equal(await f.models.Operation.count(), 1)
  assert.equal(await f.models.Ledger.count(), 1)
})
test('inspection works with disabled play and validates explicit environment, limits, cursors and required player', async t => {
  const f = await fixture(t)
  const result = await f.inspect('config')
  assert.equal(result.configuration.enabled, false); assert.equal(result.environment, 'test')
  assert.equal(result.configuration.version, config.version)
  assert.equal(result.reminders.enabled, false)
  assert.deepEqual(result.reminders.roleIds, [])
  assert.equal(result.reminders.localTime, null)
  assert.equal(result.winnerSnapshot, null)
  assert.equal(result.winners.enabled, false)
  assert.equal(result.winners.channelId, null)
  const saved = { eventId: config.eventId, guildId: 'guild', tracks: { treat: { score: null, userIds: [], entrants: [] } } }
  await f.models.Operation.create({ operationId: require('../services/spooky/winner-snapshot').snapshotOperationId(config.eventId, 'guild'),
    eventId: config.eventId, guildId: 'guild', actorId: 'system', operationType: 'winner_snapshot', receipt: saved,
    createdAt: new Date('2026-11-01T07:00:00Z'), completedAt: new Date('2026-11-01T07:00:00Z') })
  assert.deepEqual((await f.inspect('config')).winnerSnapshot, saved)
  assert.equal(await f.models.Operation.count(), 1)
  assert.equal(await f.models.Ledger.count(), 0)
  assert.equal(await f.models.Participant.count(), 0)
  for (const extra of [{ limit: 51 }, { limit: 0 }, { limit: 1.2 }, { beforeId: -1 }, { beforeId: 2.5 }]) {
    await assert.rejects(() => f.inspect('transactions', extra), /integer/)
  }
  await assert.rejects(() => f.inspect('player'), /Player ID/)
  await assert.rejects(() => f.inspect('unknown'), /Unknown/)
  assert.throws(() => createAdmin({ sequelize: f.sequelize, models: f.models, User: f.User, economy: f.economy, guildId: 'guild', authorize: () => true }), /environment/)
})
test('player inspection is complete stored state, reports eligibility without awarding or refilling', async t => {
  const f = await fixture(t)
  await f.User.create({ user_id: 'alice', user_name: 'Alice', bank: 70, fate_points: 20 })
  const player = await f.models.Participant.create({ eventId: config.eventId, guildId: 'guild', userId: 'alice',
    candy: 1, eyes: 4, registeredAt: new Date('2026-10-01'), refillAnchor: new Date('2026-10-01'), treatPrestige: -2, trickPrestige: 4 })
  for (const piece of pieces.filter(piece => piece.characterId === 'had')) await f.models.Inventory.create({ participantId: player.id, pieceId: piece.id, quantity: 2 })
  await f.models.Effect.create({ participantId: player.id, effectType: 'curse', expiresAt: new Date(config.endsAt), metadata: { ownedRole: true } })
  const result = await f.inspect('player', { userId: 'alice' })
  assert.equal(result.participant.candy, 1); assert.equal(result.participant.eyes, 4)
  assert.equal(result.wallet.bank, 70); assert.equal(result.inventory.length, 4)
  assert.equal(result.effects[0].metadata.ownedRole, true)
  assert.deepEqual(result.eligibleCharacters, ['had'])
  assert.deepEqual(Object.keys(result.wallet).sort(), ['bank', 'fate_points', 'user_id'])
  assert.equal(result.badgeOwnership, null)
  assert.equal(await f.models.Operation.count(), 0); assert.equal(await f.models.Ledger.count(), 0)
  assert.equal((await f.models.Participant.findByPk(player.id)).candy, 1)
  assert.equal((await f.inspect('player', { userId: 'missing' })).participant, null)
})
test('transaction inspection is scoped, filtered and cursor paginated without mutations', async t => {
  const f = await fixture(t)
  for (const key of ['first', 'second', 'third']) await f.run(key, async ctx => {
    await ctx.record({ userId: 'alice', resource: 'audit', delta: 0 }); return { key }
  })
  await f.run('foreign', async ctx => { await ctx.record({ userId: 'alice', resource: 'secret', delta: 0 }); return { secret: true } }, { guildId: 'foreign' })
  const one = await f.inspect('transactions', { userId: 'alice', limit: 2 })
  assert.equal(one.ledger.length, 2); assert.ok(one.operations.every(row => row.guildId === 'guild'))
  const two = await f.inspect('transactions', { limit: 2, beforeId: one.nextBeforeId })
  assert.equal(two.ledger.length, 1); assert.equal(two.nextBeforeId, null)
  assert.equal((await f.inspect('transactions', { userId: 'bob' })).ledger.length, 0)
  assert.equal(await f.models.Operation.count(), 4)
})
test('delivery inspection joins notification ownership before filtering and leaves ambiguous sends unchanged', async t => {
  const f = await fixture(t)
  const notifications = require('../services/spooky/notifications').createNotifications({ models: f.models })
  for (const [key, guildId] of [['ours', 'guild'], ['foreign', 'other']]) await f.run(key, async ctx => {
    await notifications.enqueue(ctx, 'channel', [{ public: true, payload: { content: key } }]); return {}
  }, { guildId })
  await f.models.Notification.update({ status: 'uncertain', lastError: 'timeout' }, { where: { operationId: 'discord:ours' } })
  await f.models.Delivery.create({ eventId: config.eventId, guildId: 'guild', userId: 'alice', kind: 'nickname',
    revision: 'discord:ours', payload: { expected: 'ecilA', nickname: 'Alice' }, status: 'conflict' })
  const result = await f.inspect('deliveries', { userId: 'alice', limit: 1 })
  assert.equal(result.notifications.length, 1); assert.equal(result.notifications[0].payload.content, 'ours')
  assert.equal(result.notifications[0].status, 'uncertain'); assert.equal(result.deliveries[0].status, 'conflict')
  assert.equal((await f.inspect('deliveries', { userId: 'bob' })).notifications.length, 0)
  assert.equal((await f.models.Notification.findOne({ where: { operationId: 'discord:ours' } })).status, 'uncertain')
  assert.equal((await f.inspect('deliveries', { beforeId: result.nextNotificationBeforeId })).notifications.length, 0)
})
test('read snapshot serializes with economy writes and survives failed reads', async t => {
  const f = await fixture(t)
  const order = []
  const write = f.run('write', async ctx => { order.push('write'); await ctx.record({ userId: 'alice', resource: 'audit', delta: 0 }); return {} })
  const read = f.economy.read(async transaction => { order.push('read'); assert.equal(await f.models.Ledger.count({ transaction }), 1) })
  await Promise.all([write, read]); assert.deepEqual(order, ['write', 'read'])
  await assert.rejects(() => f.economy.read(async () => { throw new Error('read failure') }), /read failure/)
  await f.inspect('config'); assert.equal(await f.models.Operation.count(), 1)
})
test('fresh member authorization permits administrators/configured role, rejects forged identities/bots and wrong guild', async () => {
  const calls = []
  let member = { id: 'admin', user: { bot: false }, permissions: { has: flag => flag === PermissionFlagsBits.Administrator }, roles: { cache: new Map() } }
  const client = { guilds: { fetch: async id => { calls.push(id); return { members: { fetch: async request => { assert.equal(request.force, true); return member } } } } } }
  assert.equal(await authorize(client, 'guild', 'admin', 'guild', 'role'), true)
  member.permissions.has = () => false; member.roles.cache.set('role', {})
  assert.equal(await authorize(client, 'guild', 'admin', 'guild', 'role'), true)
  member.user.bot = true; assert.equal(await authorize(client, 'guild', 'admin', 'guild', 'role'), false)
  member.user.bot = false; member.id = 'forged'; assert.equal(await authorize(client, 'guild', 'admin', 'guild', 'role'), false)
  const before = calls.length
  assert.equal(await authorize(client, 'other', 'admin', 'guild', 'role'), false); assert.equal(calls.length, before)
})
test('admin adapter defers privately, enforces channels, suppresses mentions and bounds pages', async () => {
  let calls = 0, reply
  const controller = createAdminController({ admin: { inspect: async () => { calls++; return { content: '@everyone ``` <@123>' } } }, allowedChannelIds: ['test'] })
  const interaction = { guildId: 'guild', channelId: 'wrong', user: { id: 'admin' },
    options: { getSubcommand: () => 'config', getUser: () => null, getInteger: () => null },
    deferReply: async payload => { assert.equal(payload.ephemeral, true); interaction.deferred = true }, editReply: async payload => { reply = payload } }
  await controller.execute(interaction); assert.equal(calls, 0)
  interaction.channelId = 'test'; await controller.execute(interaction)
  assert.equal(calls, 1); assert.deepEqual(reply.allowedMentions, { parse: [] })
  assert.ok(!reply.embeds[0].description.includes('``` <@'))
  const large = inspectionScreen('transactions', { text: 'x'.repeat(7000) }, 3)
  assert.ok(large.embeds[0].description.length <= 4096)
  assert.throws(() => inspectionScreen('config', {}, 2), /Page/)
  assert.deepEqual(command.data.toJSON().options.map(option => option.name), ['inspect', 'repair', 'event', 'queue'])
  assert.equal(command.data.toJSON().options.flatMap(group => group.options).length, 15)
  assert.equal(command.data.toJSON().default_member_permissions, String(PermissionFlagsBits.Administrator))
  assert.equal(command.data.toJSON().dm_permission, false)
  // The wired entry point rejects a DM before importing the real connection.
  const modelPath = require.resolve('../Models/model')
  assert.equal(require.cache[modelPath], undefined)
  await command.execute({ ...interaction, guildId: null })
  assert.ok(reply.embeds[0].title.includes('Access Denied'))
  assert.equal(require.cache[modelPath], undefined)
})

const controlInput = (id, values = {}) => ({ guildId: 'guild', actorId: 'admin', interactionId: id,
  action: 'clear-effect', userId: 'alice', effectType: 'curse', reason: 'Repair verified broken effect', ...values })
async function putEffect(f, player, effectType, metadata = {}) {
  return f.models.Effect.create({ participantId: player.id, effectType, expiresAt: new Date(config.endsAt), metadata })
}
test('all controls require fresh authorization/reasons and explicit validated intent', async t => {
  const denied = await fixture(t, false)
  for (const action of ['clear-effect', 'pause', 'reset-development']) await assert.rejects(() => denied.admin.control(controlInput('deny', { action })), /permission/)
  const f = await fixture(t)
  for (const values of [{ guildId: 'foreign' }, { reason: ' ' }, { reason: 'x'.repeat(501) }, { interactionId: '' },
    { userId: '' }, { effectType: 'unknown' }, { action: 'unknown' }, { action: 'pause', paused: 'yes' },
    { action: 'reset-development', confirm: false }]) await assert.rejects(() => f.admin.control(controlInput('invalid', values)))
  assert.equal(await f.models.Operation.count(), 0)
})
test('clear queues bot-owned role restoration before removing closed/disabled effects; replay retains one intent', async t => {
  const current = { nickname: null, roleIds: ['curse-role'] }, calls = []
  const f = await fixture(t, true, { event: { ...config, endsAt: '2026-10-02T07:00:00Z' }, roleIds: { curse: 'curse-role' },
    adapter: { getMember: async () => current, setRole: async (_guild, _user, role, present) => { calls.push(present); current.roleIds = present ? [role] : [] }, setNickname: async () => {} } })
  const player = await seed(f)
  await putEffect(f, player, 'curse', { botOwnedRole: true, roleId: 'curse-role' })
  const input = controlInput('clear')
  const result = await f.admin.control(input)
  assert.equal(result.receipt.effects[0].cleared, true); assert.equal(calls.length, 0)
  assert.equal(await f.models.Effect.count(), 0)
  const intent = await f.models.Delivery.findOne()
  assert.equal(intent.payload.present, false); assert.equal(intent.status, 'pending')
  await f.delivery.reconcile({ eventId: config.eventId, guildId: 'guild' }, { userId: 'alice' })
  assert.deepEqual(calls, [false])
  assert.equal((await f.admin.control(input)).replayed, true)
  assert.equal((await f.models.Delivery.findOne()).status, 'done')
  await assert.rejects(() => f.admin.control({ ...input, effectType: 'theft_protection' }), /replay identity/)
  assert.ok((await f.models.Ledger.findAll()).every(row => row.metadata.adminReason === input.reason))
})
test('unowned curse roles survive clearing; stale add intent is cancelled without any role writes', async t => {
  let writes = 0
  const f = await fixture(t, true, { adapter: { getMember: async () => ({ roleIds: ['curse-role'] }), setRole: async () => { writes++ } } })
  const player = await seed(f)
  await putEffect(f, player, 'curse', { botOwnedRole: false })
  await f.models.Delivery.create({ eventId: config.eventId, guildId: 'guild', userId: 'alice', kind: 'curse_role',
    revision: 'old', payload: { roleId: 'curse-role', present: true } })
  await f.admin.control(controlInput('unowned'))
  const row = await f.models.Delivery.findOne()
  assert.equal(row.status, 'cancelled')
  await f.delivery.reconcile({ eventId: config.eventId, guildId: 'guild' })
  assert.equal(writes, 0)
  const cancellation = await f.models.Ledger.findOne({ where: { resource: 'discord_intent:curse_role' } })
  assert.equal(cancellation.metadata.previousRevision, 'old')
  await row.update({ status: 'pending' })
  await f.admin.control(controlInput('orphan-curse'))
  assert.equal((await f.models.Delivery.findOne()).status, 'cancelled')
})
test('nickname clear restores null safely, preserves independent edits, and targeted reconciliation skips other users', async t => {
  const current = { nickname: 'ecilA', roleIds: [] }, writes = []
  const f = await fixture(t, true, { adapter: { getMember: async (_guild, user) => { assert.equal(user, 'alice'); return current },
    setNickname: async (_guild, _user, nickname) => { writes.push(nickname); current.nickname = nickname } } })
  const player = await seed(f)
  await putEffect(f, player, 'reversed_nickname', { originalNickname: null, appliedNickname: 'ecilA' })
  await f.models.Delivery.create({ eventId: config.eventId, guildId: 'guild', userId: 'bob', kind: 'nickname', revision: 'bob', payload: { nickname: 'Bob', expectedNickname: 'boB' } })
  await f.admin.control(controlInput('nickname', { effectType: 'reversed_nickname' }))
  await f.delivery.reconcile({ eventId: config.eventId, guildId: 'guild' }, { userId: 'alice' })
  assert.deepEqual(writes, [null])
  assert.equal((await f.models.Delivery.findOne({ where: { userId: 'bob' } })).status, 'pending')
  await putEffect(f, player, 'reversed_nickname', { originalNickname: 'Alice', appliedNickname: 'ecilA' })
  current.nickname = 'Independent edit'
  await f.admin.control(controlInput('conflict', { effectType: 'reversed_nickname' }))
  await f.delivery.reconcile({ eventId: config.eventId, guildId: 'guild' }, { userId: 'alice' })
  assert.equal((await f.models.Delivery.findOne({ where: { userId: 'alice' } })).status, 'conflict')
  assert.equal(current.nickname, 'Independent edit'); assert.equal(writes.length, 1)
})
test('bad restoration metadata/missing delivery rolls back; post-commit role failure stays retryable', async t => {
  const f = await fixture(t)
  const player = await seed(f)
  await putEffect(f, player, 'curse', { botOwnedRole: true, roleId: 'curse-role' })
  await assert.rejects(() => f.admin.control(controlInput('no-adapter')), /restoration delivery/)
  assert.equal(await f.models.Effect.count(), 1); assert.equal(await f.models.Ledger.count(), 0)
  let fail = true
  const other = await fixture(t, true, { roleIds: { curse: 'curse-role' }, adapter: {
    getMember: async () => ({ roleIds: ['curse-role'], nickname: 'ecilA' }),
    setRole: async () => { if (fail) throw new Error('permission'); }, setNickname: async () => {} } })
  const victim = await seed(other)
  await putEffect(other, victim, 'reversed_nickname', { appliedNickname: 'ecilA' })
  await assert.rejects(() => other.admin.control(controlInput('metadata', { effectType: 'reversed_nickname' })), /metadata/)
  assert.equal(await other.models.Delivery.count(), 0)
  await putEffect(other, victim, 'curse', { botOwnedRole: true, roleId: 'curse-role' })
  await other.admin.control(controlInput('retryable'))
  const scope = { eventId: config.eventId, guildId: 'guild' }
  await other.delivery.reconcile(scope, { userId: 'alice' })
  assert.equal((await other.models.Delivery.findOne()).status, 'pending')
  fail = false; await other.delivery.reconcile(scope, { userId: 'alice' })
  assert.equal((await other.models.Delivery.findOne()).status, 'done')
})
test('pause/resume is durable, replay-bound and blocks ordinary acquisition; archive never reopens', async t => {
  const f = await fixture(t)
  const player = await seed(f)
  const input = controlInput('pause', { action: 'pause', paused: true })
  await Promise.all([f.admin.control(input), f.admin.control(input)])
  assert.equal(await f.models.EventState.count(), 1)
  assert.equal(await f.models.Operation.count(), 1)
  const collection = require('../services/spooky/collection').createCollection({ models: f.models,
    participants: { prepare: async () => ({ participant: player }) }, event: config })
  await assert.rejects(() => f.run('blocked-draw', ctx => collection.drawQuarter(ctx, 'alice')), /paused/)
  await assert.rejects(() => f.admin.control({ ...input, paused: false }), /replay identity/)
  const resumed = await f.admin.control(controlInput('resume', { action: 'pause', paused: false }))
  assert.equal(resumed.receipt.state.actionsPaused, false)
  assert.equal(resumed.receipt.state.pauseReason, null)
  assert.equal(config.enabled, false)
  await f.models.EventState.update({ archivedAt: new Date() }, { where: { eventId: config.eventId, guildId: 'guild' } })
  await assert.rejects(() => f.admin.control(controlInput('archived-pause', { action: 'pause', paused: false })), /Archived/)
})
test('development reset rejects production/test/wrong storage and missing confirmation without deletion', async t => {
  for (const options of [{ environment: 'production', developmentStorage: ':memory:' }, { environment: 'test', developmentStorage: ':memory:' },
    { environment: 'development', developmentStorage: 'config/prod.sqlite' }]) {
    const f = await fixture(t, true, options)
    await seed(f)
    await assert.rejects(() => f.admin.control(controlInput('reset', { action: 'reset-development', confirm: true })), /development database/)
    assert.equal(await f.models.Participant.count(), 1); assert.equal(await f.models.Operation.count(), 0)
  }
})
test('development reset preserves wallet/permanent sentinel/audit/other scopes, cancels pending awards and reports ambiguity', async t => {
  const f = await fixture(t, true, { environment: 'development', developmentStorage: ':memory:', roleIds: { curse: 'curse-role' },
    adapter: { getMember: async () => ({ roleIds: ['curse-role'], nickname: 'ecilA' }), setRole: async () => {}, setNickname: async () => {} } })
  const player = await seed(f, { candy: 20, eyes: 3, treatPrestige: -2, trickPrestige: 4 })
  await seed(f, { userId: 'bob' }); await seed(f, { guildId: 'other' })
  await f.User.create({ user_id: 'alice', user_name: 'Alice', bank: 70, fate_points: 15 })
  await f.sequelize.query('CREATE TABLE PermanentBadgeSentinel (owner TEXT PRIMARY KEY)')
  await f.sequelize.query("INSERT INTO PermanentBadgeSentinel VALUES ('alice')")
  await f.models.Inventory.create({ participantId: player.id, pieceId: 'had_tl', quantity: 2 })
  await putEffect(f, player, 'curse', { botOwnedRole: true, roleId: 'curse-role' })
  await putEffect(f, player, 'reversed_nickname', { originalNickname: 'Alice', appliedNickname: 'ecilA' })
  await putEffect(f, player, 'theft_protection')
  await f.models.Delivery.create({ eventId: config.eventId, guildId: 'guild', userId: 'alice', kind: 'sweet_tooth_role', revision: 'old', payload: { roleId: 'sweet', present: true } })
  const notifications = require('../services/spooky/notifications').createNotifications({ models: f.models })
  for (const key of ['pending', 'uncertain']) await f.run(key, async ctx => {
    await ctx.record({ userId: 'alice', resource: 'history', delta: 0 })
    await notifications.enqueue(ctx, 'channel', [{ public: true, payload: { content: key } }]); return {}
  })
  await f.models.Notification.update({ status: 'uncertain' }, { where: { operationId: 'discord:uncertain' } })
  const result = await f.admin.control(controlInput('reset-ok', { action: 'reset-development', confirm: true }))
  assert.equal(result.receipt.effects.length, 3)
  assert.equal(result.receipt.cancelledNotifications.length, 1); assert.equal(result.receipt.ambiguousNotifications.length, 1)
  assert.equal(await f.models.Inventory.count(), 0); assert.equal(await f.models.Effect.count(), 0)
  assert.equal(await f.models.Participant.count(), 2)
  assert.equal((await f.User.findByPk('alice')).bank, 70)
  assert.equal((await f.sequelize.query('SELECT * FROM PermanentBadgeSentinel'))[0].length, 1)
  assert.equal(await f.models.Operation.count(), 3)
  assert.equal((await f.models.Delivery.findOne({ where: { kind: 'sweet_tooth_role' } })).status, 'cancelled')
  assert.equal((await f.models.Delivery.findOne({ where: { kind: 'curse_role' } })).payload.present, false)
  const ledger = await f.models.Ledger.findAll({ where: { operationId: result.operationId } })
  assert.ok(ledger.every(row => row.metadata.adminReason === 'Repair verified broken effect'))
  let sends = 0
  const cancelled = await notifications.deliver('discord:pending', { id: 'channel', send: async () => { sends++ } })
  assert.equal(cancelled.allSent, false)
  assert.equal(sends, 0)
  await seed(f)
  assert.equal((await f.admin.control(controlInput('reset-ok', { action: 'reset-development', confirm: true }))).replayed, true)
  assert.equal(await f.models.Participant.count(), 3)
})
test('failed reset restoration rolls back the entire participant, inventory, effects and projection changes', async t => {
  const f = await fixture(t, true, { environment: 'development', developmentStorage: ':memory:',
    delivery: { enqueue: async () => { throw new Error('projection failure') } }, roleIds: { curse: 'curse-role' } })
  const player = await seed(f)
  await f.models.Inventory.create({ participantId: player.id, pieceId: 'had_tl', quantity: 1 })
  await putEffect(f, player, 'theft_protection')
  await putEffect(f, player, 'curse', { botOwnedRole: true, roleId: 'curse-role' })
  await assert.rejects(() => f.admin.control(controlInput('reset-fail', { action: 'reset-development', confirm: true })), /projection failure/)
  assert.equal(await f.models.Participant.count(), 1); assert.equal(await f.models.Inventory.count(), 1)
  assert.equal(await f.models.Effect.count(), 2); assert.equal(await f.models.Ledger.count(), 0)
  await f.models.Delivery.create({ eventId: config.eventId, guildId: 'guild', userId: 'alice', kind: 'nickname',
    revision: 'orphan', payload: { nickname: 'ecilA', expectedNickname: 'Alice' } })
  await assert.rejects(() => f.admin.control(controlInput('orphan-reset', { action: 'reset-development', confirm: true })), /requires inspection/)
  await assert.rejects(() => f.admin.control(controlInput('orphan-clear', { effectType: 'reversed_nickname' })), /requires inspection/)
  assert.equal(await f.models.Participant.count(), 1); assert.equal(await f.models.Inventory.count(), 1)
})
test('control adapter defers privately and reconciles only after commit with the trusted target scope', async () => {
  const calls = [], replies = []
  const scope = { eventId: config.eventId, guildId: 'guild' }
  const controller = createAdminController({ allowedChannelIds: ['channel'], scope,
    admin: { control: async input => { calls.push('commit'); assert.equal(input.effectType, 'curse'); return { operationId: 'saved', receipt: { effects: [{ cleared: true }] } } },
      inspect: async () => { throw new Error('wrong path') } },
    delivery: { reconcile: async (actual, target) => { calls.push('reconcile'); assert.deepEqual(actual, scope); assert.equal(target.userId, 'alice'); return [{ kind: 'curse_role', status: 'pending' }] } } })
  const interaction = { id: 'command', guildId: 'guild', channelId: 'channel', user: { id: 'admin' },
    options: { getSubcommand: () => 'clear-effect', getUser: () => ({ id: 'alice' }), getString: name => name === 'effect' ? 'curse' : 'Repair reason' },
    deferReply: async value => { assert.equal(value.ephemeral, true); calls.push('defer') }, editReply: async payload => replies.push(payload) }
  await controller.execute(interaction)
  assert.deepEqual(calls, ['defer', 'commit', 'reconcile'])
  assert.ok(replies[0].embeds[0].title.includes('Control Saved'))
  assert.ok(replies[0].embeds[0].description.includes('pending'))
})

async function seed(f, values = {}) {
  return f.models.Participant.create({ eventId: config.eventId, guildId: 'guild', userId: 'alice', candy: 10, eyes: 0,
    registeredAt: new Date(config.startsAt), refillAnchor: new Date(config.startsAt), ...values })
}
const repairInput = (id, values = {}) => ({ guildId: 'guild', actorId: 'admin', interactionId: id,
  userId: 'alice', action: 'balance', resource: 'candy', delta: 1, reason: 'Fix verified incorrect reward', ...values })

test('every repair requires fresh authorization, exact scope, a reason and bounded validated input', async t => {
  const denied = await fixture(t, false)
  for (const action of ['balance', 'grant-quarter', 'remove-quarter']) await assert.rejects(() => denied.admin.repair(repairInput('deny', { action })), /permission/)
  const f = await fixture(t)
  for (const values of [{ guildId: 'other' }, { reason: '  ' }, { reason: 'x'.repeat(501) }, { interactionId: '' },
    { userId: '' }, { resource: 'bank' }, { delta: 0 }, { delta: 1.5 }, { delta: 81 }, { resource: 'eyes', delta: 101 },
    { action: 'unknown' }, { action: 'grant-quarter', pieceId: 'invalid' }, { action: 'remove-quarter', pieceId: 'had_tl', allowLastCopy: 'yes' }]) {
    await assert.rejects(() => f.admin.repair(repairInput('invalid', values)))
  }
  await assert.rejects(() => f.admin.repair(repairInput('missing')), /existing seasonal/)
  assert.equal(await f.models.Operation.count(), 0); assert.equal(await f.models.Ledger.count(), 0)
})

test('candy corrections are bounded stored deltas, preserve partial anchors and discard full-cap surplus', async t => {
  const f = await fixture(t)
  const player = await seed(f, { candy: 80, registeredAt: null })
  await f.User.create({ user_id: 'alice', user_name: 'Alice', bank: 80, fate_points: 25 })
  const result = await f.admin.repair(repairInput('subtract', { delta: -1 }))
  assert.equal(result.receipt.candy, 79)
  let fresh = await f.models.Participant.findByPk(player.id)
  assert.equal(fresh.registeredAt, null)
  assert.equal(fresh.refillAnchor.toISOString(), '2026-10-10T12:00:00.000Z')
  const anchor = fresh.refillAnchor.toISOString()
  await f.admin.repair(repairInput('partial', { delta: -2 }))
  fresh = await f.models.Participant.findByPk(player.id)
  assert.equal(fresh.refillAnchor.toISOString(), anchor)
  await assert.rejects(() => f.admin.repair(repairInput('overflow', { delta: 4 })), /bounds/)
  await assert.rejects(() => f.admin.repair(repairInput('negative', { delta: -80 })), /bounds/)
  assert.equal((await f.User.findByPk('alice')).bank, 80)
  const rows = await f.models.Ledger.findAll()
  assert.ok(rows.every(row => row.metadata.adminReason === 'Fix verified incorrect reward' && row.actorId === 'admin'))
  assert.equal(await f.models.Operation.count(), 2)
})

test('Eye correction converts at five atomically, concurrent replay never rerolls and altered payloads reject', async t => {
  let rolls = 0
  const f = await fixture(t, true, { random: () => { rolls++; return 0 } })
  await seed(f, { eyes: 4 })
  const input = repairInput('eyes', { resource: 'eyes' })
  const results = await Promise.all(Array.from({ length: 8 }, () => f.admin.repair(input)))
  assert.equal(results.filter(result => !result.replayed).length, 1); assert.equal(rolls, 2)
  assert.equal(results[0].receipt.eyes, 0); assert.equal(results[0].receipt.result.awards.length, 1)
  assert.equal(await f.models.Inventory.count(), 1)
  for (const changed of [{ userId: 'bob' }, { delta: 2 }, { reason: 'different reason' }, { channelId: 'new' }]) {
    await assert.rejects(() => f.admin.repair({ ...input, ...changed }), /replay identity/)
  }
  const ledger = await f.models.Ledger.findAll()
  assert.ok(ledger.every(row => row.metadata.adminReason === input.reason))
  assert.equal(await f.models.Operation.count(), 1)
  await f.admin.repair(repairInput('eye-negative', { resource: 'eyes', delta: 1 }))
  await f.admin.repair(repairInput('eye-debit', { resource: 'eyes', delta: -1 }))
  await assert.rejects(() => f.admin.repair(repairInput('eye-underflow', { resource: 'eyes', delta: -1 })), /bounds/)
})

test('grant correction exchanges exactly five extras, keeps first copies and replays one grant', async t => {
  const f = await fixture(t, true, { random: () => 0 })
  const player = await seed(f)
  await f.models.Inventory.create({ participantId: player.id, pieceId: 'had_tl', quantity: 5 })
  const input = repairInput('grant', { action: 'grant-quarter', pieceId: 'had_tl' })
  const result = await f.admin.repair(input)
  assert.equal(result.receipt.result.awards.length, 2)
  assert.equal(result.receipt.result.awards[1].source, 'duplicate_exchange')
  assert.equal(result.receipt.result.duplicates, 0)
  assert.equal((await f.models.Inventory.findOne({ where: { participantId: player.id, pieceId: 'had_tl' } })).quantity, 1)
  const replay = await f.admin.repair(input)
  assert.equal(replay.replayed, true); assert.deepEqual(replay.receipt, result.receipt)
  const rows = await f.models.Ledger.findAll()
  assert.ok(rows.every(row => row.metadata.adminReason === input.reason))
})

test('quarter removal corrects one copy only; only-copy removal requires explicit intent and changes eligibility', async t => {
  const f = await fixture(t)
  const player = await seed(f)
  for (const piece of pieces.filter(piece => piece.characterId === 'had')) await f.models.Inventory.create({ participantId: player.id, pieceId: piece.id, quantity: 1 })
  const input = repairInput('remove', { action: 'remove-quarter', pieceId: 'had_br' })
  await assert.rejects(() => f.admin.repair(input), /only copy/)
  assert.equal(await f.models.Operation.count(), 0)
  const result = await f.admin.repair({ ...input, allowLastCopy: true })
  assert.equal(result.receipt.result.ownedPieces, 3); assert.deepEqual(result.receipt.result.completeCharacters, [])
  assert.equal(result.receipt.result.awards.length, 0)
  assert.equal(result.receipt.badgeOwnership, null) // This isolated fixture has no badge service.
  assert.equal((await f.admin.repair({ ...input, allowLastCopy: true })).replayed, true)
  await assert.rejects(() => f.admin.repair({ ...input, allowLastCopy: false }), /replay identity/)
  const ledger = await f.models.Ledger.findOne()
  assert.equal(ledger.before, 1); assert.equal(ledger.after, 0); assert.equal(ledger.metadata.removedLastCopy, true)
  await f.models.Inventory.update({ quantity: 2 }, { where: { participantId: player.id, pieceId: 'had_tl' } })
  const duplicate = await f.admin.repair(repairInput('extra-remove', { action: 'remove-quarter', pieceId: 'had_tl' }))
  assert.equal(duplicate.receipt.result.ownedPieces, 3)
})

test('repair finalization/RNG failure rolls back debit, grant, exchange and audit; retry succeeds', async t => {
  let fail = true
  const f = await fixture(t, true, { random: () => 0, finalizeRepair: async (_ctx, receipt) => {
    if (fail) throw new Error('outbox failure'); return receipt
  } })
  const player = await seed(f, { eyes: 4 })
  const input = repairInput('rollback', { resource: 'eyes' })
  await assert.rejects(() => f.admin.repair(input), /outbox failure/)
  assert.equal((await f.models.Participant.findByPk(player.id)).eyes, 4)
  assert.equal(await f.models.Inventory.count(), 0); assert.equal(await f.models.Ledger.count(), 0); assert.equal(await f.models.Operation.count(), 0)
  fail = false; await f.admin.repair(input)
  assert.equal((await f.models.Participant.findByPk(player.id)).eyes, 0)
  const other = await fixture(t, true, { random: () => { throw new Error('rng failure') } })
  const victim = await seed(other)
  await other.models.Inventory.create({ participantId: victim.id, pieceId: 'had_tl', quantity: 5 })
  await assert.rejects(() => other.admin.repair(repairInput('grant-rollback', { action: 'grant-quarter', pieceId: 'had_tl' })), /rng failure/)
  assert.equal((await other.models.Inventory.findOne()).quantity, 5)
  assert.equal(await other.models.Ledger.count(), 0)
})

test('repairs bypass disabled/pause only, never closure/archive or required registration', async t => {
  const f = await fixture(t)
  const player = await seed(f)
  await f.models.EventState.create({ eventId: config.eventId, guildId: 'guild', actionsPaused: true, configVersion: config.version })
  await f.admin.repair(repairInput('paused-grant', { action: 'grant-quarter', pieceId: 'had_tl' }))
  assert.equal(config.enabled, false)
  await player.update({ registeredAt: null })
  await assert.rejects(() => f.admin.repair(repairInput('not-registered', { resource: 'eyes' })), /registration/)
  await f.models.EventState.update({ archivedAt: new Date() }, { where: { eventId: config.eventId, guildId: 'guild' } })
  await assert.rejects(() => f.admin.repair(repairInput('archived')), /archived/)
  const closed = await fixture(t, true, { event: { ...config, endsAt: '2026-10-02T07:00:00Z', redemptionEndsAt: '2026-10-02T07:00:00Z' } })
  await seed(closed)
  await assert.rejects(() => closed.admin.repair(repairInput('closed')), /October interval/)
  assert.equal(await closed.models.Operation.count(), 0)
})

test('repair adapter queues big awards for the player, keeps reasons private and survives public send failure/replay', async t => {
  const { repairAwardMessages } = require('../services/spooky/admin-command')
  let notifications
  const f = await fixture(t, true, { random: () => 0, finalizeRepair: async (ctx, receipt, input) => {
    const messages = repairAwardMessages(receipt, input.displayName)
    await notifications.enqueue(ctx, input.channelId, messages); return { ...receipt, messages }
  } })
  notifications = require('../services/spooky/notifications').createNotifications({ models: f.models })
  await seed(f, { eyes: 4 })
  const replies = [], sent = []
  const controller = createAdminController({ admin: f.admin, allowedChannelIds: ['channel'], notifications })
  const interaction = { id: 'ui-repair', guildId: 'guild', channelId: 'channel', user: { id: 'admin' },
    channel: { id: 'channel', send: async payload => { sent.push(payload); throw new Error('timeout') } },
    options: { getSubcommand: () => 'adjust', getUser: () => ({ id: 'alice', username: 'Alice' }),
      getString: name => ({ resource: 'eyes', reason: 'Private correction reason' })[name], getInteger: () => 1 },
    deferReply: async payload => { assert.equal(payload.ephemeral, true); interaction.deferred = true }, editReply: async payload => replies.push(payload) }
  await controller.execute(interaction)
  assert.equal(sent.length, 1); assert.equal(sent[0].content, '<@alice>')
  assert.deepEqual(sent[0].allowedMentions.users, ['alice'])
  assert.ok(sent[0].embeds[0].description.includes('Alice collected'))
  assert.ok(!JSON.stringify(sent[0]).includes('Private correction reason'))
  assert.ok(replies.at(-1).embeds[0].title.includes('Repair Saved'))
  await controller.execute(interaction)
  assert.equal(sent.length, 1); assert.equal(await f.models.Operation.count(), 1)
  assert.equal((await f.models.Notification.findOne()).status, 'uncertain')
  assert.equal((await f.models.Participant.findOne()).eyes, 0)
})
