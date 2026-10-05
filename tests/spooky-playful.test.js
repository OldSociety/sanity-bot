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

async function fixture(t, random = () => 0) {
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
    getRoleHolders: async (_guild, roleId) => members.filter(member => member.roleIds.includes(roleId)).map(member => member.userId),
    getMember: async (_guild, id) => members.find(member => member.userId === id),
    setRole: async (_guild, id, role, present) => { networkCalls++; if (failure) throw new Error('permission denied'); const member = members.find(member => member.userId === id); member.roleIds = member.roleIds.filter(value => value !== role); if (present) member.roleIds.push(role) },
    setNickname: async (_guild, id, value) => { networkCalls++; if (failure) throw new Error('permission denied'); members.find(member => member.userId === id).nickname = value },
  }
  const delivery = createDelivery({ models, adapter })
  const playful = createPlayful({ models, participants, effects, collection, delivery, listMembers: () => members,
    roleIds: { curse: 'curse-role', sweetTooth: 'sweet-role' }, event, random })
  const scope = { eventId: config.eventId, guildId: 'guild' }
  const run = (key, callback) => economy.execute({ ...scope, actorId: 'alice', interactionId: key, operationType: 'playful_test' }, callback)
  const invoke = (key, outcome) => run(key, ctx => playful.handlers[outcome](ctx, { actorId: 'alice', outcome }))
  return { sequelize, models, economy, participants, effects, playful, delivery, members, scope, run, invoke, adapter,
    time: value => { now = new Date(value) }, fail: value => { failure = value }, calls: () => networkCalls }
}

test('legacy12h shield shortens from its cast time and cleanup restores nickname at6h without renewal', async t => {
  const f = await fixture(t)
  await f.invoke('legacy-shield', 'temporary_immunity'); await f.delivery.reconcile(f.scope)
  const row = await f.models.Effect.findOne({ where: { effectType: 'theft_protection' } })
  const metadata = { ...row.metadata }; delete metadata.appliedAt
  await row.update({ expiresAt: new Date(Date.parse(config.startsAt) + 43200000), metadata })
  f.time(Date.parse(config.startsAt) + 3600000)
  await f.run('shorten-shield', ctx => f.playful.cleanup(ctx))
  assert.equal(+new Date((await row.reload()).expiresAt), Date.parse(config.startsAt) + 21600000)
  f.time(Date.parse(config.startsAt) + 21600000 - 1)
  await f.run('shield-not-yet', ctx => f.playful.cleanup(ctx)); assert.equal(await f.models.Effect.count(), 2)
  f.time(Date.parse(config.startsAt) + 21600000)
  await f.run('shield-expired', ctx => f.playful.cleanup(ctx)); await f.delivery.reconcile(f.scope)
  assert.equal(await f.models.Effect.count(), 0); assert.equal(f.members.find(m => m.userId === 'bob').nickname, null)
  await f.run('shield-repeat-cleanup', ctx => f.playful.cleanup(ctx)); assert.equal(await f.models.Effect.count(), 0)
})

test('self curse cannot renew; target choices omit existing curses and shields', async t => {
  const f = await fixture(t)
  await f.invoke('self-first', 'curse_backfire')
  const before = (await f.models.Effect.findOne()).get({ plain: true })
  assert.equal((await f.invoke('self-again', 'curse_backfire')).receipt.noEffect, 'already_cursed')
  assert.deepEqual((await f.models.Effect.findOne()).get({ plain: true }), before)
  await f.delivery.reconcile(f.scope)
  await f.invoke('curse-bob', 'curse_target'); await f.delivery.reconcile(f.scope)
  const targets = await f.run('eligible', async ctx => ({ ids: (await f.playful.choiceCandidates(ctx, { actorId: 'alice', outcome: 'curse_target' })).map(member => member.userId) }))
  assert.deepEqual(targets.receipt.ids, ['carol','dan'])
})

test('a chosen break-curse target is revalidated; vanished curse cannot become a different gift', async t => {
  const f = await fixture(t)
  await f.invoke('curse-for-choice', 'curse_target'); await f.delivery.reconcile(f.scope)
  await f.invoke('already-freed', 'break_curse'); await f.delivery.reconcile(f.scope)
  const before = await f.models.Ledger.count()
  await assert.rejects(f.run('stale-break', ctx => f.playful.handlers.break_curse(ctx, {
    actorId: 'alice', outcome: 'break_curse', targetUserId: 'bob' })), /already been broken/)
  assert.equal(await f.models.Ledger.count(), before)
  assert.equal(await f.models.Operation.findByPk('discord:stale-break'), null)
})

test('shield is recipient-only above 20%; repeat shared protection never renews caller', async t => {
  const recipientOnly = await fixture(t, () => 0.2)
  assert.equal((await recipientOnly.invoke('single', 'temporary_immunity')).receipt.shielded.length, 1)
  const f = await fixture(t)
  await f.invoke('shared', 'temporary_immunity'); await f.delivery.reconcile(f.scope)
  const player = await f.models.Participant.findOne({ where: { userId: 'alice' } })
  const before = (await f.models.Effect.findOne({ where: { participantId: player.id, effectType: 'theft_protection' } })).get({ plain: true })
  assert.deepEqual((await f.invoke('another-shield', 'temporary_immunity')).receipt.shielded, ['carol'])
  assert.deepEqual((await f.models.Effect.findOne({ where: { participantId: player.id, effectType: 'theft_protection' } })).get({ plain: true }), before)
})

test('protection cures a cursed target; a fresh shield restores after exactly twelve hours', async t => {
  const f = await fixture(t)
  f.members[1].nickname = 'Player'
  await f.invoke('curse-name', 'curse_target'); await f.delivery.reconcile(f.scope)
  assert.equal(f.members[1].nickname, '☠ Player ☠')
  const cure = await f.run('shield-name', ctx => f.playful.handlers.temporary_immunity(ctx, { actorId: 'alice', outcome: 'temporary_immunity', targetUserId: 'bob' }))
  await f.delivery.reconcile(f.scope)
  assert.equal(cure.receipt.freedUserId, 'bob')
  assert.equal(f.members[1].nickname, 'Player')
  assert.equal(f.members[1].roleIds.includes('curse-role'), false)
  assert.equal(await f.models.Effect.count(), 0)
  await f.run('fresh-shield', ctx => f.playful.handlers.temporary_immunity(ctx, { actorId: 'alice', targetUserId: 'bob' }))
  await f.delivery.reconcile(f.scope)
  assert.equal(f.members[1].nickname, '✨( Player )✨')
  f.time(new Date(Date.parse(config.startsAt) + config.protection.theftDurationMs - 1))
  await f.run('not-expired', ctx => f.playful.cleanup(ctx)); await f.delivery.reconcile(f.scope)
  assert.equal(f.members[1].nickname, '✨( Player )✨')
  f.time(new Date(Date.parse(config.startsAt) + config.protection.theftDurationMs))
  await f.run('expire-name', ctx => f.playful.cleanup(ctx)); await f.delivery.reconcile(f.scope)
  assert.equal(f.members[1].nickname, 'Player')
})

test('baseline is captured on first mutation, shared across effects and restored after October', async t => {
  const f = await fixture(t)
  await f.run('registration', async ctx => { await f.participants.prepare(ctx, 'bob', { register: true }); return {} })
  f.members[1].nickname = 'Hadley ✨'
  await f.invoke('first-mutation', 'reverse_nickname'); await f.delivery.reconcile(f.scope)
  await f.run('curse-over-reversal', ctx => f.playful.handlers.curse_target(ctx, { actorId: 'alice', targetUserId: 'bob' }))
  await f.delivery.reconcile(f.scope)
  assert.equal(f.members[1].nickname, '☠ Hadley ✨ ☠')
  const player = await f.models.Participant.findOne({ where: { userId: 'bob' } })
  const rows = await f.models.Effect.findAll({ where: { participantId: player.id } })
  assert.equal(rows.length, 2)
  assert.ok(rows.every(row => row.metadata.originalNickname === 'Hadley ✨'))
  f.time(config.endsAt)
  await f.run('restore-every-effect', ctx => f.playful.cleanup(ctx)); await f.delivery.reconcile(f.scope)
  assert.equal(f.members[1].nickname, 'Hadley ✨')
  assert.equal(await f.models.Effect.count(), 0)
})

test('pending curse cured by protection restores a null baseline without leaving a shield', async t => {
  const f = await fixture(t)
  await f.invoke('curse-null', 'curse_target')
  await f.run('shield-null', ctx => f.playful.handlers.temporary_immunity(ctx, { actorId: 'alice', targetUserId: 'bob' }))
  await f.delivery.reconcile(f.scope)
  assert.equal(f.members[1].nickname, null)
  assert.equal(f.members[1].roleIds.includes('curse-role'), false)
  assert.equal(await f.models.Effect.count(), 0)
})

test('readable appearance has one wrapper and respects Discord nickname length', () => {
  const { project } = require('../services/spooky/effect-nicknames')
  assert.equal(project('Hadley', 'fallback', ['reversed_nickname', 'theft_protection', 'curse']), '☠ Hadley ☠')
  assert.equal(project('Hadley', 'fallback', ['reversed_nickname', 'theft_protection']), '✨( Hadley )✨')
  assert.equal(project('Hadley', 'fallback', ['reversed_nickname']), 'yeldaH')
  assert.equal(project('A'.repeat(26), 'fallback', ['theft_protection']), `✨( ${'A'.repeat(26)} )✨`)
  assert.equal(project('A'.repeat(27), 'fallback', ['theft_protection']), `✨${'A'.repeat(27)}`)
  assert.equal(project('A'.repeat(32), 'fallback', ['theft_protection']), `✨${'A'.repeat(31)}`)
  assert.equal(project(null, 'A'.repeat(27), ['theft_protection']), `✨${'A'.repeat(27)}`)
  for (const type of ['curse', 'theft_protection']) {
    const value = project('🎃'.repeat(16), 'fallback', [type])
    assert.ok(value.length <= 32)
    assert.equal(value.includes('\uFFFD'), false)
  }
})

test('shield intercepts targeted curse and self backfire, losing charges without renewing expiry', async t => {
 const f=await fixture(t);await f.invoke('shield','temporary_immunity');await f.delivery.reconcile(f.scope)
 const before=(await f.models.Effect.findAll()).map(row=>new Date(row.expiresAt).getTime())
 const targets=await f.run('choices',async ctx=>({ids:(await f.playful.choiceCandidates(ctx,{actorId:'alice',outcome:'curse_target'})).map(m=>m.userId)}))
 assert.deepEqual(targets.receipt.ids,['bob','carol','dan'])
 assert.equal((await f.invoke('self-blocked','curse_backfire')).receipt.noEffect,'shield_blocks_attack')
 const blocked=await f.run('target-blocked',ctx=>f.playful.handlers.curse_target(ctx,{actorId:'alice',targetUserId:'bob'}))
 assert.equal(blocked.receipt.noEffect,'shield_blocks_attack')
 assert.deepEqual((await f.models.Effect.findAll()).map(row=>new Date(row.expiresAt).getTime()),before)
 assert.equal(f.members[0].nickname,'✨( alice )✨')
 assert.ok((await f.models.Effect.findAll()).every(row=>row.metadata.chargesRemaining===1))
})
test('maintenance refreshes saved old styles, cures legacy overlap and restores the original at expiry', async t => {
  const f = await fixture(t)
  f.members[1].nickname = 'Player'
  await f.invoke('legacy-curse', 'curse_target'); await f.delivery.reconcile(f.scope)
  const player = await f.models.Participant.findOne({ where: { userId: 'bob' } })
  const curse = await f.models.Effect.findOne({ where: { participantId: player.id } })
  await f.models.Effect.create({ participantId: player.id, effectType: 'theft_protection',
    expiresAt: new Date(Date.parse(config.startsAt) + 3600000), metadata: { ...curse.metadata } })
  const result = await f.run('normalize-overlap', ctx => f.playful.cleanup(ctx)); await f.delivery.reconcile(f.scope)
  assert.ok(result.receipt.cleared.some(row => row.reason === 'protection_broke_curse'))
  assert.equal(f.members[1].nickname, '✨( Player )✨')
  assert.equal(f.members[1].roleIds.includes('curse-role'), false)
  const shield = await f.models.Effect.findOne({ where: { participantId: player.id } })
  f.members[1].nickname = '(( Player ))'
  await shield.update({ metadata: { ...shield.metadata, appliedNickname: '(( Player ))' } })
  await f.run('refresh-old-style', ctx => f.playful.cleanup(ctx)); await f.delivery.reconcile(f.scope)
  assert.equal(f.members[1].nickname, '✨( Player )✨')
  const revision = (await f.models.Delivery.findOne({ where: { userId: 'bob', kind: 'nickname' } })).revision
  await f.run('already-current', ctx => f.playful.cleanup(ctx)); await f.delivery.reconcile(f.scope)
  assert.equal((await f.models.Delivery.findOne({ where: { userId: 'bob', kind: 'nickname' } })).revision, revision)
  f.time(new Date(Date.parse(config.startsAt) + 3600000))
  await f.run('expire-normalized', ctx => f.playful.cleanup(ctx)); await f.delivery.reconcile(f.scope)
  assert.equal(f.members[1].nickname, 'Player')
})

test('old-style refresh and later cleanup never overwrite a manually chosen nickname', async t => {
  const f = await fixture(t)
  await f.invoke('shield', 'temporary_immunity'); await f.delivery.reconcile(f.scope)
  const player = await f.models.Participant.findOne({ where: { userId: 'bob' } })
  const shield = await f.models.Effect.findOne({ where: { participantId: player.id } })
  await shield.update({ metadata: { ...shield.metadata, appliedNickname: '(( bob ))' } })
  f.members[1].nickname = 'My chosen name'
  await f.run('refresh', ctx => f.playful.cleanup(ctx)); await f.delivery.reconcile(f.scope)
  assert.equal(f.members[1].nickname, 'My chosen name')
  assert.equal((await f.models.Delivery.findOne({ where: { userId: 'bob', kind: 'nickname' } })).status, 'conflict')
  f.time(config.endsAt)
  await f.run('end', ctx => f.playful.cleanup(ctx)); await f.delivery.reconcile(f.scope)
  assert.equal(f.members[1].nickname, 'My chosen name')
})

test('legacy null baseline without a display snapshot is preserved until safe final restoration', async t => {
  const f = await fixture(t)
  await f.run('legacy', ctx => f.effects.put(ctx, 'bob', 'curse', { expiresAt: config.endsAt,
    metadata: { botOwnedRole: true, roleId: 'curse-role', originalNickname: null, appliedNickname: 'B!$ 🦇' } }))
  f.members[1].nickname = 'B!$ 🦇'; f.members[1].roleIds = ['curse-role']
  await f.run('keep-proof', ctx => f.playful.cleanup(ctx)); await f.delivery.reconcile(f.scope)
  assert.equal(f.members[1].nickname, 'B!$ 🦇')
  assert.equal(await f.models.Delivery.count(), 0)
  f.time(config.endsAt)
  await f.run('restore-null', ctx => f.playful.cleanup(ctx)); await f.delivery.reconcile(f.scope)
  assert.equal(f.members[1].nickname, null)
  assert.deepEqual(f.members[1].roleIds, [])
})

test('unapplied combined nickname intents restore safely; manual edits are never overwritten', async t => {
  const f = await fixture(t)
  f.members[1].nickname = 'Player'
  await f.invoke('pending-curse', 'curse_target')
  f.time(config.endsAt)
  await f.run('close-pending', ctx => f.playful.cleanup(ctx)); await f.delivery.reconcile(f.scope)
  assert.equal(f.members[1].nickname, 'Player')
  const g = await fixture(t)
  await g.invoke('manual-curse', 'curse_target'); await g.delivery.reconcile(g.scope)
  g.members[1].nickname = 'My chosen name'
  await g.invoke('manual-clear', 'break_curse'); await g.delivery.reconcile(g.scope)
  assert.equal(g.members[1].nickname, 'My chosen name')
  assert.equal((await g.models.Delivery.findOne({ where: { userId: 'bob', kind: 'nickname' } })).status, 'conflict')
})

test('cursed treats count actual delivered sweets toward a hidden goal and safely remove bot-owned role', async t => {
  const f = await fixture(t)
  await f.invoke('curse', 'curse_backfire')
  await f.delivery.reconcile(f.scope)
  assert.ok(f.members[0].roleIds.includes('curse-role'))
  for (let i = 0; i < 9; i++) {
    const result = await f.run(`goodwill-${i}`, ctx => f.playful.handlers.standard_gift(ctx, { actorId: 'alice', action: 'treat' }))
    assert.equal(result.receipt.goodwillFreedUserId, undefined)
  }
  const result = await f.run('goodwill-finish', ctx => f.playful.handlers.standard_gift(ctx, { actorId: 'alice', action: 'treat' }))
  assert.equal(result.receipt.goodwillFreedUserId, 'alice')
  assert.equal(await f.models.Effect.count({ where: { effectType: 'curse' } }), 0)
  await f.delivery.reconcile(f.scope)
  assert.ok(!f.members[0].roleIds.includes('curse-role'))
  const replay = await f.run('goodwill-finish', () => { throw new Error('must not execute') })
  assert.equal(replay.receipt.goodwillFreedUserId, 'alice')
})

test('failed curse removal survives another hit and eventually removes only the bot-owned role', async t => {
  const f = await fixture(t)
  await f.invoke('curse', 'curse_target'); await f.delivery.reconcile(f.scope)
  f.fail(true)
  await f.invoke('break', 'break_curse'); await f.delivery.reconcile(f.scope)
  const before = (await f.models.Delivery.findOne({ where: { kind: 'curse_role' } })).get({ plain: true })
  assert.equal(before.status, 'pending'); assert.equal(before.payload.present, false)
  await assert.rejects(f.run('again', ctx => f.playful.handlers.curse_target(ctx, { actorId: 'alice', outcome: 'curse_target', targetUserId: 'bob' })), /no longer eligible/)
  assert.equal(await f.models.Effect.count(), 0)
  const after = await f.models.Delivery.findOne({ where: { kind: 'curse_role' } })
  assert.equal(after.revision, before.revision); assert.deepEqual(after.payload, before.payload)
  f.time(config.endsAt); await f.run('close', ctx => f.playful.cleanup(ctx))
  f.fail(false); await f.delivery.reconcile(f.scope)
  assert.equal(f.members[1].roleIds.includes('curse-role'), false)
})

test('pending/conflicting nickname restoration cannot be overwritten by a new reversal', async t => {
  const f = await fixture(t)
  f.members[2].canManageNickname = false; f.members[3].canManageNickname = false
  f.members[1].nickname = 'Bob'
  await f.invoke('reverse', 'reverse_nickname'); await f.delivery.reconcile(f.scope)
  await f.run('clear', async ctx => {
    const removed = await f.effects.remove(ctx, 'bob', 'reversed_nickname')
    await f.delivery.enqueue(ctx, 'bob', 'nickname', { nickname: removed.metadata.originalNickname,
      expectedNickname: removed.metadata.appliedNickname })
    return {}
  })
  f.fail(true); await f.delivery.reconcile(f.scope)
  const row = await f.models.Delivery.findOne(), revision = row.revision
  await assert.rejects(f.invoke('again', 'reverse_nickname'), /Nothing was spent/)
  assert.equal(await f.models.Effect.count(), 0)
  assert.equal((await row.reload()).revision, revision); assert.equal(row.payload.nickname, 'Bob')
  f.members[1].nickname = 'Manual'; f.fail(false); await f.delivery.reconcile(f.scope)
  assert.equal((await row.reload()).status, 'conflict')
  await assert.rejects(f.invoke('conflict-hit', 'reverse_nickname'), /Nothing was spent/)
  f.members[1].nickname = 'boB'; await row.update({ status: 'pending' }); await f.delivery.reconcile(f.scope)
  assert.equal(f.members[1].nickname, 'Bob')
  assert.equal((await f.invoke('after-restore', 'reverse_nickname')).receipt.reversedUserId, 'bob')
})

test('reversal skips existing spells and restores each newly selected original at closure', async t => {
  const f = await fixture(t)
  f.members[1].nickname = 'Hadley'; f.members[2].nickname = 'Selene'; f.members[3].nickname = 'Maxim'
  await f.invoke('reverse-first', 'reverse_nickname'); await f.delivery.reconcile(f.scope)
  await f.run('curse-second', ctx => f.playful.handlers.curse_target(ctx, { actorId: 'alice', targetUserId: 'carol' })); await f.delivery.reconcile(f.scope)
  assert.equal((await f.invoke('reverse-third', 'reverse_nickname')).receipt.reversedUserId, 'dan')
  await f.delivery.reconcile(f.scope)
  await assert.rejects(f.invoke('no-more-targets', 'reverse_nickname'), /Nothing was spent/)
  f.time(config.endsAt); await f.run('end-all', ctx => f.playful.cleanup(ctx)); await f.delivery.reconcile(f.scope)
  assert.deepEqual(f.members.slice(1).map(member => member.nickname), ['Hadley', 'Selene', 'Maxim'])
})

test('no eligible reversal rolls back the action candy and operation', async t => {
  const f = await fixture(t)
  await f.participants.register({ ...f.scope, actorId: 'alice', interactionId: 'register-refund' })
  f.members.forEach(member => { member.canManageNickname = false })
  const actions = require('../services/spooky/actions').createActions({ models: f.models, economy: f.economy,
    participants: f.participants, event: { ...config, enabled: true }, random: () => .36, handlers: f.playful.handlers, getCurseState: () => false })
  await assert.rejects(actions.execute({ ...f.scope, actorId: 'alice', interactionId: 'refund-reverse', action: 'trick' }), /Nothing was spent/)
  assert.equal((await f.models.Participant.findOne({ where: { userId: 'alice' } })).candy, 10)
  assert.equal(await f.models.Operation.findByPk('discord:refund-reverse'), null)
  assert.equal(await f.models.Delivery.count(), 0)
})

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
  assert.equal(await f.models.Effect.count({ where: { effectType: 'theft_protection' } }), 3)
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
  await f.invoke('break-carol', 'break_curse')
  await f.delivery.reconcile(f.scope)
  assert.equal((await f.invoke('fallback', 'break_curse')).receipt.deliveredCandy, 1)
})

test('nickname applies once and October cleanup restores null original; independent changes conflict safely', async t => {
  const f = await fixture(t)
  await f.invoke('nickname', 'reverse_nickname')
  await f.delivery.reconcile(f.scope)
  assert.equal(f.members[1].nickname, 'bob')
  assert.equal((await f.invoke('repeat', 'reverse_nickname')).receipt.reversedUserId, 'carol')
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

test('reversal restores at twelve hours and legacy month-long timers are shortened without baseline changes', async t => {
  const f = await fixture(t)
  f.members[1].nickname = 'Hadley'
  await f.invoke('timed-reverse', 'reverse_nickname'); await f.delivery.reconcile(f.scope)
  const row = await f.models.Effect.findOne({ where: { effectType: 'reversed_nickname' } })
  assert.equal(new Date(row.expiresAt).getTime(), Date.parse(config.startsAt) + 43200000)
  // Model an old deployed row whose metadata/ledger preserves its application.
  await row.update({ expiresAt: new Date(config.endsAt), metadata: { ...row.metadata, appliedAt: undefined } })
  f.time(Date.parse(config.startsAt) + 43200000 - 1)
  await f.run('before-expiry', ctx => f.playful.cleanup(ctx)); await f.delivery.reconcile(f.scope)
  assert.equal(f.members[1].nickname, 'yeldaH')
  assert.equal((await row.reload()).metadata.originalNickname, 'Hadley')
  f.time(Date.parse(config.startsAt) + 43200000)
  await f.run('at-expiry', ctx => f.playful.cleanup(ctx)); await f.delivery.reconcile(f.scope)
  assert.equal(f.members[1].nickname, 'Hadley')
  assert.equal(await f.models.Effect.count(), 0)
})

test('Crown can be stolen and recaptured but first-win candy is not farmed', async t => {
  const f = await fixture(t)
  await f.invoke('find-crown', 'sweet_tooth'); await f.delivery.reconcile(f.scope)
  const stolen = await f.run('bob-steals', ctx => f.playful.handlers.steal_crown(ctx, { actorId: 'bob', action: 'trick', outcome: 'steal_crown' }))
  assert.equal(stolen.receipt.crownStolenFrom, 'alice'); assert.equal(stolen.receipt.crownFirstWin, true)
  await f.delivery.reconcile(f.scope)
  assert.deepEqual(f.members.filter(member => member.roleIds.includes('sweet-role')).map(member => member.userId), ['bob'])
  const recaptured = await f.invoke('take-back', 'steal_crown'); await f.delivery.reconcile(f.scope)
  assert.equal(recaptured.receipt.crownFirstWin, false); assert.equal(recaptured.receipt.candyReward, 0)
  assert.equal(await f.models.Ledger.count({ where: { userId: 'alice', resource: 'crown_award' } }), 1)
  assert.deepEqual(f.members.filter(member => member.roleIds.includes('sweet-role')).map(member => member.userId), ['alice'])
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

test('Sweet Tooth crowns only the caller once; repeat outcomes cannot transfer it; Eye treat converts', async t => {
  const f = await fixture(t)
  await f.invoke('sweet', 'sweet_tooth'); await f.delivery.reconcile(f.scope)
  assert.ok(f.members[0].roleIds.includes('sweet-role'))
  await assert.rejects(f.invoke('again', 'sweet_tooth'), /already held/)
  await f.delivery.reconcile(f.scope)
  assert.ok(!f.members[1].roleIds.includes('sweet-role'))
  await f.models.Participant.update({ registeredAt: new Date(config.startsAt), eyes: 4 }, { where: { userId: 'alice' } })
  assert.equal((await f.invoke('eye', 'find_eye')).receipt.awards.length, 1)
})

test('permission failures do not claim effects, existing roles are not removed and root failure rolls back intent', async t => {
  const f = await fixture(t)
  f.members.forEach(member => { member.canManageNickname = false })
  await assert.rejects(f.invoke('unmanageable', 'reverse_nickname'), /Nothing was spent/)
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
