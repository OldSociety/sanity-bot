const test = require('node:test')
const assert = require('node:assert/strict')
const Sequelize = require('sequelize')
const { config, pieces } = require('../services/spooky/config')
const { createAdmin } = require('../services/spooky/admin')
async function fixture(t, options = {}) {
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => sequelize.close())
  const User = require('../Models/User/User')(sequelize, Sequelize.DataTypes)
  await User.sync()
  for (const name of ['20261001000000-create-spooky-core', '20261001000001-create-spooky-delivery', '20261001000002-create-spooky-notifications', '20261001000003-create-permanent-badges']) await require(`../migrations/${name}`).up(sequelize.getQueryInterface())
  const models = require('../services/spooky/models').defineSpookyModels(sequelize)
  const badges = require('../services/badges').createBadges({ sequelize })
  let now = new Date('2026-10-10T12:00:00Z'), permitted = true, fail = false
  const economy = require('../services/spooky/economy').createEconomy({ sequelize, models, configVersion: config.version, clock: () => now })
  const notifications = require('../services/spooky/notifications').createNotifications({ models })
  const admin = createAdmin({ sequelize, models, User, badges, economy, guildId: 'guild', event: config,
    environment: 'development', developmentStorage: ':memory:', authorize: async () => permitted,
    finalizeRepair: async (ctx, receipt, input) => {
      const messages = require('../services/spooky/admin-command').repairAwardMessages(receipt, 'Alice')
      await notifications.enqueue(ctx, input.channelId, messages)
      if (fail) throw new Error('Injected enqueue rollback')
      return { ...receipt, messages }
    }, ...options })
  await User.create({ user_id: 'alice', user_name: 'Alice', bank: 70, fate_points: 20 })
  const player = await models.Participant.create({ eventId: config.eventId, guildId: 'guild', userId: 'alice', candy: 17, eyes: 4,
    registeredAt: new Date('2026-10-02T12:00:00Z'), refillAnchor: now, treatPrestige: 8, trickPrestige: 2 })
  for (const piece of pieces.filter(p => p.characterId === 'sel')) await models.Inventory.create({ participantId: player.id, pieceId: piece.id, quantity: 2 })
  const input = { guildId: 'guild', actorId: 'admin', userId: 'alice', interactionId: 'repair', confirm: true, reason: 'Missed award', channelId: 'channel' }
  return { models, badges, admin, User, player, input, notifications, recompute: extra => admin.recomputeBadges({ ...input, ...extra }),
    time: value => { now = new Date(value) }, permit: value => { permitted = value }, fail: value => { fail = value } }
}
test('recompute awards once atomically, audits private reason and queues only new public completion', async t => {
  const f = await fixture(t)
  const before = (await f.player.reload()).get({ plain: true })
  const [first, replay] = await Promise.all([f.recompute(), f.recompute()])
  assert.equal(first.replayed, false); assert.equal(replay.replayed, true)
  assert.deepEqual(first.receipt.result.newlyAwardedBadges, ['spooky-2026:sel'])
  assert.deepEqual((await f.player.reload()).get({ plain: true }), before)
  assert.equal((await f.User.findByPk('alice')).bank, 70)
  assert.equal(await f.models.Inventory.sum('quantity'), 8)
  assert.equal(await f.models.Notification.count(), 1)
  const payload = (await f.models.Notification.findOne()).payload
  assert.deepEqual(payload.allowedMentions.users, ['alice'])
  assert.equal(JSON.stringify(payload).includes('Missed award'), false)
  const audit = await f.models.Ledger.findOne({ where: { resource: 'badge_eligibility_recompute' } })
  assert.equal(audit.delta, 0); assert.equal(audit.metadata.adminReason, 'Missed award')
  await assert.rejects(() => f.recompute({ reason: 'Different request' }), /identity|mismatch/i)
  await f.recompute({ interactionId: 'again' })
  assert.equal(await f.models.Notification.count(), 1)
  assert.equal(await f.models.Ledger.count({ where: { resource: 'badge:spooky-2026:sel' } }), 1)
})
test('closed archived eligibility can be repaired; existing badges survive missing inventory', async t => {
  const f = await fixture(t)
  f.time('2026-11-02T12:00:00Z')
  await f.models.EventState.create({ eventId: config.eventId, guildId: 'guild', archivedAt: new Date('2026-11-01T07:00:00Z'), actionsPaused: true, configVersion: 4 })
  await f.recompute()
  await f.models.Inventory.destroy({ where: { participantId: f.player.id } })
  const again = await f.recompute({ interactionId: 'partial' })
  assert.deepEqual(again.receipt.retainedBadges, ['spooky-2026:sel'])
  assert.deepEqual(again.receipt.result.newlyAwardedBadges, [])
  assert.equal((await f.models.EventState.findOne()).actionsPaused, true)
})
test('authorization, confirmation, registration and invalid inventory reject without writes', async t => {
  const f = await fixture(t)
  f.permit(false); await assert.rejects(() => f.recompute(), /permission/); f.permit(true)
  for (const [extra, pattern] of [[{ guildId: 'other' }, /scope/], [{ confirm: false }, /confirmation/], [{ reason: '' }, /reason/], [{ userId: 'missing' }, /registered/]]) await assert.rejects(() => f.recompute(extra), pattern)
  f.time('2026-09-30T12:00:00Z'); await assert.rejects(() => f.recompute(), /opened/)
  f.time('2026-10-10T12:00:00Z')
  await f.player.update({ registeredAt: new Date('2026-09-01') }); await assert.rejects(() => f.recompute(), /registered/)
  await f.player.update({ registeredAt: new Date('2026-10-02') })
  await f.models.Inventory.create({ participantId: f.player.id, pieceId: 'unknown', quantity: 1 })
  await assert.rejects(() => f.recompute(), /inventory/)
  assert.equal(await f.models.Operation.count(), 0); assert.equal(await f.models.Ledger.count(), 0)
  assert.deepEqual(await f.badges.owned('guild', 'alice'), [])
})
test('outbox failure rolls back ownership and operation; retry safely awards', async t => {
  const f = await fixture(t)
  f.fail(true); await assert.rejects(() => f.recompute(), /rollback/)
  assert.equal(await f.models.Operation.count(), 0); assert.equal(await f.models.Notification.count(), 0)
  assert.equal(await f.models.Ledger.count(), 0); assert.deepEqual(await f.badges.owned('guild', 'alice'), [])
  f.fail(false); await f.recompute()
  assert.deepEqual(await f.badges.owned('guild', 'alice'), ['spooky-2026:sel'])
})
test('development reset preserves permanent badge and wallet, cancels repair announcement and replay preserves new participant', async t => {
  const f = await fixture(t)
  await f.recompute()
  const input = { ...f.input, interactionId: 'reset', action: 'reset-development' }
  const result = await f.admin.control(input)
  assert.deepEqual(result.receipt.badgeOwnershipRetained, ['spooky-2026:sel'])
  assert.equal(await f.models.Participant.count(), 0); assert.equal(await f.models.Inventory.count(), 0)
  assert.equal((await f.models.Notification.findOne()).status, 'cancelled')
  const inspection = await f.admin.inspect({ ...f.input, view: 'player' })
  assert.equal(inspection.participant, null); assert.equal(inspection.badgeOwnership[0].sourceEventId, config.eventId)
  assert.equal(inspection.wallet.bank, 70); assert.equal(inspection.wallet.fate_points, 20)
  assert.equal(await f.models.Ledger.count({ where: { resource: 'badge_preservation' } }), 1)
  await f.models.Participant.create({ eventId: config.eventId, guildId: 'guild', userId: 'alice', refillAnchor: new Date('2026-10-10') })
  assert.equal((await f.admin.control(input)).replayed, true)
  assert.equal(await f.models.Participant.count(), 1)
})
test('admin controller defers privately, projects after commit and replay never resends completion', async t => {
  const f = await fixture(t)
  const sent = [], replies = [], deferred = []
  const interaction = { id: 'controller', guildId: 'guild', channelId: 'channel', user: { id: 'admin' },
    channel: { id: 'channel', send: async payload => { sent.push(payload); return { id: 'message' } } },
    options: { getSubcommand: () => 'recompute-badges', getUser: () => ({ id: 'alice', username: 'Alice' }), getBoolean: () => true, getString: () => 'Private repair reason' },
    deferReply: async payload => { deferred.push(payload); interaction.deferred = true }, editReply: async payload => replies.push(payload) }
  const controller = require('../services/spooky/admin-command').createAdminController({ admin: f.admin, notifications: f.notifications,
    allowedChannelIds: ['channel'], badgeAccess: { reconcileUser: async (guild, user) => {
      assert.deepEqual(await f.badges.owned(guild, user), ['spooky-2026:sel'])
    } } })
  await controller.execute(interaction); await controller.execute(interaction)
  assert.deepEqual(deferred, [{ ephemeral: true }]); assert.equal(sent.length, 1); assert.equal(replies.length, 2)
  assert.deepEqual(sent[0].allowedMentions.users, ['alice'])
  assert.equal(JSON.stringify(sent[0]).includes('Private repair reason'), false)
})
