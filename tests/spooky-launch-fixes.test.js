const test = require('node:test')
const assert = require('node:assert/strict')
const { fixture } = require('../scripts/spooky-launch-audit-probes')
async function setup(t) { const f = await fixture(); t.after(() => f.db.close()); return f }

test('audited cancellation during delayed eligibility prevents API dispatch', async t => {
  const f = await setup(t)
  const operation = await f.run('notice', async ctx => { await f.notifications.enqueue(ctx, 'channel', [{ public: true, payload: { content: 'saved' } }]); return {} })
  const row = await f.models.Notification.findOne()
  let enter, release, calls = 0, sends = 0
  const entered = new Promise(resolve => { enter = resolve }), held = new Promise(resolve => { release = resolve })
  const sending = f.notifications.deliver(operation.operationId, { id: 'channel', send: async () => { sends++; return { id: 'sent' } } }, {
    canDeliver: async () => { if (++calls === 2) { enter(); await held } return true },
  })
  await entered
  await f.admin.resolve({ guildId: f.scope.guildId, actorId: 'admin', interactionId: 'cancel', target: 'notification', id: row.id,
    action: 'cancel', expectedStatus: 'sending', confirm: true, reason: 'Cancel before API dispatch' })
  release(); assert.equal((await sending).allSent, false)
  assert.equal(sends, 0); assert.equal((await row.reload()).status, 'cancelled')
})

test('player queue filtering uses original ownership before cursor/limit and respects guild scope', async t => {
  const f = await setup(t)
  for (const [id, actor, receipt] of [['ordinary', 'bob', {}], ['repair', 'admin', { request: { userId: 'bob' } }],
    ['recompute', 'admin', { request: { userId: 'bob' } }], ['copy', 'admin', { notificationOwnerUserId: 'bob', request: { userId: 'alice' } }],
    ['other', 'admin', { request: { userId: 'alice' } }]]) {
    await f.run(id, async ctx => { await f.notifications.enqueue(ctx, 'channel', [{ public: true, payload: { content: id } }]); return receipt }, 'audit_queue', actor)
  }
  const input = { guildId: f.scope.guildId, actorId: 'admin', view: 'deliveries', userId: 'bob', limit: 2 }
  const first = await f.admin.inspect(input), second = await f.admin.inspect({ ...input, beforeId: first.nextNotificationBeforeId })
  assert.deepEqual([...first.notifications, ...second.notifications].map(row => row.payload.content), ['copy', 'recompute', 'repair', 'ordinary'])
  assert.equal((await f.admin.inspect({ ...input, userId: 'alice' })).notifications.length, 1)
  await assert.rejects(() => f.admin.inspect({ ...input, guildId: 'foreign' }), /scope/i)
})

test('display names cannot inject masked links, Markdown or mentions into public results', () => {
  const { safeName } = require('../services/display-name')
  const name = '[Discord prize](https://example.invalid)'
  assert.notEqual(safeName(name), name); assert.ok(safeName(name).includes('\\['))
  assert.equal(safeName('<@123>\n**name**').includes('@'), false)
  assert.equal(safeName('a_b').includes('\\_'), true)
  const message = require('../services/spooky/presentation').actionMessages({ action: 'treat', outcome: 'find_eye', result: {} },
    { actorId: 'alice', members: [{ userId: 'alice', displayName: name }], registeredIds: new Set(['alice']) })[0]
  assert.equal(message.payload.embeds[0].description.includes(`**${name}**`), false)
  assert.ok(message.payload.embeds[0].description.includes(`**${safeName(name)}**`))
  assert.deepEqual(message.payload.allowedMentions.users, [])
})

test('achievement award and capped bank credit are atomic, concurrent-idempotent and preserve old over-cap balances', async t => {
  const f = await setup(t), Achievement = require('../Models/Achievement/UserAchievement')(f.db, require('sequelize').DataTypes)
  await Achievement.sync()
  const award = input => require('../services/fate-wallet').awardAchievement(f.User, Achievement, input)
  const alice = await f.User.findByPk('alice'); await alice.update({ bank: 95 })
  const input = { userId: 'alice', achievementId: 1, amount: 10 }
  const results = await Promise.all([award(input), award(input)])
  assert.equal(results.filter(row => row.awarded).length, 1); assert.equal((await alice.reload()).bank, 100)
  assert.equal(await Achievement.count(), 1)
  await alice.update({ bank: 105 }); const above = await award({ ...input, achievementId: 2 })
  assert.equal(above.bank, 105); assert.equal(above.credited, 0)
  const original = f.User.prototype.update
  f.User.prototype.update = async () => { throw new Error('wallet failure') }
  try { await assert.rejects(() => award({ ...input, achievementId: 3 }), /wallet failure/) }
  finally { f.User.prototype.update = original }
  assert.equal(await Achievement.count({ where: { achievementId: 3 } }), 0)
})

test('idle closed maintenance validates proof and reconciles pending projections without creating operations', async t => {
  const f = await setup(t); let projections = 0
  const lifecycle = require('../services/spooky/lifecycle').createLifecycle({ ...f, guildId: f.scope.guildId,
    delivery: { reconcile: async () => { projections++; return [] } },
    winnerSnapshots: require('../services/spooky/winner-snapshot').createWinnerSnapshot(f) })
  f.time(f.event.endsAt)
  await lifecycle.maintain('first')
  assert.equal((await lifecycle.maintain('second')).skipped, 'closed_idle')
  assert.equal((await lifecycle.maintain('third')).skipped, 'closed_idle')
  assert.equal(await f.models.Operation.count({ where: { operationType: 'event_maintenance' } }), 1)
  assert.equal(projections, 3)
  const proof = await f.models.Operation.findOne({ where: { operationType: 'winner_snapshot' } })
  await proof.update({ receipt: { ...proof.receipt, tracks: {} } })
  await assert.rejects(() => lifecycle.maintain('corrupt'), /snapshot receipt/i)
})

test('full testing reset clears this event and Crown eligibility, preserves other badges/wallet/history, and replays safely', async t => {
  const f = await setup(t)
  await require('../migrations/20261001000003-create-permanent-badges').up(f.db.getQueryInterface())
  const badges = require('../services/badges').createBadges({ sequelize: f.db })
  await f.run('badge', ctx => badges.award(ctx, 'alice', 'sel'))
  const Ownership = require('../services/badges').defineBadgeModel(f.db)
  await Ownership.create({ guildId: f.scope.guildId, userId: 'alice', badgeId: 'other-season:badge', sourceEventId: 'other-season', awardedAt: f.event.startsAt })
  await f.run('crown', ctx => f.playful.handlers.sweet_tooth(ctx, { actorId: 'alice', action: 'treat' }))
  f.members[0].roleIds = ['sweet']
  const user = await f.User.findByPk('alice'); await user.update({ bank: 42, fate_points: 70 })
  const player = await f.models.Participant.findOne({ where: { userId: 'alice' } })
  await f.models.Inventory.create({ participantId: player.id, pieceId: 'sel_tl', quantity: 3 })
  const make = (environment = 'development', developmentStorage = ':memory:') => require('../services/spooky/admin').createAdmin({
    sequelize: f.db, User: f.User, models: f.models, economy: f.economy, event: f.event, guildId: f.scope.guildId, badges,
    environment, developmentStorage, delivery: f.delivery, roleIds: { curse: 'curse', sweetTooth: 'sweet' }, authorize: async () => true })
  const input = { guildId: f.scope.guildId, actorId: 'admin', interactionId: 'full-reset', action: 'reset-testing',
    userId: 'alice', confirm: true, reason: 'Fresh synthetic test' }
  for (const admin of [make('production'), make('development', 'not-the-target')]) await assert.rejects(() => admin.control(input), /development database/)
  const admin = make()
  await assert.rejects(() => admin.control({ ...input, confirm: false }), /confirmation/)
  const result = await admin.control(input)
  assert.equal(result.receipt.testReset, true); assert.deepEqual(result.receipt.removedBadges, ['spooky-2026:sel'])
  assert.deepEqual(await badges.owned(f.scope.guildId, 'alice'), ['other-season:badge'])
  assert.equal(await f.models.Participant.count({ where: { userId: 'alice' } }), 0)
  assert.equal(await f.models.Inventory.count(), 0)
  assert.equal(await f.models.Participant.count({ where: { userId: 'bob' } }), 1)
  assert.equal((await user.reload()).bank, 42); assert.equal(user.fate_points, 70)
  assert.equal(await f.models.Ledger.count({ where: { resource: 'crown_award' } }), 1)
  assert.equal((await f.models.Delivery.findOne({ where: { kind: 'sweet_tooth_role' } })).payload.present, false)
  await f.participants.register({ ...f.scope, actorId: 'alice', interactionId: 'register-again' })
  f.members[0].roleIds = [] // Successful post-commit role removal.
  assert.equal((await f.run('crown-again', ctx => f.playful.handlers.sweet_tooth(ctx, { actorId: 'alice', action: 'treat' }))).receipt.crownWon, true)
  await f.run('badge-again', ctx => badges.award(ctx, 'alice', 'sel'))
  assert.equal((await admin.control(input)).replayed, true)
  assert.equal(await f.models.Participant.count({ where: { userId: 'alice' } }), 1)
  assert.ok((await badges.owned(f.scope.guildId, 'alice')).includes('spooky-2026:sel'))
})

test('full testing reset rolls back registration and badge deletion if the badge write fails', async t => {
  const f = await setup(t)
  await require('../migrations/20261001000003-create-permanent-badges').up(f.db.getQueryInterface())
  const badges = require('../services/badges').createBadges({ sequelize: f.db })
  await f.run('badge', ctx => badges.award(ctx, 'alice', 'sel'))
  const admin = require('../services/spooky/admin').createAdmin({ sequelize: f.db, User: f.User, models: f.models,
    economy: f.economy, event: f.event, guildId: f.scope.guildId, badges, environment: 'development', developmentStorage: ':memory:',
    delivery: f.delivery, roleIds: { sweetTooth: 'sweet' }, authorize: async () => true })
  const Ownership = require('../services/badges').defineBadgeModel(f.db), original = Ownership.prototype.destroy
  Ownership.prototype.destroy = async () => { throw new Error('badge failure') }
  try { await assert.rejects(() => admin.control({ guildId: f.scope.guildId, actorId: 'admin', interactionId: 'failed-reset',
    action: 'reset-testing', userId: 'alice', confirm: true, reason: 'Synthetic rollback' }), /badge failure/) }
  finally { Ownership.prototype.destroy = original }
  assert.equal(await f.models.Participant.count({ where: { userId: 'alice' } }), 1)
  assert.deepEqual(await badges.owned(f.scope.guildId, 'alice'), ['spooky-2026:sel'])
  assert.equal(await f.models.Delivery.count(), 0); assert.equal(await f.models.Ledger.count({ where: { resource: 'crown_reset' } }), 0)
})

test('finishing Selene emits one completion with main badge, token thumbnail and bank transition; duplicate is clearly labeled', () => {
  const { actionMessages } = require('../services/spooky/presentation'), { preparePayload, evidenceEmbeds } = require('../services/spooky/token-art')
  const piece = require('../services/spooky/config').pieces.find(piece => piece.id === 'sel_br')
  const award = { ...piece, ownedPositions: ['tl','tr','bl','br'] }
  const options = { actorId: 'alice', members: [{ userId: 'alice', displayName: 'Alice' }], registeredIds: new Set(['alice']), avatarURL: 'https://example.invalid/avatar.png' }
  const messages = actionMessages({ candy: 10, eyes: 0, bankBefore: 20, bank: 10, fatePoints: 100,
    awards: [award], newlyCompletedCharacters: ['sel'], newlyAwardedBadges: ['spooky-2026:sel'] }, options)
  assert.equal(messages.length, 1); const payload = messages[0].payload
  assert.match(payload.embeds[0].title, /Selene Complete/)
  assert.equal(payload.embeds[0].image.url, 'attachment://SPOOKY_SELENE_BADGE.png')
  assert.equal(payload.files.length, 2); assert.match(preparePayload(payload).files[1].attachment, /assets[\\/]badges[\\/]Spooky[\\/]SPOOKY_SELENE_BADGE.png$/)
  assert.equal(payload.embeds[0].fields.find(field => field.name === 'Bank').value, '20 → 10')
  const evidence = { embeds: [{ image: { url: 'https://example.invalid/token' }, thumbnail: { url: 'https://example.invalid/badge' } }],
    attachments: payload.files.map((file, index) => ({ name: file.name, url: index ? 'https://example.invalid/badge' : 'https://example.invalid/token' })) }
  assert.equal(evidenceEmbeds(payload, evidence)[0].thumbnail.url, 'attachment://SPOOKY_SELENE_BADGE.png')
  assert.deepEqual(evidenceEmbeds(payload, { ...evidence, attachments: evidence.attachments.slice(0, 1) }), [])
  const duplicate = actionMessages({ awards: [{ ...award, duplicate: true }] }, options)
  assert.equal(duplicate.length, 1); assert.match(duplicate[0].payload.embeds[0].title, /DUPLICATE PIECE FOUND/)
})

test('development badge settings never enable production or another guild and reset stays under the admin event group', () => {
  const settings = require('../config/badge-access.json'), { settingsForGuild } = require('../services/badge-access')
  const guildId = settings.development.guildId || '123456789012345678'
  assert.equal(settingsForGuild(guildId, { environment: 'production', configuredGuildId: guildId }).enabled, false)
  assert.equal(settingsForGuild('foreign', { environment: 'development', configuredGuildId: guildId }).enabled, false)
  const command = require('../services/spooky/admin-command').adminCommand({ execute() {} }).data.toJSON()
  assert.ok(command.options.find(group => group.name === 'event').options.some(option => option.name === 'reset-testing'))
  assert.equal(command.options.length, 4)
})

test('shared bank rewards and level overflow do not silently clamp existing above-cap balances', async t => {
  const f = await setup(t), wallet = require('../services/fate-wallet')
  const user = await f.User.findByPk('alice'); await user.update({ bank: 105, fate_points: 100, chat_level: 1 })
  assert.equal((await wallet.creditBank(f.User, 'alice', 10)).bank, 105)
  const level = await wallet.awardLevelUp(f.User, 'alice', { chat_level: 2 }, { unwanted: true, booster: true })
  assert.equal(level.bank, 105); assert.equal(level.fate_points, 100)
})
