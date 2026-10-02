const test = require('node:test')
const assert = require('node:assert/strict')
const Sequelize = require('sequelize')
const { config } = require('../services/spooky/config')
const { createAdmin } = require('../services/spooky/admin')
const { createAdminController } = require('../services/spooky/admin-command')
async function fixture(t, options = {}) {
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => sequelize.close())
  for (const [stamp, name] of [['000000', 'core'], ['000001', 'delivery'], ['000002', 'notifications']]) {
    await require(`../migrations/20261001${stamp}-create-spooky-${name}`).up(sequelize.getQueryInterface())
  }
  const models = require('../services/spooky/models').defineSpookyModels(sequelize)
  const economy = require('../services/spooky/economy').createEconomy({ sequelize, models, configVersion: config.version, clock: () => new Date('2026-10-10T12:00:00Z') })
  const admin = createAdmin({ sequelize, models, economy, User: { sequelize }, event: config,
    environment: 'test', guildId: 'guild', authorize: async () => true, ...options })
  const notifications = require('../services/spooky/notifications').createNotifications({ models })
  const run = (key, callback, extra = {}) => economy.execute({ eventId: config.eventId, guildId: 'guild', actorId: 'alice', interactionId: key, operationType: 'fixture', ...extra }, callback)
  const notify = async (key, status = 'uncertain', extra = {}) => {
    const operation = await run(key, async ctx => { await notifications.enqueue(ctx, 'source', [{ public: true,
      payload: { content: 'reward', embeds: [{ title: 'Quarter', color: 255 }] } }]); return {} }, extra)
    const row = await models.Notification.findOne({ where: { operationId: operation.operationId } })
    await row.update({ status }); return row
  }
  return { sequelize, models, economy, admin, notifications, run, notify }
}
const input = (row, action = 'cancel', extra = {}) => ({ guildId: 'guild', actorId: 'admin', interactionId: `resolve-${row.id}-${action}`,
  target: 'notification', id: row.id, action, expectedStatus: row.status, confirm: true, reason: 'Verified operator decision', ...extra })
const messageId = '123456789012345678'
const evidence = { id: messageId, guildId: 'guild', channelId: 'source', isBotMessage: true,
  content: 'reward', embeds: [{ title: 'Quarter', color: 255, type: 'rich' }] }
test('token notification sends local files from durable descriptors and acknowledges fresh attachment evidence', async t => {
  let observed
  const f = await fixture(t, { readMessage: async () => observed })
  const row = await f.notify('token-art', 'pending')
  await row.update({ payload: { content: 'reward', embeds: [{ title: 'Quarter', image: { url: 'attachment://mrq_tr_bl.png' } }],
    files: [{ tokenAsset: 'mrq_tr_bl.png', name: 'mrq_tr_bl.png' }] } })
  await f.notifications.deliver(row.operationId, { id: 'source', send: async payload => {
    assert.ok(require('node:fs').existsSync(payload.files[0].attachment))
    assert.equal(payload.files[0].name, 'mrq_tr_bl.png')
    assert.equal(payload.files[0].tokenAsset, undefined)
    throw new Error('ambiguous send')
  } }).catch(error => assert.match(error.message, /ambiguous send/))
  await row.reload()
  assert.equal(row.status, 'uncertain')
  observed = { ...evidence, embeds: [{ title: 'Quarter', image: { url: 'https://cdn.discordapp.com/token.png' } }],
    attachments: [{ name: 'wrong.png', url: 'https://cdn.discordapp.com/token.png' }] }
  await assert.rejects(() => f.admin.resolve(input(row, 'acknowledge', { messageId })), /evidence/)
  observed.attachments[0].name = 'mrq_tr_bl.png'
  await f.admin.resolve(input(row, 'acknowledge', { messageId }))
  await row.reload()
  assert.equal(row.status, 'sent')
  assert.equal(row.payload.files[0].tokenAsset, 'mrq_tr_bl.png')
})
async function projection(f, values = {}) {
  return f.models.Delivery.create({ eventId: config.eventId, guildId: 'guild', userId: 'alice', kind: 'nickname',
    revision: 'source-revision', status: 'conflict', payload: { nickname: 'Alice', expectedNickname: 'ecilA' }, ...values })
}
test('resolution is authorized, owner scoped and explicitly validated without touching resources', async t => {
  const denied = await fixture(t, { authorize: async () => false })
  await assert.rejects(() => denied.admin.resolve(input({ id: 1, status: 'uncertain' })), /permission/)
  const f = await fixture(t)
  const foreign = await f.notify('foreign', 'uncertain', { guildId: 'foreign' })
  await assert.rejects(() => f.admin.resolve(input(foreign)), /scope/)
  const row = await f.notify('ours')
  for (const change of [{ guildId: 'other' }, { confirm: false }, { id: 0 }, { reason: '' }, { interactionId: '' },
    { expectedStatus: 'sent' }, { action: 'retry' }, { action: 'acknowledge' }, { action: 'unknown' }]) await assert.rejects(() => f.admin.resolve(input(row, 'cancel', change)))
  assert.equal(await f.models.Participant.count(), 0); assert.equal(await f.models.Ledger.count(), 0)
})
test('acknowledgement requires fresh matching bot message evidence; replay needs no new evidence and rejects changed requests', async t => {
  let value = { ...evidence, isBotMessage: false }, reads = 0
  const f = await fixture(t, { readMessage: async request => { reads++; assert.equal(request.channelId, 'source'); return value } })
  const row = await f.notify('ack')
  const wanted = input(row, 'acknowledge', { messageId })
  await assert.rejects(() => f.admin.resolve(wanted), /evidence/)
  value = { ...evidence, content: 'wrong' }; await assert.rejects(() => f.admin.resolve(wanted), /evidence/)
  value = evidence
  const result = await f.admin.resolve(wanted)
  assert.equal((await row.reload()).status, 'sent'); assert.equal(row.messageId, messageId)
  const before = reads
  assert.equal((await f.admin.resolve(wanted)).replayed, true); assert.equal(reads, before)
  await assert.rejects(() => f.admin.resolve({ ...wanted, reason: 'changed' }), /replay identity/)
  assert.equal(result.receipt.resourcesUnchanged, true)
  assert.equal((await f.models.Ledger.findOne()).metadata.adminReason, wanted.reason)
})
test('pending retry sends one selected row only; uncertain resend creates an audited copy without rerolling', async t => {
  const f = await fixture(t, { environment: 'development', developmentStorage: ':memory:' })
  const row = await f.notify('pending', 'pending')
  await f.models.Notification.create({ operationId: row.operationId, ordinal: 1, channelId: 'source', payload: {}, status: 'uncertain' })
  const retry = await f.admin.resolve(input(row, 'retry'))
  const sent = []
  const channel = { id: 'source', send: async payload => { sent.push(payload); return { id: messageId } } }
  await f.notifications.deliver(retry.receipt.dispatch.operationId, channel, { notificationId: row.id })
  assert.equal(sent.length, 1)
  const uncertain = await f.notify('ambiguous')
  const wanted = input(uncertain, 'resend')
  const result = await f.admin.resolve(wanted)
  assert.equal((await uncertain.reload()).status, 'cancelled')
  assert.notEqual(result.receipt.dispatch.operationId, uncertain.operationId)
  await f.notifications.deliver(result.operationId, channel, { notificationId: result.receipt.dispatch.notificationId })
  await f.notifications.deliver(result.operationId, channel, { notificationId: result.receipt.dispatch.notificationId })
  assert.equal(sent.length, 2); assert.notEqual(sent[0].nonce, sent[1].nonce)
  assert.equal((await f.admin.resolve(wanted)).replayed, true)
  assert.equal(await f.models.Inventory.count(), 0)
  assert.ok((await f.models.Ledger.findAll()).every(entry => entry.delta === 0))
  const after = await f.notify('resend-reset')
  const queued = await f.admin.resolve(input(after, 'resend'))
  assert.equal(queued.receipt.notificationOwnerUserId, 'alice')
  const queuedRow = await f.models.Notification.findByPk(queued.receipt.dispatch.notificationId)
  await queuedRow.update({ status: 'uncertain' })
  const chained = await f.admin.resolve(input(queuedRow, 'resend'))
  assert.equal(chained.receipt.notificationOwnerUserId, 'alice')
  await f.models.Participant.create({ eventId: config.eventId, guildId: 'guild', userId: 'alice', refillAnchor: new Date(config.startsAt), registeredAt: new Date(config.startsAt) })
  await f.admin.control({ guildId: 'guild', actorId: 'admin', interactionId: 'reset-resend', action: 'reset-development',
    userId: 'alice', confirm: true, reason: 'Reset testing participant' })
  assert.equal((await f.models.Notification.findByPk(queued.receipt.dispatch.notificationId)).status, 'cancelled')
  assert.equal((await f.models.Notification.findByPk(chained.receipt.dispatch.notificationId)).status, 'cancelled')
})
test('stale evidence rejects resolution; late send failure cannot undo an audited in-flight cancellation', async t => {
  let f, row
  f = await fixture(t, { readMessage: async () => { await row.update({ status: 'sent', messageId }); return evidence } })
  row = await f.notify('stale')
  await assert.rejects(() => f.admin.resolve(input(row, 'acknowledge', { messageId })), /changed/)
  assert.equal(await f.models.Ledger.count(), 0)
  const live = await f.notify('live', 'pending')
  await assert.rejects(() => f.notifications.deliver(live.operationId, { id: 'source', send: async () => {
    await f.admin.resolve(input({ id: live.id, status: 'sending' }))
    throw new Error('late timeout')
  } }), /late timeout/)
  assert.equal((await live.reload()).status, 'cancelled'); assert.equal(live.lastError, null)
})
test('projection acknowledgement verifies observed state and cancellation invalidates the old revision', async t => {
  let current = { nickname: 'other', roleIds: [] }
  const f = await fixture(t, { readMember: async () => current })
  const row = await projection(f)
  const wanted = input(row, 'acknowledge', { target: 'delivery', expectedRevision: row.revision })
  await assert.rejects(() => f.admin.resolve(wanted), /does not match/)
  current = { nickname: 'Alice', roleIds: [] }
  await f.admin.resolve(wanted)
  assert.equal((await row.reload()).status, 'done'); assert.notEqual(row.revision, wanted.expectedRevision)
  const other = await projection(f, { userId: 'bob' })
  await f.admin.resolve(input(other, 'cancel', { target: 'delivery', expectedRevision: other.revision }))
  assert.equal((await other.reload()).status, 'cancelled')
})
test('independent nickname changes and orphaned applications cannot retry; cancellation safely unblocks inspection/reset', async t => {
  let current = { nickname: 'Independent', roleIds: [] }
  const f = await fixture(t, { readMember: async () => current })
  const row = await projection(f)
  const wanted = input(row, 'retry', { target: 'delivery', expectedRevision: row.revision })
  await assert.rejects(() => f.admin.resolve(wanted), /Independent/)
  current = { nickname: 'ecilA', roleIds: [] }
  await assert.rejects(() => f.admin.resolve(wanted), /orphaned/)
  await f.admin.resolve({ ...wanted, action: 'cancel', interactionId: 'cancel-orphan' })
  assert.equal((await row.reload()).status, 'cancelled')
})
test('audited restoration retries after closure, retains source revision and reconciles only its selected row', async t => {
  const current = { nickname: 'ecilA', roleIds: [] }, writes = []
  const f = await fixture(t, { event: { ...config, endsAt: '2026-10-02T07:00:00Z', redemptionEndsAt: '2026-10-02T07:00:00Z' }, readMember: async () => current })
  const origin = await f.run('restore-source', async ctx => {
    await ctx.record({ userId: 'alice', resource: 'effect:reversed_nickname', delta: -1, before: 1, after: 0 }); return {}
  })
  const row = await projection(f, { revision: origin.operationId })
  const unrelated = await projection(f, { userId: 'bob', status: 'pending' })
  const result = await f.admin.resolve(input(row, 'retry', { target: 'delivery', expectedRevision: row.revision }))
  const delivery = require('../services/spooky/delivery').createDelivery({ models: f.models, adapter: {
    getMember: async (_guild, user) => { assert.equal(user, 'alice'); return current },
    setNickname: async (_guild, _user, nickname) => { writes.push(nickname); current.nickname = nickname },
  } })
  await delivery.reconcile({ eventId: config.eventId, guildId: 'guild' }, result.receipt.dispatch)
  assert.deepEqual(writes, ['Alice']); assert.equal((await row.reload()).revision, origin.operationId)
  assert.equal((await unrelated.reload()).status, 'pending')
})
test('resolution adapter stays private, commits before dispatch and uses the saved source channel/row', async () => {
  const calls = [], replies = []
  const controller = createAdminController({ allowedChannelIds: ['test'], admin: { resolve: async input => {
    assert.equal(input.target, 'notification'); assert.equal(input.confirm, true); calls.push('commit')
    return { operationId: 'resolution', receipt: { dispatch: { operationId: 'original', notificationId: 4, channelId: 'source' }, resourcesUnchanged: true } }
  } }, fetchChannel: async id => { assert.equal(id, 'source'); calls.push('fetch'); return { id } },
  notifications: { deliver: async (id, _channel, options) => { assert.equal(id, 'original'); assert.equal(options.notificationId, 4); calls.push('send'); return { allSent: true } } } })
  await controller.execute({ id: 'interaction', guildId: 'guild', channelId: 'test', user: { id: 'admin' },
    options: { getSubcommand: () => 'resolve-notification', getInteger: () => 4, getBoolean: () => true,
      getString: name => ({ action: 'retry', status: 'pending', reason: 'Confirmed no prior send' })[name] },
    deferReply: async value => { assert.equal(value.ephemeral, true); calls.push('private') }, editReply: async value => replies.push(value) })
  assert.deepEqual(calls, ['private', 'commit', 'fetch', 'send'])
  assert.deepEqual(replies[0].allowedMentions, { parse: [] })
})
