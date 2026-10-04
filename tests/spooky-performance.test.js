const test = require('node:test'), assert = require('node:assert/strict')
const Sequelize = require('sequelize')
const { defineSpookyModels } = require('../services/spooky/models')
const { createEconomy } = require('../services/spooky/economy')
const { createParticipants } = require('../services/spooky/participants')
const { createEffects } = require('../services/spooky/effects')
const { createPlayful } = require('../services/spooky/playful')
const { createDelivery } = require('../services/spooky/delivery')
const { createLifecycle } = require('../services/spooky/lifecycle')
const { createMaintenanceCoordinator } = require('../services/spooky/maintenance-coordinator')
const { config } = require('../services/spooky/config')

async function fixture(t, count = 100) {
  const sql = [], sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: value => sql.push(value) })
  t.after(() => sequelize.close())
  const models = defineSpookyModels(sequelize); await sequelize.sync()
  const event = { ...config, enabled: true }, scope = { eventId: event.eventId, guildId: 'guild' }
  let now = new Date(Date.parse(event.startsAt) + 3600000)
  const clock = () => now, economy = createEconomy({ sequelize, models, clock })
  const participants = createParticipants({ models, economy, event }), effects = createEffects({ models, participants, event })
  const calls = [], delivery = createDelivery({ models, read: economy.read, adapter: {
    getMember: async (_guild, userId) => { calls.push(userId); return { nickname: 'Cursed', roleIds: ['curse'] } },
    setRole: async () => {}, setNickname: async () => {},
  } })
  const members = Array.from({ length: count }, (_, i) => ({ userId: String(i), bot: false, displayName: 'Player' + i,
    nickname: null, roleIds: [], canManageCurse: true, canManageNickname: true }))
  await models.Participant.bulkCreate(members.map(member => ({ ...scope, userId: member.userId, refillAnchor: now, registeredAt: now })))
  const players = await models.Participant.findAll(), byUser = new Map(players.map(player => [player.userId, player]))
  const playful = createPlayful({ models, participants, effects, delivery, collection: {}, event, roleIds: { curse: 'curse', sweetTooth: 'sweet' }, listMembers: () => members })
  const check = outcome => economy.read(transaction => playful.choiceCandidates({ scope, transaction, now }, { outcome, actorId: '0' }))
  return { models, sequelize, economy, event, scope, players, byUser, members, delivery, playful, sql, calls, clock, check,
    time: value => { now = new Date(value) },
    effect: (userId, effectType, values = {}) => models.Effect.create({ participantId: byUser.get(userId).id, effectType, expiresAt: new Date(now.getTime() + 3600000), metadata: {}, ...values }),
  }
}

test('spell roster selection is constant-query and preserves expired/opposite/restoration eligibility', async t => {
  const f = await fixture(t)
  await f.effect('1', 'curse')
  await f.effect('2', 'theft_protection')
  await f.effect('3', 'curse', { expiresAt: f.clock() })
  await f.effect('4', 'bag_hole')
  for (const [userId, kind, payload] of [['5', 'nickname', { nickname: null }], ['6', 'curse_role', { present: false }]]) {
    await f.models.Delivery.create({ ...f.scope, userId, kind, revision: 'old', payload })
  }
  f.members[7].canManageCurse = false
  await f.effect('7', 'curse')
  const outsider = await f.models.Participant.create({ ...f.scope, guildId: 'other', userId: '8', refillAnchor: f.clock() })
  await f.models.Effect.create({ participantId: outsider.id, effectType: 'curse', expiresAt: new Date(f.clock().getTime() + 3600000) })
  for (const [outcome, present, absent] of [
    ['curse_target', ['2', '4', '8'], ['0', '1', '3', '5', '6', '7']],
    ['temporary_immunity', ['1', '3', '4', '6', '8'], ['0', '2', '5', '7']],
    ['break_curse', ['1', '4'], ['0', '2', '3', '5', '6', '7', '8']],
  ]) {
    const before = f.sql.length, ids = (await f.check(outcome)).map(member => member.userId)
    assert.equal(f.sql.length - before, 6)
    for (const id of present) assert.ok(ids.includes(id), outcome + ' includes ' + id)
    for (const id of absent) assert.ok(!ids.includes(id), outcome + ' excludes ' + id)
  }
  // A new transaction must see state changes made while the chooser was open.
  await f.effect('8', 'curse')
  assert.ok(!(await f.check('curse_target')).some(member => member.userId === '8'))
})

test('command guard is read-only when idle and cleans exact expiry without network or cross-guild writes', async t => {
  const f = await fixture(t, 2), lifecycle = createLifecycle({ ...f, guildId: 'guild' })
  const outsider = await f.models.Participant.create({ ...f.scope, guildId: 'other', userId: '1', refillAnchor: f.clock() })
  await f.models.Effect.create({ participantId: outsider.id, effectType: 'bag_hole', expiresAt: f.clock() })
  const count = await f.models.Operation.count()
  assert.equal((await lifecycle.beforeCommand('idle')).skipped, 'no_cleanup_due')
  assert.equal(await f.models.Operation.count(), count)
  await f.effect('1', 'curse', { metadata: { botOwnedRole: true, roleId: 'curse' } })
  const old = await f.models.Delivery.create({ ...f.scope, userId: '1', kind: 'curse_role', revision: 'old', payload: { roleId: 'curse', present: true } })
  f.time(f.clock().getTime() + 3599999)
  assert.equal((await lifecycle.beforeCommand('early')).skipped, 'no_cleanup_due')
  f.time(f.clock().getTime() + 1)
  const result = await lifecycle.beforeCommand('expired')
  assert.equal(result.receipt.cleared.length, 1)
  assert.equal(f.calls.length, 0)
  assert.equal(await f.models.Effect.count({ where: { participantId: f.byUser.get('1').id } }), 0)
  assert.equal(await f.models.Effect.count({ where: { participantId: outsider.id } }), 1)
  const intent = await f.models.Delivery.findByPk(old.id)
  assert.equal(intent.payload.present, false)
  assert.equal(intent.status, 'pending')
  assert.notEqual(intent.revision, 'old')
  assert.equal((await lifecycle.beforeCommand('still-idle')).skipped, 'no_cleanup_due')
})

test('command guard archives at event end and retries a failed cleanup rather than caching it', async t => {
  const f = await fixture(t, 1), lifecycle = createLifecycle({ ...f, guildId: 'guild' })
  const row = await f.effect('0', 'reversed_nickname', { metadata: { appliedNickname: 'Broken' } })
  f.time(f.event.endsAt)
  await assert.rejects(lifecycle.beforeCommand('close'), /restoration metadata/)
  assert.equal(await f.models.EventState.count(), 0)
  await row.update({ metadata: { originalNickname: null, appliedNickname: 'Broken' } })
  assert.equal((await lifecycle.beforeCommand('close')).receipt.newlyArchived, true)
  assert.equal((await lifecycle.beforeCommand('closed-idle')).skipped, 'no_cleanup_due')
  assert.equal(await f.models.Ledger.count({ where: { resource: 'event_archive' } }), 1)
  assert.equal(f.calls.length, 0)
})

test('initialization coalesces/retries and slow full recovery never blocks a prepared command', async () => {
  let initializeCount = 0, sweepCount = 0, checked = 0, release
  const stalled = new Promise(resolve => { release = resolve })
  const coordinator = createMaintenanceCoordinator({ initialize: async () => { initializeCount++ },
    beforeCommand: async () => { checked++; return 'prepared' },
    sweep: async () => { sweepCount++; await stalled; return 'recovered' } })
  const sweep = coordinator.maintenance('minute'), duplicate = coordinator.maintenance('duplicate')
  assert.equal(await coordinator.beforeCommand('command'), 'prepared')
  assert.equal(initializeCount, 1); assert.equal(sweepCount, 1); assert.equal(checked, 1)
  release(); assert.equal(await sweep, 'recovered'); assert.equal(await duplicate, 'recovered')
  let attempts = 0
  const retry = createMaintenanceCoordinator({ initialize: async () => { if (++attempts === 1) throw new Error('offline') }, beforeCommand: async () => 'ok', sweep: async () => {} })
  await assert.rejects(retry.beforeCommand('one'), /offline/)
  assert.equal(await retry.beforeCommand('two'), 'ok'); assert.equal(attempts, 2)
})

test('current-operation projection skips unrelated pending role work', async t => {
  const f = await fixture(t, 2)
  for (const [userId, revision] of [['0', 'old'], ['1', 'current']]) await f.models.Delivery.create({ ...f.scope, userId, revision,
    kind: 'curse_role', payload: { roleId: 'curse', present: true } })
  const result = await f.delivery.reconcile(f.scope, { revision: 'current' })
  assert.deepEqual(f.calls, ['1']); assert.equal(result.length, 1)
  assert.equal((await f.models.Delivery.findOne({ where: { userId: '0' } })).status, 'pending')
})

test('cleanup avoids historical ledger and per-player nickname reads for modern reversals', async t => {
  const f = await fixture(t)
  await f.models.Effect.bulkCreate(f.players.map(player => ({ participantId: player.id, effectType: 'reversed_nickname',
    expiresAt: new Date(f.clock().getTime() + 3600000), metadata: { originalNickname: 'Player', appliedNickname: 'reyalP', appliedAt: f.clock().toISOString() } })))
  const before = f.sql.length
  await f.economy.execute({ ...f.scope, actorId: 'system', workerKey: 'cleanup', operationType: 'event_maintenance' }, ctx => f.playful.cleanup(ctx))
  assert.equal(f.sql.length - before, 7)
  assert.equal(f.calls.length, 0)
})
