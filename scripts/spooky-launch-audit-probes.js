// Synthetic positive regression evidence for the launch audit corrections.
// Never imports global storage, credentials, a Discord client or real fixtures.
const assert = require('node:assert/strict')
const Sequelize = require('sequelize')
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const { config } = require('../services/spooky/config')
async function fixture() {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  const User = require('../Models/User/User')(db, Sequelize.DataTypes); await User.sync()
  for (const name of ['core', 'delivery', 'notifications']) {
    const i = ['core', 'delivery', 'notifications'].indexOf(name)
    await require(`../migrations/2026100100000${i}-create-spooky-${name}`).up(db.getQueryInterface())
  }
  const models = require('../services/spooky/models').defineSpookyModels(db), event = { ...config, enabled: true }
  let now = new Date(event.startsAt)
  const economy = require('../services/spooky/economy').createEconomy({ sequelize: db, models, configVersion: event.version, clock: () => now })
  const scope = { eventId: event.eventId, guildId: 'audit-guild' }
  const participants = require('../services/spooky/participants').createParticipants({ models, economy, event })
  const effects = require('../services/spooky/effects').createEffects({ models, participants, event })
  const delivery = require('../services/spooky/delivery').createDelivery({ models, adapter: {} })
  const notifications = require('../services/spooky/notifications').createNotifications({ models })
  const members = ['alice', 'bob'].map(userId => ({ userId, bot: false, displayName: userId, nickname: 'Bob',
    roleIds: [], canManageCurse: true, canManageNickname: true, canManageSweetTooth: true }))
  const playful = require('../services/spooky/playful').createPlayful({ models, participants, effects, delivery, event,
    roleIds: { curse: 'curse', sweetTooth: 'sweet' }, listMembers: async () => members, random: () => 0 })
  const admin = require('../services/spooky/admin').createAdmin({ sequelize: db, User, models, economy, event,
    guildId: scope.guildId, authorize: async () => true, environment: 'test', delivery, roleIds: { curse: 'curse' } })
  const run = (id, fn, type = 'audit_probe', actorId = 'alice') => economy.execute({ ...scope, actorId, interactionId: id, operationType: type }, fn)
  for (const userId of ['alice', 'bob']) {
    await participants.register({ ...scope, actorId: userId, interactionId: `register-${userId}` })
    await User.create({ user_id: userId, user_name: userId, bank: 0, fate_points: 100 })
  }
  return { db, User, models, event, economy, scope, participants, effects, delivery, notifications, members, playful, admin, run,
    time: value => { now = new Date(value) } }
}
async function withFixture(work) { const f = await fixture(); try { return await work(f) } finally { await f.db.close() } }
async function audit() {
  const observations = {}
  observations.curseRestoration = await withFixture(async f => {
    const plan = { actorId: 'alice', action: 'trick', outcome: 'curse_target' }
    await f.run('curse', ctx => f.playful.handlers.curse_target(ctx, plan))
    assert.equal((await f.models.Effect.findOne()).metadata.botOwnedRole, true)
    await (await f.models.Delivery.findOne()).update({ status: 'applied' })
    f.members[1].roleIds = ['curse'] // The first add succeeded; removal will stay pending.
    await f.run('break', ctx => f.playful.handlers.break_curse(ctx, { ...plan, action: 'treat' }))
    assert.equal((await f.models.Delivery.findOne()).payload.present, false)
    const rehit = await f.run('recurse', ctx => f.playful.handlers.curse_target(ctx, plan))
    assert.equal(rehit.receipt.noEffect, 'restoration_pending')
    assert.equal(await f.models.Effect.count(), 0)
    f.time(f.event.endsAt); await f.run('cleanup', ctx => f.playful.cleanup(ctx))
    const intent = await f.models.Delivery.findOne()
    assert.equal(intent.status, 'pending'); assert.equal(intent.payload.present, false)
    return { originalOwned: true, reapplicationBlocked: true, finalIntent: intent.payload, finalStatus: intent.status }
  })
  observations.nicknameRestoration = await withFixture(async f => {
    const plan = { actorId: 'alice', action: 'trick', outcome: 'reverse_nickname' }
    await f.run('reverse', ctx => f.playful.handlers.reverse_nickname(ctx, plan))
    await (await f.models.Delivery.findOne()).update({ status: 'applied' })
    f.members[1].nickname = 'boB'
    await f.admin.control({ guildId: f.scope.guildId, actorId: 'admin', interactionId: 'clear', action: 'clear-effect', userId: 'bob', effectType: 'reversed_nickname', reason: 'Synthetic restoration' })
    assert.equal((await f.models.Delivery.findOne()).payload.nickname, 'Bob')
    const rehit = await f.run('reverse-again', ctx => f.playful.handlers.reverse_nickname(ctx, plan))
    assert.equal(rehit.receipt.noEffect, 'restoration_pending')
    assert.equal(await f.models.Effect.count(), 0)
    f.time(f.event.endsAt); await f.run('cleanup', ctx => f.playful.cleanup(ctx))
    assert.equal((await f.models.Delivery.findOne()).payload.nickname, 'Bob')
    return { actualOriginal: 'Bob', reapplicationBlocked: true, finalRestoration: 'Bob' }
  })
  observations.notificationCancellation = await withFixture(async f => {
    const operation = await f.run('notice', async ctx => { await f.notifications.enqueue(ctx, 'channel', [{ public: true, payload: { content: 'saved' } }]); return {} })
    const row = await f.models.Notification.findOne()
    let enter, release, calls = 0, sends = 0
    const entered = new Promise(resolve => { enter = resolve }), held = new Promise(resolve => { release = resolve })
    const pending = f.notifications.deliver(operation.operationId, { id: 'channel', send: async () => { sends++; return { id: 'sent' } } }, {
      canDeliver: async () => { if (++calls === 2) { enter(); await held } return true },
    })
    await entered
    await f.admin.resolve({ guildId: f.scope.guildId, actorId: 'admin', interactionId: 'cancel', target: 'notification', id: row.id,
      action: 'cancel', expectedStatus: 'sending', confirm: true, reason: 'Cancel before API send starts' })
    assert.equal(sends, 0); release(); const result = await pending
    assert.equal(sends, 0); assert.equal((await row.reload()).status, 'cancelled')
    return { sendsBeforeCancel: 0, sendsAfterCancel: sends, finalStatus: row.status, allSent: result.allSent }
  })
  observations.playerQueueFilter = await withFixture(async f => {
    await f.run('repair-notice', async ctx => {
      await f.notifications.enqueue(ctx, 'channel', [{ public: true, payload: { content: 'bob quarter' } }]); return { request: { userId: 'bob' } }
    }, 'admin_repair:probe', 'admin')
    const input = { guildId: f.scope.guildId, actorId: 'admin', view: 'deliveries' }
    const all = await f.admin.inspect(input), player = await f.admin.inspect({ ...input, userId: 'bob' })
    assert.equal(all.notifications.length, 1); assert.equal(player.notifications.length, 1)
    return { allNotifications: all.notifications.length, ownedPlayerNotifications: player.notifications.length }
  })
  const markdownName = '[Discord prize](https://example.invalid)'
  const message = require('../services/spooky/presentation').actionMessages({ action: 'treat', outcome: 'find_eye', result: {} }, {
    actorId: 'alice', members: [{ userId: 'alice', displayName: markdownName }], registeredIds: new Set(['alice']),
  })[0]
  assert.equal(message.payload.embeds[0].description.includes(`**${markdownName}**`), false)
  observations.displayNameMarkdown = { description: message.payload.embeds[0].description, rawMaskedLinkPresent: false }
  observations.legacyAchievementBank = await withFixture(async f => {
    const user = await f.User.findByPk('alice'); await user.update({ bank: 95 })
    const UserAchievement = require('../Models/Achievement/UserAchievement')(f.db, Sequelize.DataTypes)
    await UserAchievement.sync()
    await require('../services/fate-wallet').awardAchievement(f.User, UserAchievement, { userId: 'alice', achievementId: 1, amount: 10 })
    await user.reload(); assert.equal(user.bank, 100)
    const progression = require('../services/spooky/progression').createProgression({ User: f.User, models: f.models, event: f.event, isUnwanted: async () => true })
    const result = await f.run('reward', ctx => progression.sweetToothBonus(ctx, 'alice', true))
    assert.equal(result.receipt.bank, 100); assert.equal(result.receipt.fateBonus, 0)
    return { beforeAchievement: 95, afterAchievement: user.bank, afterCrown: result.receipt.bank, crownCredit: result.receipt.fateBonus }
  })
  observations.closedMaintenance = await withFixture(async f => {
    const lifecycle = require('../services/spooky/lifecycle').createLifecycle({ ...f, guildId: f.scope.guildId,
      delivery: { reconcile: async () => [] }, winnerSnapshots: require('../services/spooky/winner-snapshot').createWinnerSnapshot(f) })
    f.time(f.event.endsAt)
    for (let i = 0; i < 3; i++) await lifecycle.maintain(`idle-${i}`)
    const count = await f.models.Operation.count({ where: { operationType: 'event_maintenance' } })
    assert.equal(count, 1)
    return { distinctTicks: 3, committedMaintenanceRows: count, subsequentIdleOperations: 0 }
  })
  const files = ['config/spooky-2026.json', 'config/spooky-winners.json', 'services/spooky/playful.js', 'services/spooky/notifications.js',
    'services/spooky/admin.js', 'services/spooky/presentation.js', 'services/spooky/lifecycle.js',
    'services/spooky/flavor.js', 'services/display-name.js', 'services/fate-wallet.js',
    'commands/Achievements/Achievements.js', 'scripts/spooky-launch-audit-probes.js']
  return { scope: 'synthetic SQLite/Discord only', fixesVerified: true, configVersion: config.version, realDatabaseOpened: false, discordContacted: false,
    observations, hashes: Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', file))).digest('hex')])) }
}
if (require.main === module) audit().then(report => console.log(JSON.stringify(report, null, 2))).catch(error => { console.error(error); process.exitCode = 1 })
module.exports = { audit, fixture }
