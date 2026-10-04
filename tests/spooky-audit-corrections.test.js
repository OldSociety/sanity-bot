const test = require('node:test'), assert = require('node:assert/strict'), Sequelize = require('sequelize')
const { config } = require('../services/spooky/config')
async function fixture(t) {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }); t.after(() => db.close())
  const User = require('../Models/User/User')(db, Sequelize.DataTypes); await User.sync()
  for (const name of ['core', 'delivery', 'notifications', 'permanent-badges']) {
    const index = ['core', 'delivery', 'notifications', 'permanent-badges'].indexOf(name)
    await require(`../migrations/2026100100000${index}-create-${index === 0 ? 'spooky-core' : index === 3 ? 'permanent-badges' : `spooky-${name}`}`).up(db.getQueryInterface())
  }
  const models = require('../services/spooky/models').defineSpookyModels(db), event = { ...config, enabled: true }
  let now = new Date(config.startsAt)
  const economy = require('../services/spooky/economy').createEconomy({ sequelize: db, models, configVersion: config.version, clock: () => now })
  const scope = { eventId: config.eventId, guildId: 'guild' }
  const run = (id, work, type = 'audit_test', otherScope = scope) => economy.execute({ ...otherScope, actorId: 'alice', interactionId: id, operationType: type }, work)
  const notifications = require('../services/spooky/notifications').createNotifications({ models })
  const participants = require('../services/spooky/participants').createParticipants({ models, economy, event })
  const effects = require('../services/spooky/effects').createEffects({ models, participants, event })
  const members = ['alice','bob'].map(userId => ({ userId, bot: false, displayName: userId, nickname: null,
    roleIds: [], canManageCurse: true, canManageNickname: true, canManageSweetTooth: true }))
  return { db, User, models, event, economy, scope, run, notifications, participants, effects, members, time: value => { now = new Date(value) } }
}
test('expired private reply and hung cosmetic access cannot strand a saved fate quarter; replay charges once', async t => {
  const f = await fixture(t), sent = []
  const controller = require('../services/spooky/controller').createController({ sequelize: f.db, User: f.User, models: f.models,
    event: f.event, clock: () => new Date(config.startsAt), roleIds: { curse: 'curse', sweetTooth: 'sweet', unwanted: 'unwanted' },
    delivery: { enqueue() {} }, fetchMembers: async () => f.members, notifications: f.notifications,
    badgeAccess: { reconcileUser: () => new Promise(() => {}) }, random: () => 0.99 })
  const interaction = (id, command) => ({ id, guildId: 'guild', channelId: 'channel', user: { id: 'alice', username: 'Alice' },
    options: { getSubcommand: () => command }, deferReply: async function () { this.deferred = true }, editReply: async () => {},
    channel: { id: 'channel', guildId: 'guild', send: async payload => { sent.push(payload); return { id: 'message' } } } })
  await controller.execute(interaction('register', 'register')); await f.User.update({ bank: 10 }, { where: { user_id: 'alice' } })
  const failed = interaction('draw', 'spend-fate')
  let edits = 0
  // A visible offer and acknowledged confirmation precede this simulated
  // webhook failure. Failure to show an offer must never charge the wallet.
  failed.editReply = async () => { if (++edits > 2) throw new Error('Expired webhook') }
  failed.fetchReply = async () => ({ createMessageComponentCollector: () => {
    const collector = new (require('node:events').EventEmitter)()
    collector.stop = reason => collector.emit('end', [], reason)
    queueMicrotask(() => collector.emit('collect', { customId: 'spooky-spend-fate:draw:confirm', user: failed.user,
      guildId: failed.guildId, channelId: failed.channelId, deferUpdate: async () => {}, reply: async () => {} }))
    return collector
  } })
  await controller.execute(failed); await controller.execute(failed)
  assert.equal((await f.User.findByPk('alice')).bank, 0); assert.equal(sent.length, 1)
  assert.equal((await f.models.Notification.findOne()).status, 'sent')
})
test('restart recovery dispatches only owned definitely-pending gameplay; ambiguous/special channels remain untouched', async t => {
  const f = await fixture(t), sent = []
  const make = async (id, type, status = 'pending', scope = f.scope) => {
    const op = await f.run(id, async ctx => { await f.notifications.enqueue(ctx, 'channel', [{ public: true, payload: { content: id } }]); return {} }, type, scope)
    if (status !== 'pending') await f.models.Notification.update({ status }, { where: { operationId: op.operationId } })
  }
  await make('blocked-channel', 'spooky_treat')
  await f.models.Notification.update({ channelId: 'missing' }, { where: { operationId: 'discord:blocked-channel' } })
  await make('pending', 'fate_quarter_purchase'); await make('uncertain', 'spooky_treat', 'uncertain')
  await make('sending', 'spooky_trick', 'sending'); await make('cancelled', 'spooky_treat', 'cancelled')
  await make('curse', 'cursed_message'); await make('reminder', 'recruitment_reminder'); await make('winner', 'winner_awards')
  await make('foreign', 'spooky_treat', 'pending', { ...f.scope, guildId: 'other' })
  const pending = require('../services/spooky/pending-notifications').createPendingNotifications({ models: f.models, economy: f.economy,
    notifications: f.notifications, scope: f.scope, limit: 1, getChannel: async id => {
      if (id === 'missing') throw new Error('Synthetic unavailable old channel')
      return { id: 'channel', guildId: 'guild', send: async payload => { sent.push(payload.content); return { id: 'sent' } } }
    } })
  await Promise.all([pending.tick(), pending.tick()]); await pending.tick(); await pending.tick()
  assert.deepEqual(sent, ['pending'])
  assert.equal(await f.models.Notification.count({ where: { status: 'pending' } }), 5)
})
test('cancel or supersede during member fetch prevents old role and nickname writes', async t => {
  const f = await fixture(t)
  for (const kind of ['sweet_tooth_role', 'nickname', 'final_treat_role']) {
    let row, writes = 0
    const delivery = require('../services/spooky/delivery').createDelivery({ models: f.models, read: f.economy.read, canDeliver: async () => true,
      adapter: { getMember: async () => { await row.update({ status: 'cancelled', revision: 'cancel' }); return { nickname: null, roleIds: [] } },
        setRole: async () => writes++, setNickname: async () => writes++ } })
    await f.run(kind, async ctx => { await delivery.enqueue(ctx, 'bob', kind, kind === 'nickname' ? { nickname: 'boB', expectedNickname: null } : { roleId: 'role', present: true }); return {} })
    row = await f.models.Delivery.findOne({ where: { kind } }); await delivery.reconcile(f.scope)
    assert.equal(writes, 0); assert.equal((await row.reload()).status, 'cancelled')
  }
})
test('actual Discord adapter checks intent after its final async fetch and preserves independent nicknames', async () => {
  let current = true, writes = 0
  const member = { id: 'bob', nickname: 'independent', manageable: true, roles: { cache: new Map(), highest: {}, add: async () => writes++ }, setNickname: async () => writes++ }
  const guild = { id: 'guild', ownerId: 'owner', members: { fetch: async () => { current = false; return member },
    fetchMe: async () => ({ permissions: { has: () => true }, roles: { highest: { comparePositionTo: () => 1 } } }) },
    roles: { fetch: async () => new Map([['role', { id: 'role', managed: false }]]) } }
  const adapter = require('../services/spooky/discord-adapter').createDiscordAdapter(async () => guild)
  assert.equal(await adapter.setRole('guild', 'bob', 'role', true, { isCurrent: async () => current }), false)
  await assert.rejects(adapter.setNickname('guild', 'bob', 'reversed', { isCurrent: async () => true, expectedNickname: null }), error => error.code === 'NICKNAME_CONFLICT')
  assert.equal(writes, 0)
})

test('role adapter grants and removes below-bot roles for owners but rejects inaccessible roles', async () => {
  let writes = 0, manage = true, managed = false, position = 1
  const member = { id: 'owner', roles: { cache: new Map(), highest: { targetHigherThanBot: true },
    add: async () => ++writes, remove: async () => ++writes } }
  const role = { id: 'role', get managed() { return managed } }
  const guild = { id: 'guild', ownerId: 'owner', members: { fetch: async () => member,
    fetchMe: async () => ({ permissions: { has: () => manage }, roles: { highest: { comparePositionTo: other => {
      assert.equal(other, role); return position
    } } } }) }, roles: { fetch: async () => new Map([['role', role]]) } }
  const adapter = require('../services/spooky/discord-adapter').createDiscordAdapter(async () => guild)
  await adapter.setRole('guild', 'owner', 'role', true)
  member.roles.cache.set('role', role)
  await adapter.setRole('guild', 'owner', 'role', false)
  member.roles.cache.clear()
  manage = false; await assert.rejects(adapter.setRole('guild', 'owner', 'role', true), /permissions/)
  manage = true; managed = true; await assert.rejects(adapter.setRole('guild', 'owner', 'role', true), /permissions/)
  managed = false; position = 0; await assert.rejects(adapter.setRole('guild', 'owner', 'role', true), /hierarchy/)
  assert.equal(writes, 2)
})

test('curse restoration retains original role through configuration drift and safely rejects lost provenance', async t => {
  const f = await fixture(t)
  const delivery = require('../services/spooky/delivery').createDelivery({ models: f.models, adapter: {} })
  const make = role => require('../services/spooky/playful').createPlayful({ ...f, delivery, listMembers: async () => f.members,
    roleIds: { curse: role, sweetTooth: 'sweet' }, random: () => 0 })
  await f.run('curse', ctx => make('old-role').handlers.curse_target(ctx, { actorId: 'alice' }))
  assert.equal((await f.models.Effect.findOne()).metadata.roleId, 'old-role')
  await f.run('break', ctx => make('new-role').handlers.break_curse(ctx, { actorId: 'alice' }))
  assert.deepEqual((await f.models.Delivery.findOne({ where: { kind: 'curse_role' } })).payload, { roleId: 'old-role', present: false })
  // Legacy boolean-only effects recover from the saved intent, never the env.
  await f.run('legacy', ctx => f.effects.put(ctx, 'bob', 'curse', { expiresAt: config.endsAt, metadata: { botOwnedRole: true } }))
  await f.run('legacy-break', ctx => make('new-role').handlers.break_curse(ctx, { actorId: 'alice' }))
  assert.equal((await f.models.Delivery.findOne({ where: { kind: 'curse_role' } })).payload.roleId, 'old-role')
  await f.models.Delivery.destroy({ where: {} })
  await f.run('lost', ctx => f.effects.put(ctx, 'bob', 'curse', { expiresAt: config.endsAt, metadata: { botOwnedRole: true } }))
  await assert.rejects(f.run('unsafe-break', ctx => make('new-role').handlers.break_curse(ctx, { actorId: 'alice' })), /delivery inspection/)
  assert.equal(await f.models.Effect.count(), 1)
})

test('admin repair receipts and reacquisition reveals reflect retained permanent ownership', async t => {
  const f = await fixture(t), badges = require('../services/badges').createBadges({ sequelize: f.db })
  await f.participants.register({ ...f.scope, actorId: 'alice', userId: 'alice', interactionId: 'enrol', userName: 'Alice' })
  const repairs = require('../services/spooky/admin-repairs').createAdminRepairs({ ...f, badges, checkAccess: async () => {} })
  const pieces = require('../services/spooky/config').pieces.filter(piece => piece.characterId === 'sel')
  const repair = (id, piece, action = 'grant-quarter') => repairs.repair({ ...f.scope, actorId: 'admin', userId: 'alice',
    interactionId: id, action, pieceId: piece.id, allowLastCopy: true, reason: 'Synthetic correction' })
  let earned
  for (const piece of pieces) earned = await repair(piece.id, piece)
  assert.deepEqual(earned.receipt.badgeOwnership, ['spooky-2026:sel'])
  assert.deepEqual(earned.receipt.result.newlyAwardedBadges, ['spooky-2026:sel'])
  const removed = await repair('remove', pieces[0], 'remove-quarter')
  assert.deepEqual(removed.receipt.badgeOwnership, earned.receipt.badgeOwnership)
  const reacquired = await repair('reacquire', pieces[0])
  assert.deepEqual(reacquired.receipt.result.newlyAwardedBadges, [])
  assert.deepEqual(reacquired.receipt.result.alreadyOwnedBadges, ['spooky-2026:sel'])
  const rendered = require('../services/spooky/presentation').actionMessages(reacquired.receipt, {
    actorId: 'alice', members: f.members, registeredIds: new Set(['alice']),
  })
  assert.match(rendered.at(-1).payload.embeds[0].description, /badge already unlocked/)
  assert.doesNotMatch(JSON.stringify(rendered), /awaits artwork/)
  assert.equal(await f.models.Ledger.count({ where: { resource: 'badge:spooky-2026:sel' } }), 1)
})

test('partial Sweet Tooth still displays committed fate and candy rewards', () => {
  const message = require('../services/spooky/presentation').actionMessages({ outcome: 'sweet_tooth', candy: 14, bank: 2,
    result: { noEffect: 'no_role_recipient', fateBonus: 1, candyReward: 5 } }, {
    actorId: 'alice', members: [{ userId: 'alice', displayName: 'Alice' }], registeredIds: new Set(['alice']),
  })[0]
  assert.match(message.payload.embeds[0].description, /\+1 FATE POINT.*consolation prize/)
  assert.match(message.payload.embeds[0].description, /Candy reward:\*\* \+5/)
  assert.match(message.payload.embeds[0].description, /Sweet Tooth.*didn't fit/)
})

test('simultaneous level messages claim one XP transition and one fate reward, sharing the economy queue', async t => {
  const f = await fixture(t), { applyChatMessage, awardLevelUp } = require('../services/fate-wallet')
  await f.User.create({ user_id: 'alice', user_name: 'Alice', chat_exp: 150, chat_level: 1,
    fate_points: 100, bank: 0, last_chat_message: new Date(Date.parse(config.startsAt) - 60000) })
  const input = { userId: 'alice', userName: 'Alice', now: new Date(config.startsAt), xp: 10, unwanted: true, booster: true }
  const outcomes = await Promise.all([applyChatMessage(f.User, input), applyChatMessage(f.User, input),
    f.run('concurrent-reward', async ctx => { await f.User.increment('bank', { by: 1, where: { user_id: 'alice' }, transaction: ctx.transaction }); return {} })])
  assert.equal(outcomes.filter(item => item.levelUp).length, 1)
  const user = await f.User.findByPk('alice')
  assert.equal(user.chat_level, 2); assert.equal(user.chat_exp, 5); assert.equal(user.bank, 6)
  await awardLevelUp(f.User, 'alice', { chat_level: 2 }, { unwanted: true, booster: true })
  assert.equal((await user.reload()).bank, 6)
})

test('message pipelines handle XP/haiku/send failures independently and ignore numeric DMs', async t => {
  const f = await fixture(t), events = new Map(), sent = [], cursed = []
  const client = { user: { id: 'bot' }, on: (name, handler) => events.set(name, handler) }
  const message = { id: 'message', author: { id: 'alice', username: 'Alice', bot: false, displayAvatarURL: () => 'https://example.com/avatar.png' },
    guild: { id: 'guild' }, member: { roles: { cache: { has: () => true } } }, content: 'hello', mentions: { has: () => false },
    channel: { type: 0, send: async payload => { sent.push(payload); throw new Error('Synthetic send failure') } } }
  const dependencies = { detectHaiku: async () => { throw new Error('Synthetic haiku failure') },
    handleSpooky: async item => cursed.push(item.id), badgeField: async () => { throw new Error('Synthetic badge failure') },
    clock: () => new Date(config.startsAt), random: () => 0 }
  require('../handlers/messageHandler')(client, { sequelize: f.db, findByPk: async () => { throw new Error('Synthetic XP failure') } }, dependencies)
  await events.get('messageCreate')(message)
  await events.get('messageCreate')({ ...message, guild: null, member: null, channel: { type: 1 } })
  assert.deepEqual(cursed, ['message'])
  await f.User.create({ user_id: 'alice', user_name: 'Alice', chat_exp: 150, last_chat_message: new Date(Date.parse(config.startsAt) - 60000) })
  require('../handlers/messageHandler')(client, f.User, dependencies)
  await events.get('messageCreate')({ ...message, id: 'level-up' })
  assert.deepEqual(cursed, ['message', 'level-up']); assert.equal(sent.length, 1)
  assert.equal((await f.User.findByPk('alice')).chat_level, 2)
})

test('projection acknowledgement waits outside an unrelated rollback and newer removal wins over an in-flight add', async t => {
  const f = await fixture(t)
  const result = await f.run('notify', async ctx => { await f.notifications.enqueue(ctx, 'channel', [{ public: true, payload: { content: 'saved' } }]); return {} })
  let release, started
  const began = new Promise(resolve => { started = resolve }), held = new Promise(resolve => { release = resolve })
  let failing
  const sending = f.notifications.deliver(result.operationId, { id: 'channel', send: async () => {
    failing = f.run('rollback', async () => { started(); await held; throw new Error('Synthetic rollback') })
    failing.catch(() => {})
    await began; return { id: 'message' }
  } })
  await began; release(); await assert.rejects(failing, /Synthetic rollback/); await sending
  assert.equal((await f.models.Notification.findOne()).status, 'sent')
  let member = { nickname: null, roleIds: [] }, revised = false, writes = []
  const delivery = require('../services/spooky/delivery').createDelivery({ models: f.models, read: f.economy.read, adapter: {
    getMember: async () => member,
    setRole: async (_guild, _user, role, present) => {
      writes.push(present)
      if (!revised) {
        revised = true
        await f.run('new-removal', async ctx => { await delivery.enqueue(ctx, 'bob', 'curse_role', { roleId: role, present: false }); return {} })
      }
      member = { nickname: null, roleIds: present ? [role] : [] }
    },
  } })
  await f.run('old-add', async ctx => { await delivery.enqueue(ctx, 'bob', 'curse_role', { roleId: 'role', present: true }); return {} })
  await delivery.reconcile(f.scope)
  assert.equal((await f.models.Delivery.findOne()).status, 'pending')
  await delivery.reconcile(f.scope)
  assert.deepEqual(writes, [true, false]); assert.deepEqual(member.roleIds, [])
  assert.equal((await f.models.Delivery.findOne()).status, 'done')
})
