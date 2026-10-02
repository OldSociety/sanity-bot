const test = require('node:test')
const assert = require('node:assert/strict')
const Sequelize = require('sequelize')
const migration = require('../migrations/20261001000000-create-spooky-core')
const deliveryMigration = require('../migrations/20261001000001-create-spooky-delivery')
const { defineSpookyModels } = require('../services/spooky/models')
const { createEconomy } = require('../services/spooky/economy')
const { createParticipants } = require('../services/spooky/participants')
const { createEffects } = require('../services/spooky/effects')
const { createCollection } = require('../services/spooky/collection')
const { createPlayful } = require('../services/spooky/playful')
const { createDelivery } = require('../services/spooky/delivery')
const { config } = require('../services/spooky/config')

async function fixture(t) {
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => sequelize.close())
  await migration.up(sequelize.getQueryInterface()); await deliveryMigration.up(sequelize.getQueryInterface())
  const models = defineSpookyModels(sequelize), event = { ...config, enabled: true }
  let now = new Date(config.startsAt)
  const economy = createEconomy({ sequelize, models, configVersion: config.version, clock: () => now })
  const participants = createParticipants({ models, economy, event })
  const effects = createEffects({ models, participants, event })
  const collection = createCollection({ models, participants, event, random: () => 0 })
  const members = ['alice','bob','carol','dan'].map(userId => ({ userId, bot: false, displayName: userId,
    nickname: null, roleIds: [], canManageCurse: true, canManageNickname: true, canManageSweetTooth: true }))
  let failure = false, networkCalls = 0
  const adapter = {
    getMember: async (_guild, id) => members.find(member => member.userId === id),
    setRole: async (_guild, id, role, present) => { networkCalls++; if (failure) throw new Error('permission denied'); const member = members.find(member => member.userId === id); member.roleIds = member.roleIds.filter(value => value !== role); if (present) member.roleIds.push(role) },
    setNickname: async (_guild, id, value) => { networkCalls++; if (failure) throw new Error('permission denied'); members.find(member => member.userId === id).nickname = value },
  }
  const delivery = createDelivery({ models, adapter })
  const playful = createPlayful({ models, participants, effects, collection, delivery, listMembers: () => members,
    roleIds: { curse: 'curse-role', sweetTooth: 'sweet-role' }, event, random: () => 0 })
  const scope = { eventId: config.eventId, guildId: 'guild' }
  const run = (key, callback) => economy.execute({ ...scope, actorId: 'alice', interactionId: key, operationType: 'playful_test' }, callback)
  const invoke = (key, outcome) => run(key, ctx => playful.handlers[outcome](ctx, { actorId: 'alice', outcome }))
  return { sequelize, models, effects, playful, delivery, members, scope, run, invoke, adapter,
    time: value => { now = new Date(value) }, fail: value => { failure = value }, calls: () => networkCalls }
}

test('ordinary/double/cursed gifts use actual recipients, cap credits, and immunity shields both parties', async t => {
  const f = await fixture(t)
  assert.equal((await f.invoke('gift', 'standard_gift')).receipt.deliveredCandy, 1)
  assert.equal((await f.invoke('double', 'double_gift')).receipt.deliveredCandy, 2)
  assert.equal((await f.invoke('three', 'curse_distribute_three')).receipt.gifts.length, 3)
  assert.equal((await f.invoke('two', 'curse_distribute_two')).receipt.gifts.length, 2)
  const shield = await f.invoke('shield', 'temporary_immunity')
  assert.deepEqual(shield.receipt.shielded, ['alice','bob'])
  assert.equal(shield.receipt.deliveredCandy, 1)
  assert.equal(await f.models.Effect.count({ where: { effectType: 'theft_protection' } }), 2)
  await f.models.Participant.update({ candy: 80 }, { where: { userId: 'bob' } })
  assert.equal((await f.invoke('cap', 'double_gift')).receipt.deliveredCandy, 0)
  await f.invoke('renew', 'temporary_immunity')
  assert.equal(await f.models.Effect.count({ where: { effectType: 'theft_protection' } }), 2)
})

test('curse apply/spread/backfire are durable; break clears owned role with post-commit intent', async t => {
  const f = await fixture(t)
  await f.invoke('curse', 'curse_target')
  assert.equal(f.calls(), 0)
  assert.equal(await f.models.Effect.count({ where: { effectType: 'curse' } }), 1)
  await f.delivery.reconcile(f.scope)
  assert.ok(f.members[1].roleIds.includes('curse-role'))
  await f.invoke('spread', 'curse_spread')
  await f.invoke('backfire', 'curse_backfire')
  await f.invoke('break', 'break_curse')
  await f.delivery.reconcile(f.scope)
  assert.equal(f.members[0].roleIds.includes('curse-role'), false)
  await f.invoke('break-bob', 'break_curse')
  await f.delivery.reconcile(f.scope)
  assert.equal(f.members[1].roleIds.includes('curse-role'), false)
  assert.equal((await f.invoke('fallback', 'break_curse')).receipt.deliveredCandy, 1)
})

test('nickname applies once and October cleanup restores null original; independent changes conflict safely', async t => {
  const f = await fixture(t)
  await f.invoke('nickname', 'reverse_nickname')
  await f.delivery.reconcile(f.scope)
  assert.equal(f.members[1].nickname, 'bob')
  assert.equal((await f.invoke('repeat', 'reverse_nickname')).receipt.alreadyReversed, true)
  f.time(config.endsAt)
  await f.run('cleanup', ctx => f.playful.cleanup(ctx))
  await f.delivery.reconcile(f.scope)
  assert.equal(f.members[1].nickname, null)
  const changed = await fixture(t)
  await changed.invoke('nickname', 'reverse_nickname')
  await changed.delivery.reconcile(changed.scope)
  changed.members[1].nickname = 'chosen by user'
  changed.time(config.endsAt)
  await changed.run('cleanup', ctx => changed.playful.cleanup(ctx))
  assert.equal((await changed.delivery.reconcile(changed.scope))[0].status, 'conflict')
  assert.equal(changed.members[1].nickname, 'chosen by user')
})

test('failed Discord delivery survives reconstruction and retry is idempotent', async t => {
  const f = await fixture(t)
  await f.invoke('role', 'sweet_tooth')
  f.fail(true)
  assert.equal((await f.delivery.reconcile(f.scope))[0].status, 'pending')
  f.fail(false)
  const restored = createDelivery({ models: f.models, adapter: f.adapter })
  assert.equal((await restored.reconcile(f.scope))[0].status, 'done')
  const calls = f.calls()
  assert.deepEqual(await restored.reconcile(f.scope), [])
  assert.equal(f.calls(), calls)
})

test('Sweet Tooth retains random role and existing-holder generosity candy; Eye treat converts', async t => {
  const f = await fixture(t)
  await f.invoke('sweet', 'sweet_tooth'); await f.delivery.reconcile(f.scope)
  assert.ok(f.members[0].roleIds.includes('sweet-role'))
  assert.equal((await f.invoke('again', 'sweet_tooth')).receipt.candyReward, 5)
  await f.delivery.reconcile(f.scope)
  assert.ok(f.members[1].roleIds.includes('sweet-role'))
  await f.models.Participant.update({ registeredAt: new Date(config.startsAt), eyes: 4 }, { where: { userId: 'alice' } })
  assert.equal((await f.invoke('eye', 'find_eye')).receipt.awards.length, 1)
})

test('permission failures do not claim effects, existing roles are not removed and root failure rolls back intent', async t => {
  const f = await fixture(t)
  f.members.forEach(member => { member.canManageNickname = false })
  assert.equal((await f.invoke('unmanageable', 'reverse_nickname')).receipt.noEffect, 'no_manageable_target')
  await assert.rejects(() => f.run('rollback', async ctx => {
    await f.playful.handlers.curse_target(ctx, { actorId: 'alice' }); throw new Error('later failure')
  }), /later failure/)
  assert.equal(await f.models.Delivery.count(), 0)
  assert.equal(await f.models.Effect.count(), 0)
  f.members[1].roleIds.push('curse-role')
  await f.invoke('preexisting', 'curse_target')
  await f.invoke('clear', 'break_curse')
  await f.delivery.reconcile(f.scope)
  assert.ok(f.members[1].roleIds.includes('curse-role'))
})

test('delivery migration rollback/reapply preserves core tables', async t => {
  const f = await fixture(t)
  await deliveryMigration.down(f.sequelize.getQueryInterface())
  assert.equal(await f.models.Participant.count(), 0)
  await deliveryMigration.up(f.sequelize.getQueryInterface())
  assert.equal(await f.models.Delivery.count(), 0)
})

test('delivery retry detects state already applied before acknowledgment failure', async t => {
  const f = await fixture(t)
  await f.invoke('role', 'sweet_tooth')
  const realSetRole = f.adapter.setRole
  let writes = 0
  const adapter = { ...f.adapter, setRole: async (...args) => {
    writes++; await realSetRole(...args); throw new Error('connection lost after success')
  } }
  const delivery = createDelivery({ models: f.models, adapter })
  assert.equal((await delivery.reconcile(f.scope))[0].status, 'pending')
  assert.equal((await delivery.reconcile(f.scope))[0].status, 'done')
  assert.equal(writes, 1)
})

test('cleanup rolls back with its restoration intent and repeat worker receipt does not enqueue twice', async t => {
  const f = await fixture(t)
  await f.invoke('nickname', 'reverse_nickname')
  await f.delivery.reconcile(f.scope)
  f.time(config.endsAt)
  await assert.rejects(() => f.run('failed-cleanup', async ctx => {
    await f.playful.cleanup(ctx); throw new Error('worker failure')
  }), /worker failure/)
  assert.equal(await f.models.Effect.count(), 1)
  const result = await f.run('cleanup', ctx => f.playful.cleanup(ctx))
  const replay = await f.run('cleanup', () => { throw new Error('rerun') })
  assert.deepEqual(replay.receipt, result.receipt)
  assert.equal(await f.models.Effect.count(), 0)
  assert.equal(await f.models.Delivery.count(), 1)
})
