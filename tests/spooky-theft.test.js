const test = require('node:test')
const assert = require('node:assert/strict')
const Sequelize = require('sequelize')
const migration = require('../migrations/20261001000000-create-spooky-core')
const { defineSpookyModels } = require('../services/spooky/models')
const { createEconomy } = require('../services/spooky/economy')
const { createParticipants } = require('../services/spooky/participants')
const { createCollection } = require('../services/spooky/collection')
const { createActions } = require('../services/spooky/actions')
const { createTheft, randomTargets } = require('../services/spooky/theft')
const { config } = require('../services/spooky/config')

async function fixture(t, members = [], options = {}) {
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => sequelize.close())
  await migration.up(sequelize.getQueryInterface())
  const models = defineSpookyModels(sequelize), event = { ...config, enabled: true }
  let now = new Date(config.startsAt)
  const economy = createEconomy({ sequelize, models, configVersion: config.version, clock: () => now })
  const participants = createParticipants({ models, economy, event })
  const collection = createCollection({ models, participants, event, random: options.collectionRandom || (() => 0) })
  const theft = createTheft({ models, participants, collection, event, random: options.targetRandom || (() => 0), listMembers: options.listMembers || (() => members) })
  const input = key => ({ eventId: config.eventId, guildId: 'guild', actorId: 'alice', interactionId: key, action: 'trick' })
  const actions = createActions({ models, participants, economy, event, handlers: theft.handlers,
    getCurseState: () => false, random: () => options.outcomeRoll ?? 0 })
  await participants.register(input('register'))
  const row = userId => models.Participant.findOne({ where: { eventId: config.eventId, guildId: 'guild', userId } })
  const register = async (userId, values = {}) => {
    await participants.register({ ...input(`register-${userId}`), actorId: userId })
    const user = await row(userId); await user.update(values); return user
  }
  return { models, economy, participants, theft, actions, input, row, register, time: value => { now = new Date(value) } }
}
const human = (userId, extra = {}) => ({ userId, bot: false, displayName: userId, ...extra })

test('random sampling is without replacement and can select every candidate', () => {
  assert.deepEqual(randomTargets(['a','b','c','d'], 3, () => .999999), ['d','c','b'])
  for (let i = 0; i < 4; i++) assert.equal(randomTargets(['a','b','c','d'], 1, () => (i + .5) / 4)[0], ['a','b','c','d'][i])
  assert.throws(() => randomTargets(['a'], 1, () => 1), /Random value/)
})

test('nonparticipant theft materializes only chosen victim, excludes self/bots, includes admin and strips mention text', async t => {
  const f = await fixture(t, [human('alice'), human('robot', { bot: true }), human('bob', { admin: true, displayName: '<@123> @everyone' }), human('carol'), human('bob')])
  const result = await f.actions.execute(f.input('steal'))
  assert.equal(result.receipt.candySpent, 1)
  assert.equal(result.receipt.result.stolen, 1)
  assert.equal((await f.row('alice')).candy, 10)
  assert.equal((await f.row('bob')).candy, 9)
  assert.equal((await f.row('bob')).registeredAt, null)
  assert.equal(await f.row('carol'), null)
  assert.equal(await f.models.Participant.count(), 2)
  assert.equal(result.receipt.result.victims[0].registered, false)
  assert.equal(result.receipt.result.victims[0].name, '＠123 ＠everyone')
  const rows = await f.models.Ledger.findAll({ where: { operationId: 'discord:steal', resource: 'candy' } })
  assert.equal(rows.filter(row => row.relatedUserId).reduce((sum, row) => sum + row.delta, 0), 0)
})

test('heist picks random distinct funded victims and limits credit to caller capacity', async t => {
  const f = await fixture(t, ['bob','carol','dan','eve'].map(id => human(id)), { outcomeRoll: .28, targetRandom: () => .999999 })
  await (await f.row('alice')).update({ candy: 79 })
  const result = await f.actions.execute(f.input('heist'))
  assert.deepEqual(result.receipt.result.victims.map(victim => victim.userId), ['eve','dan'])
  assert.equal(result.receipt.result.stolen, 2)
  assert.equal(result.receipt.candy, 80)
  assert.equal(await f.row('bob'), null)
  await (await f.row('alice')).update({ candy: 10 })
  const full = await f.actions.execute(f.input('full-heist'))
  assert.equal(full.receipt.result.stolen, 3)
  assert.deepEqual(full.receipt.result.victims.map(victim => victim.userId), ['eve','dan','carol'])
})

test('protection lasts exactly to expiry, includes both resources and ignores another guild effects', async t => {
  const f = await fixture(t, [human('bob'), human('carol')])
  const bob = await f.register('bob', { eyes: 1 })
  const carol = await f.register('carol', { eyes: 1 })
  const other = await f.models.Participant.create({ eventId: config.eventId, guildId: 'other', userId: 'carol', refillAnchor: new Date(config.startsAt) })
  const expiresAt = new Date(Date.parse(config.startsAt) + config.protection.theftDurationMs)
  await f.models.Effect.create({ participantId: bob.id, effectType: 'theft_protection', expiresAt })
  await f.models.Effect.create({ participantId: other.id, effectType: 'theft_protection', expiresAt })
  const inspect = resource => f.economy.execute({ ...f.input(`inspect-${resource}-${Date.now()}`), operationType: 'inspect_test' }, async ctx =>
    ({ ids: (await f.theft.candidates(ctx, 'alice', resource)).map(member => member.userId) }))
  assert.deepEqual((await inspect('eyes')).receipt.ids, ['bob','carol'])
  assert.deepEqual((await inspect('candy')).receipt.ids, ['bob','carol'])
  f.time(expiresAt)
  assert.deepEqual((await inspect('eyes')).receipt.ids, ['bob','carol'])
  assert.equal(carol.eyes, 1)
})

test('Eye victim needs registration/funds but no activity; theft converts at five and replay does not steal twice', async t => {
  const f = await fixture(t, [human('unknown'), human('bob')], { outcomeRoll: .99 })
  await f.register('bob', { eyes: 2, lastActive: null })
  await (await f.row('alice')).update({ eyes: 4 })
  const result = await f.actions.execute(f.input('eye'))
  assert.equal(result.receipt.result.stolen, 1)
  assert.equal(result.receipt.result.found, 0)
  assert.equal(result.receipt.result.awards.length, 1)
  assert.equal((await f.row('bob')).eyes, 1)
  assert.equal((await f.row('alice')).eyes, 0)
  assert.equal(await f.row('unknown'), null)
  const replay = await f.actions.execute(f.input('eye'))
  assert.deepEqual(replay.receipt, result.receipt)
})

test('solo Eye pool finds one; protected victim blocks theft without inventing an Eye; no candy target gives paid no-effect without minting candy', async t => {
  const solo = await fixture(t, [], { outcomeRoll: .99 })
  assert.equal((await solo.actions.execute(solo.input('solo'))).receipt.result.found, 1)
  const protectedOnly = await fixture(t, [human('bob')], { outcomeRoll: .99 })
  const bob = await protectedOnly.register('bob', { eyes: 2 })
  await protectedOnly.models.Effect.create({ participantId: bob.id, effectType: 'theft_protection', expiresAt: new Date(Date.parse(config.startsAt) + 3600000) })
  assert.equal((await protectedOnly.actions.execute(protectedOnly.input('protected'))).receipt.result.found, 0)
  assert.equal((await protectedOnly.row('bob')).eyes, 2)
  const candy = await fixture(t)
  const empty = await candy.actions.execute(candy.input('empty'))
  assert.equal(empty.receipt.candy, 9)
  assert.equal(empty.receipt.result.noEffect, 'no_funded_candy_target')
})

test('concurrent Eye theft transfers once; the next action gives candy and preserves the last Eye', async t => {
  const f = await fixture(t, [human('bob')], { outcomeRoll: .99 })
  await f.register('bob', { eyes: 2 })
  const results = await Promise.all([f.actions.execute(f.input('one')), f.actions.execute(f.input('two'))])
  assert.equal(results.reduce((sum, result) => sum + result.receipt.result.stolen, 0), 1)
  assert.equal(results.reduce((sum, result) => sum + result.receipt.result.found, 0), 0)
  assert.equal((await f.row('bob')).eyes, 1)
  assert.equal((await f.row('alice')).eyes, 1)
  assert.equal(results.filter(result => result.receipt.result.watchedUserId === 'bob').length, 1)
})

test('membership or RNG/award errors roll back action cost and never mint a fallback Eye', async t => {
  const broken = await fixture(t, [], { outcomeRoll: .99, listMembers: () => { throw new Error('Membership unavailable') } })
  await assert.rejects(() => broken.actions.execute(broken.input('bad')), /Membership unavailable/)
  assert.equal((await broken.row('alice')).candy, 10)
  assert.equal((await broken.row('alice')).eyes, 0)
  const award = await fixture(t, [human('bob')], { outcomeRoll: .99, collectionRandom: () => 1 })
  await award.register('bob', { eyes: 2 })
  await (await award.row('alice')).update({ eyes: 4 })
  await assert.rejects(() => award.actions.execute(award.input('award')), /Random value/)
  assert.equal((await award.row('bob')).eyes, 2)
  assert.equal((await award.row('alice')).eyes, 4)
  assert.equal((await award.row('alice')).candy, 10)
})

test('lazy funding uses due refill but an exhausted victim is skipped without extra materialization', async t => {
  const f = await fixture(t, [human('bob')])
  await f.register('bob', { candy: 0 })
  assert.equal((await f.actions.execute(f.input('empty'))).receipt.result.stolen, 0)
  f.time(new Date(Date.parse(config.startsAt) + 10800000))
  assert.equal((await f.actions.execute(f.input('refilled'))).receipt.result.stolen, 1)
  assert.equal((await f.row('bob')).candy, 9)
})

test('last Eye converts theft to capped Candy without touching the victim or minting Eyes', async t => {
  const f = await fixture(t, [human('bob')], { outcomeRoll: .99 })
  await f.register('bob', { eyes: 1, candy: 5 })
  await (await f.row('alice')).update({ candy: 79 })
  const result = await f.actions.execute(f.input('last-eye'))
  assert.equal(result.receipt.result.watchedUserId, 'bob'); assert.equal(result.receipt.result.candyReward, 2)
  assert.equal(result.receipt.candy, 80); assert.equal(result.receipt.eyes, 0)
  assert.equal((await f.row('bob')).eyes, 1); assert.equal((await f.row('bob')).candy, 5)
  assert.equal(await f.models.Ledger.count({ where: { operationId: result.operationId, resource: 'eyes' } }), 0)
  const replay = await f.actions.execute(f.input('last-eye'))
  assert.deepEqual(replay.receipt, result.receipt)
})

test('12-hour victim protection survives reconstruction, covers all thieves and does not renew on blocked rolls', async t => {
  const f = await fixture(t, [human('bob')], { outcomeRoll: .99 })
  await f.register('bob', { eyes: 4 }); await f.register('carol')
  const first = await f.actions.execute(f.input('first-theft'))
  assert.equal(first.receipt.result.stolen, 1); assert.equal((await f.row('bob')).eyes, 3)
  const savedLoss = await f.models.Ledger.findOne({ where: { operationId: first.operationId, userId: 'bob', resource: 'eyes' } })
  assert.equal(savedLoss.relatedUserId, 'alice'); assert.equal(savedLoss.metadata.reason, 'eye_theft')
  const restored = createTheft({ models: f.models, participants: f.participants,
    collection: createCollection({ models: f.models, participants: f.participants, event: { ...config, enabled: true } }),
    listMembers: () => [human('bob')], event: { ...config, enabled: true }, random: () => 0 })
  f.time(Date.parse(config.startsAt) + config.eyes.theftProtectionMs - 1)
  const blocked = await f.economy.execute({ ...f.input('different-thief'), actorId: 'carol', operationType: 'test' },
    ctx => restored.handlers.steal_or_find_eye(ctx, { actorId: 'carol', outcome: 'steal_or_find_eye' }))
  assert.equal(blocked.receipt.watchedUserId, 'bob'); assert.equal(blocked.receipt.candyReward, 4)
  assert.equal((await f.row('bob')).eyes, 3)
  f.time(Date.parse(config.startsAt) + config.eyes.theftProtectionMs)
  assert.equal((await f.actions.execute(f.input('at-expiry'))).receipt.result.stolen, 1)
  assert.equal((await f.row('bob')).eyes, 2)
})

test('Eye theft prefers another available victim over the watched or last-Eye player', async t => {
  const f = await fixture(t, [human('bob'), human('carol')], { outcomeRoll: .99 })
  await f.register('bob', { eyes: 1 }); await f.register('carol', { eyes: 3 })
  const first = await f.actions.execute(f.input('carol-first'))
  assert.equal(first.receipt.result.victims[0].userId, 'carol')
  await (await f.row('bob')).update({ eyes: 2 })
  const second = await f.actions.execute(f.input('bob-next'))
  assert.equal(second.receipt.result.victims[0].userId, 'bob')
  assert.equal((await f.row('bob')).eyes, 1); assert.equal((await f.row('carol')).eyes, 2)
})

test('Eye protection reads legacy transfers in scope, not other guilds or ordinary owner spending', async t => {
  const f = await fixture(t, [human('bob')], { outcomeRoll: .99 })
  await f.register('bob', { eyes: 3 })
  await f.models.Operation.create({ operationId: 'legacy', eventId: config.eventId, guildId: 'other', actorId: 'someone',
    operationType: 'spooky_trick', createdAt: new Date(config.startsAt), completedAt: new Date(config.startsAt), receipt: {} })
  await f.models.Ledger.create({ operationId: 'legacy', eventId: config.eventId, guildId: 'other', userId: 'bob',
    actorId: 'someone', operationType: 'spooky_trick', resource: 'eyes', delta: -1, configVersion: 21,
    timestamp: new Date(config.startsAt), metadata: { reason: 'eye_theft' } })
  await f.economy.execute({ ...f.input('owner-conversion'), operationType: 'test' }, async ctx => {
    await ctx.record({ userId: 'bob', resource: 'eyes', delta: -5, metadata: { reason: 'automatic_quarter' } }); return {}
  })
  const first = await f.actions.execute(f.input('other-guild-does-not-block'))
  assert.equal(first.receipt.result.stolen, 1)
  // Changing operation services or later refill cannot erase a committed theft.
  assert.equal((await f.actions.execute(f.input('legacy-protection'))).receipt.result.watchedUserId, 'bob')
})

test('an existing pre-upgrade Eye loss protects its victim without any backfill', async t => {
  const f = await fixture(t, [human('bob')], { outcomeRoll: .99 })
  await f.register('bob', { eyes: 3 })
  await f.economy.execute({ ...f.input('pre-upgrade'), actorId: 'carol', operationType: 'spooky_trick' }, async ctx => {
    await ctx.record({ userId: 'bob', resource: 'eyes', delta: -1, relatedUserId: 'carol', metadata: { reason: 'eye_theft' } }); return {}
  })
  const blocked = await f.actions.execute(f.input('historical-protection'))
  assert.equal(blocked.receipt.result.watchedUserId, 'bob'); assert.equal(blocked.receipt.result.candyReward, 4)
  assert.equal((await f.row('bob')).eyes, 3)
  assert.equal(await f.models.Ledger.count({ where: { operationId: blocked.operationId, resource: 'eyes' } }), 0)
})

test('Eye Candy favors zero-Eye registered humans and awards the giver five Candy, once', async t => {
  const f = await fixture(t, [human('alice'), human('robot', { bot: true }), human('unknown'), human('bob'), human('carol'), human('carol')],
    { outcomeRoll: .85, targetRandom: () => .99 })
  await f.register('bob', { eyes: 3 }); await f.register('carol', { eyes: 0 })
  const input = { ...f.input('gift'), action: 'treat' }
  const results = await Promise.all(Array.from({ length: 8 }, () => f.actions.execute(input)))
  const result = results[0].receipt.result
  assert.equal(result.eyeRecipientId, 'carol'); assert.equal(result.giftedEyes, 1); assert.equal(result.candyReward, 5)
  assert.equal((await f.row('alice')).candy, 14); assert.equal((await f.row('alice')).eyes, 0)
  assert.equal((await f.row('carol')).eyes, 1); assert.equal((await f.row('bob')).eyes, 3)
  assert.equal(await f.row('robot'), null); assert.equal(await f.row('unknown'), null)
  assert.equal(await f.models.Ledger.count({ where: { operationId: 'discord:gift', resource: 'eyes' } }), 1)
  assert.equal((await f.models.Ledger.findOne({ where: { operationId: 'discord:gift', resource: 'eyes' } })).metadata.giverUserId, 'alice')
  assert.ok(results.every(turn => JSON.stringify(turn.receipt) === JSON.stringify(results[0].receipt)))
})

test('Eye Candy chooses randomly from nonempty recipients, respects cap and cannot gift itself in solo play', async t => {
  for (const targetRandom of [() => 0, () => .99]) {
    const f = await fixture(t, [human('bob'), human('carol')], { outcomeRoll: .85, targetRandom })
    await f.register('bob', { eyes: 1 }); await f.register('carol', { eyes: 1 })
    await (await f.row('alice')).update({ candy: 79 })
    const result = await f.actions.execute({ ...f.input('nonempty'), action: 'treat' })
    assert.equal(result.receipt.result.eyeRecipientId, targetRandom() ? 'carol' : 'bob')
    assert.equal(result.receipt.result.candyReward, 2); assert.equal(result.receipt.candy, 80)
  }
  const solo = await fixture(t, [human('alice')], { outcomeRoll: .85 })
  const result = await solo.actions.execute({ ...solo.input('alone'), action: 'treat' })
  assert.equal(result.receipt.result.eyeGiftUnavailable, true); assert.equal(result.receipt.eyes, 0)
  assert.equal(result.receipt.candy, 14)
})

test('gifted fifth Eye converts for recipient and failed piece draw rolls back giver cost, bonus and Eye', async t => {
  const f = await fixture(t, [human('bob')], { outcomeRoll: .85, collectionRandom: () => 1 })
  await f.register('bob', { eyes: 4 })
  await assert.rejects(() => f.actions.execute({ ...f.input('failed-gift'), action: 'treat' }), /Random value/)
  assert.equal((await f.row('alice')).candy, 10); assert.equal((await f.row('bob')).eyes, 4)
  assert.equal(await f.models.Operation.findByPk('discord:failed-gift'), null)
  assert.equal(await f.models.Ledger.count({ where: { operationId: 'discord:failed-gift' } }), 0)
  const success = await fixture(t, [human('bob')], { outcomeRoll: .85 })
  await success.register('bob', { eyes: 4 })
  const result = await success.actions.execute({ ...success.input('fifth-eye'), action: 'treat' })
  assert.equal(result.receipt.result.collectionUserId, 'bob'); assert.equal(result.receipt.result.awards.length, 1)
  assert.equal(result.receipt.result.collectionBalance.eyes, 0)
  assert.equal((await success.row('alice')).eyes, 0)
  assert.equal((await success.models.Inventory.findOne()).participantId, (await success.row('bob')).id)
})
