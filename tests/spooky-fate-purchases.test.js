const test = require('node:test')
const assert = require('node:assert/strict')
const Sequelize = require('sequelize')
const migration = require('../migrations/20261001000000-create-spooky-core')
const defineUser = require('../Models/User/User')
const { defineSpookyModels } = require('../services/spooky/models')
const { createEconomy } = require('../services/spooky/economy')
const { createParticipants } = require('../services/spooky/participants')
const { createCollection } = require('../services/spooky/collection')
const { createFatePurchases } = require('../services/spooky/fate-purchases')
const { config } = require('../services/spooky/config')

async function fixture(t, { bank = 100, fate = 100, random = () => 0, enabled = true } = {}) {
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => sequelize.close())
  const User = defineUser(sequelize, Sequelize.DataTypes)
  await User.sync() // Actual User schema, solely on this disposable connection.
  await migration.up(sequelize.getQueryInterface())
  const models = defineSpookyModels(sequelize), event = { ...config, enabled }
  let now = new Date(config.startsAt)
  const economy = createEconomy({ sequelize, models, configVersion: event.version, clock: () => now })
  const participants = createParticipants({ models, economy, event })
  const collection = createCollection({ models, participants, event, random })
  const input = key => ({ eventId: event.eventId, guildId: 'guild', actorId: 'alice', interactionId: key, authorized: true })
  const service = createFatePurchases({ User, models, economy, collection, event, canPurchase: input => input.authorized === true })
  const user = await User.create({ user_id: 'alice', user_name: 'Alice', bank, fate_points: fate })
  if (enabled) await participants.register(input('register'))
  return { sequelize, User, models, economy, collection, event, participants, service, input, user, time: value => { now = new Date(value) } }
}

test('community launch purchases spend normal Fate only, never special Bank, with durable replay', async t => {
  const f = await fixture(t, { bank: 63, fate: 12 })
  const event = { ...f.event, fate: { ...f.event.fate, paymentResource: 'normal-fate-only' } }
  const service = createFatePurchases({ ...f, event })
  const result = await service.purchase(f.input('normal-only'))
  assert.equal(result.receipt.bank, 63); assert.equal(result.receipt.fatePoints, 2)
  assert.equal((await service.purchase(f.input('normal-only'))).replayed, true)
  await assert.rejects(() => service.purchase(f.input('insufficient-normal')), /Insufficient/)
  await f.user.reload(); assert.equal(f.user.bank, 63); assert.equal(f.user.fate_points, 2)
  assert.equal(await f.models.Ledger.count({ where: { resource: 'bank' } }), 0)
})

test('bank-only purchase uses actual User model and leaves unbanked fate/candy/Eyes unchanged', async t => {
  const f = await fixture(t)
  const result = await f.service.purchase(f.input('buy'))
  await f.user.reload()
  assert.equal(f.user.bank, 90)
  assert.equal(f.user.fate_points, 100)
  assert.equal(result.receipt.bankSpent, 10)
  assert.equal(result.receipt.bankBefore, 100)
  assert.equal(result.receipt.bank, 90)
  assert.equal(result.receipt.fatePoints, 100)
  assert.equal(result.receipt.awards.length, 1)
  const participant = await f.models.Participant.findOne()
  assert.equal(participant.candy, 10)
  assert.equal(participant.eyes, 0)
  const ledger = await f.models.Ledger.findOne({ where: { resource: 'bank' } })
  assert.equal(ledger.delta, -10)
  assert.equal(ledger.configVersion, config.version)
})

test('insufficient combined wallet and missing/invalid accounts fail safely', async t => {
  const f = await fixture(t, { bank: 9, fate: 0 })
  await assert.rejects(() => f.service.purchase(f.input('poor')), /Insufficient Fate/)
  await assert.rejects(() => f.service.purchase({ ...f.input('missing'), actorId: 'bob' }), /does not exist/)
  await f.user.update({ bank: -1 })
  await assert.rejects(() => f.service.purchase(f.input('negative')), /Invalid fate/)
  assert.equal(await f.models.Inventory.count(), 0)
  assert.equal(await f.models.Operation.count(), 1)
})

test('authorization fails closed and cannot buy for a different actor', async t => {
  const f = await fixture(t)
  await assert.rejects(() => f.service.purchase({ ...f.input('denied'), authorized: false }), /not permitted/)
  await assert.rejects(() => f.service.purchase({ ...f.input('other'), userId: 'bob' }), /actor/)
  assert.throws(() => createFatePurchases({ ...f, canPurchase: null }), /authorization/)
  assert.equal((await f.user.reload()).bank, 100)
})

test('any registered bank holder may purchase without Unwanted/admin role claims', async t => {
  const f = await fixture(t)
  const service = createFatePurchases({ ...f })
  const { authorized, ...input } = f.input('all-bank-holders')
  assert.equal((await service.purchase(input)).receipt.bank, 90)
})

test('same interaction replays one debit and award; distinct purchases have no daily ceiling', async t => {
  let rolls = 0
  const f = await fixture(t, { random: () => { rolls++; return 0 } })
  const results = await Promise.all(Array.from({ length: 10 }, () => f.service.purchase(f.input('same'))))
  assert.equal(results.filter(result => !result.replayed).length, 1)
  assert.equal(rolls, 2)
  assert.ok(results.every(result => JSON.stringify(result.receipt) === JSON.stringify(results[0].receipt)))
  for (let i = 0; i < 19; i++) await f.service.purchase(f.input(`extra${i}`))
  assert.equal((await f.user.reload()).bank, 0)
  const replay = await f.service.purchase(f.input('same'))
  assert.equal(replay.receipt.bankBefore, 100)
  assert.equal(replay.receipt.bank, 90)
  assert.equal(replay.receipt.fatePoints, 100)
  await assert.rejects(() => f.service.purchase(f.input('empty')), /Insufficient/)
  assert.equal(await f.models.Ledger.count({ where: { resource: 'bank' } }), 10)
})

test('concurrent purchases compete for the same final ten bank points', async t => {
  const f = await fixture(t, { bank: 10, fate: 0 })
  const results = await Promise.allSettled([f.service.purchase(f.input('one')), f.service.purchase(f.input('two'))])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal((await f.user.reload()).bank, 0)
  assert.equal(await f.models.Inventory.count(), 1)
})

test('award failure rolls back bank and ledger, and retry is safe', async t => {
  let invalid = true
  const f = await fixture(t, { random: () => invalid ? 1 : 0 })
  await assert.rejects(() => f.service.purchase(f.input('retry')), /Random value/)
  assert.equal((await f.user.reload()).bank, 100)
  assert.equal(await f.models.Ledger.count({ where: { resource: 'bank' } }), 0)
  invalid = false
  assert.equal((await f.service.purchase(f.input('retry'))).receipt.bank, 90)
})

test('fate draw triggering the fifth duplicate exchanges it in the same receipt', async t => {
  const f = await fixture(t)
  const participant = await f.models.Participant.findOne()
  await f.models.Inventory.create({ participantId: participant.id, pieceId: 'had_tl', quantity: 5 })
  const result = await f.service.purchase(f.input('fifth'))
  assert.equal(result.receipt.awards.length, 2)
  assert.equal(result.receipt.awards[1].source, 'duplicate_exchange')
  assert.equal(result.receipt.duplicates, 0)
  assert.equal((await f.user.reload()).bank, 90)
})

test('disabled/closed/paused/unregistered/wrong guild purchases leave the shared bank untouched', async t => {
  const f = await fixture(t)
  await assert.rejects(() => f.service.purchase({ ...f.input('guild'), guildId: 'other' }), /registration/)
  const state = await f.models.EventState.create({ eventId: config.eventId, guildId: 'guild', actionsPaused: true })
  await assert.rejects(() => f.service.purchase(f.input('pause')), /paused/)
  await state.update({ actionsPaused: false })
  f.time(config.endsAt)
  await assert.rejects(() => f.service.purchase(f.input('closed')), /not active/)
  assert.equal((await f.user.reload()).bank, 100)
  const disabled = createFatePurchases({ ...f, event: { ...f.event, enabled: false },
    collection: createCollection({ ...f, participants: createParticipants({ ...f, event: { ...f.event, enabled: false } }), event: { ...f.event, enabled: false } }), canPurchase: () => true })
  f.time(config.startsAt)
  await assert.rejects(() => disabled.purchase(f.input('disabled')), /disabled/)
  assert.equal((await f.user.reload()).bank, 100)
})

test('mixed Bank/Fate payment and Fate-only payment debit ten exactly with matching ledger', async t => {
  for (const [bank, fate, nextFate] of [[7,12,9], [0,10,0]]) {
    const f = await fixture(t, { bank, fate })
    const result = await f.service.purchase({ ...f.input('split'), expectedWallet: { bank, fatePoints: fate } })
    await f.user.reload()
    assert.equal(f.user.bank, 0); assert.equal(f.user.fate_points, nextFate)
    assert.equal(result.receipt.bankSpent + result.receipt.fateSpent, 10)
    const entries = await f.models.Ledger.findAll({ where: { operationId: result.operationId } })
    assert.equal(entries.filter(row => ['bank','fate_points'].includes(row.resource)).reduce((n,row) => n + row.delta, 0), -10)
    const replay = await f.service.purchase({ ...f.input('split'), expectedWallet: { bank, fatePoints: fate } })
    assert.equal(replay.replayed, true); assert.equal((await f.user.reload()).fate_points, nextFate)
  }
})
test('wallet drift invalidates a confirmation instead of switching which balance pays', async t => {
  const f = await fixture(t, { bank: 10, fate: 50 })
  await f.user.update({ bank: 9 })
  await assert.rejects(() => f.service.purchase({ ...f.input('stale'), expectedWallet: { bank: 10, fatePoints: 50 } }), /balances changed/)
  assert.equal(await f.models.Inventory.count(), 0); assert.equal((await f.user.reload()).fate_points, 50)
  assert.equal(await f.models.Operation.count(), 1)
})
test('failed quarter or receipt finalization rolls back both wallets, inventory and ledger', async t => {
  const f = await fixture(t, { bank: 3, fate: 9 })
  const service = createFatePurchases({ ...f, finalizeReceipt: async () => { throw Error('outbox failed') } })
  await assert.rejects(() => service.purchase(f.input('rollback')), /outbox failed/)
  await f.user.reload(); assert.equal(f.user.bank, 3); assert.equal(f.user.fate_points, 9)
  assert.equal(await f.models.Inventory.count(), 0); assert.equal(await f.models.Operation.count(), 1)
  assert.equal(await f.models.Ledger.count({ where: { resource: 'bank' } }), 0)
  assert.equal(await f.models.Ledger.count({ where: { resource: 'fate_points' } }), 0)
})
test('Fate rarity thresholds differ from Eye draws without changing missing-piece exchange', async t => {
  const f = await fixture(t)
  for (const [sample, fateRarity, eyeRarity] of [[0.49,'common','common'], [0.5,'rare','common'], [0.7,'rare','rare'], [0.85,'legendary','rare'], [0.92,'legendary','legendary']]) {
    let calls = 0
    const collection = createCollection({ ...f, random: () => calls++ % 2 === 0 ? sample : 0 })
    const fate = await f.economy.execute({ ...f.input(`fate-${sample}`), operationType: 'rarity_probe' }, ctx => collection.drawFateQuarter(ctx, 'alice'))
    calls = 0
    const eyes = await f.economy.execute({ ...f.input(`eye-${sample}`), operationType: 'rarity_probe' }, ctx => collection.creditEyes(ctx, 'alice', 5))
    assert.equal(fate.receipt.awards[0].rarity, fateRarity)
    assert.equal(eyes.receipt.awards[0].rarity, eyeRarity)
  }
})
