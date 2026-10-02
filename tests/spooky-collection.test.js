const test = require('node:test')
const assert = require('node:assert/strict')
const Sequelize = require('sequelize')
const migration = require('../migrations/20261001000000-create-spooky-core')
const { defineSpookyModels } = require('../services/spooky/models')
const { createEconomy } = require('../services/spooky/economy')
const { createParticipants } = require('../services/spooky/participants')
const { createCollection } = require('../services/spooky/collection')
const { config, pieces } = require('../services/spooky/config')

async function fixture(t, random = () => 0, overrides = {}) {
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => sequelize.close())
  await migration.up(sequelize.getQueryInterface())
  const models = defineSpookyModels(sequelize), event = { ...config, enabled: true, ...overrides }
  const economy = createEconomy({ sequelize, models, configVersion: event.version, clock: () => new Date(config.startsAt) })
  const participants = createParticipants({ models, economy, event })
  const collection = createCollection({ models, participants, event, random })
  const input = key => ({ eventId: config.eventId, guildId: 'guild', actorId: 'alice', interactionId: key, operationType: 'collection_test' })
  await participants.register(input('register'))
  const run = (key, callback) => economy.execute(input(key), callback)
  const owner = () => models.Participant.findOne({ where: { userId: 'alice' } })
  const seed = async quantities => {
    const participant = await owner()
    for (const [pieceId, quantity] of Object.entries(quantities)) await models.Inventory.create({ participantId: participant.id, pieceId, quantity })
  }
  return { models, event, economy, participants, collection, input, run, owner, seed }
}

test('Eye credit automatically consumes each five, with remainder and replay without RNG', async t => {
  let rolls = 0
  const f = await fixture(t, () => { rolls++; return 0 })
  const result = await f.run('credit', ctx => f.collection.creditEyes(ctx, 'alice', 12))
  assert.equal(result.receipt.eyes, 2)
  assert.equal(result.receipt.awards.length, 2)
  assert.equal(result.receipt.awards[1].duplicate, true)
  const replay = await f.run('credit', () => { throw new Error('must not rerun') })
  assert.deepEqual(replay.receipt, result.receipt)
  assert.equal(rolls, 4)
  const entries = await f.models.Ledger.findAll({ where: { resource: 'eyes' } })
  assert.equal(entries.reduce((sum, row) => sum + row.delta, 0), 2)
  assert.ok(entries.every(row => row.configVersion === config.version))
})

test('award ownership is captured at each acquisition and survives later inventory changes/replay', async t => {
  const f = await fixture(t)
  await f.seed({ mrq_tr: 1 })
  const first = await f.run('marq-bottom', ctx => f.collection.grantQuarter(ctx, 'alice', 'mrq_bl'))
  assert.deepEqual(first.receipt.awards[0].ownedPositions, ['tr', 'bl'])
  await f.run('marq-top', ctx => f.collection.grantQuarter(ctx, 'alice', 'mrq_tl'))
  const duplicate = await f.run('marq-duplicate', ctx => f.collection.grantQuarter(ctx, 'alice', 'mrq_bl'))
  assert.deepEqual(duplicate.receipt.awards[0].ownedPositions, ['tl', 'tr', 'bl'])
  const replay = await f.run('marq-bottom', () => { throw new Error('Must replay') })
  assert.deepEqual(replay.receipt.awards[0].ownedPositions, ['tr', 'bl'])
})

test('ordinary rarity boundaries and within-rarity endpoints use approved weights', async t => {
  const values = [0, 0, .699999, .999999, .70, 0, .919999, .999999, .92, 0, .999999, .999999]
  const f = await fixture(t, () => values.shift())
  const awards = []
  for (let i = 0; i < 6; i++) awards.push((await f.run(`draw${i}`, ctx => f.collection.drawQuarter(ctx, 'alice'))).receipt.awards[0])
  assert.deepEqual(awards.map(piece => piece.rarity), ['common', 'common', 'rare', 'rare', 'legendary', 'legendary'])
  assert.deepEqual(awards.map(piece => piece.id), ['had_tl', 'sel_tr', 'had_bl', 'sel_bl', 'had_br', 'sel_br'])
})

test('fifth mixed duplicate automatically consumes only five extras and awards an unowned legendary', async t => {
  const f = await fixture(t, () => .999999)
  await f.seed({ had_tl: 3, hfm_tr: 2, mrq_bl: 2 })
  const result = await f.run('fifth', ctx => f.collection.grantQuarter(ctx, 'alice', 'had_tl'))
  assert.equal(result.receipt.awards.length, 2)
  const exchange = result.receipt.awards[1]
  assert.equal(exchange.id, 'sel_br')
  assert.equal(exchange.duplicate, false)
  assert.equal(exchange.consumed.reduce((sum, item) => sum + item.quantity, 0), 5)
  assert.equal(result.receipt.duplicates, 0)
  assert.ok((await f.models.Inventory.findAll()).every(row => row.quantity === 1))
})

test('batch exchanges, completion and terminal extras retain first copies', async t => {
  const f = await fixture(t)
  await f.seed({ had_tl: 11 })
  const batch = await f.run('batch', ctx => f.collection.exchangeDuplicates(ctx, 'alice'))
  assert.equal(batch.receipt.awards.length, 2)
  assert.equal(batch.receipt.duplicates, 0)
  const owned = await f.models.Inventory.findAll()
  await f.seed(Object.fromEntries(pieces.filter(piece => !owned.some(row => row.pieceId === piece.id)).map(piece => [piece.id, 1])))
  const full = await f.run('full', ctx => f.collection.grantQuarter(ctx, 'alice', 'had_tl'))
  assert.equal(full.receipt.completeCharacters.length, 7)
  assert.equal(full.receipt.ownedPieces, 28)
  assert.equal(full.receipt.duplicates, 1)
  const terminal = await f.run('terminal', ctx => f.collection.exchangeDuplicates(ctx, 'alice'))
  assert.equal(terminal.receipt.awards.length, 0)
  assert.equal(terminal.receipt.duplicates, 1)
})

test('exchange samples all missing IDs uniformly without rarity weighting', async t => {
  const f = await fixture(t)
  // Roll at the midpoint of each equal-width missing-ID bucket; rollback
  // each probe so all 27 candidates remain available for the next probe.
  await f.seed({ had_tl: 6 })
  const missing = pieces.filter(piece => piece.id !== 'had_tl')
  for (let i = 0; i < missing.length; i++) {
    const probe = createCollection({ models: f.models, participants: f.participants, event: f.event, random: () => (i + .5) / missing.length })
    await assert.rejects(() => f.run(`probe${i}`, async ctx => {
      const result = await probe.exchangeDuplicates(ctx, 'alice')
      assert.equal(result.awards[0].id, missing[i].id)
      throw new Error('probe rollback')
    }), /probe rollback/)
  }
})

test('Eye theft transfers then converts atomically, and failed award restores both balances', async t => {
  const f = await fixture(t)
  await f.participants.register({ ...f.input('bob'), actorId: 'bob' })
  await (await f.owner()).update({ eyes: 4 })
  await f.models.Participant.update({ eyes: 1 }, { where: { userId: 'bob' } })
  const broken = createCollection({ models: f.models, participants: f.participants, event: f.event, random: () => 1 })
  await assert.rejects(() => f.run('failed', ctx => broken.creditEyes(ctx, 'alice', 1, { fromUserId: 'bob' })), /Random value/)
  assert.equal((await f.owner()).eyes, 4)
  assert.equal((await f.models.Participant.findOne({ where: { userId: 'bob' } })).eyes, 1)
  const result = await f.run('success', ctx => f.collection.creditEyes(ctx, 'alice', 1, { fromUserId: 'bob' }))
  assert.equal(result.receipt.eyes, 0)
  assert.equal(result.receipt.awards.length, 1)
  const transferRows = await f.models.Ledger.findAll({ where: { resource: 'eyes', operationId: 'discord:success' } })
  assert.equal(transferRows.filter(row => row.relatedUserId).reduce((sum, row) => sum + row.delta, 0), 0)
})

test('concurrent credits and duplicate grants resolve once without losing extras', async t => {
  const f = await fixture(t)
  const results = await Promise.all(Array.from({ length: 30 }, (_, i) => f.run(`credit${i}`, ctx => f.collection.creditEyes(ctx, 'alice', 1))))
  const awards = results.flatMap(result => result.receipt.awards)
  assert.equal(awards.filter(piece => piece.source === 'eye_draw').length, 6)
  assert.equal(awards.filter(piece => piece.source === 'duplicate_exchange').length, 1)
  assert.equal((await f.owner()).eyes, 0)
  assert.deepEqual((await f.models.Inventory.findAll()).map(row => row.quantity), [1, 1])
})

test('provisional odds block ordinary awards but not duplicate exchange; unknown inventory fails safely', async t => {
  const f = await fixture(t, () => 0, { ordinaryRarity: { ...config.ordinaryRarity, status: 'provisional-for-simulation' } })
  await assert.rejects(() => f.run('blocked', ctx => f.collection.creditEyes(ctx, 'alice', 1)), /provisional/)
  assert.equal((await f.owner()).eyes, 0)
  await f.seed({ had_tl: 6 })
  assert.equal((await f.run('exchange', ctx => f.collection.exchangeDuplicates(ctx, 'alice'))).receipt.awards.length, 1)
  await assert.rejects(() => f.run('bad-id', ctx => f.collection.grantQuarter(ctx, 'alice', 'bad')), /Unknown/)
  await f.seed({ corrupt: 1 })
  await assert.rejects(() => f.run('corrupt', ctx => f.collection.exchangeDuplicates(ctx, 'alice')), /Invalid collection inventory/)
  assert.equal((await f.owner()).eyes, 0)
})

test('collection rejects nonregistered players and operational pause', async t => {
  const f = await fixture(t)
  await assert.rejects(() => f.run('unregistered', ctx => f.collection.creditEyes(ctx, 'bob', 1)), /registration/)
  assert.equal(await f.models.Participant.count(), 1)
  await f.models.EventState.create({ eventId: config.eventId, guildId: 'guild', actionsPaused: true })
  await assert.rejects(() => f.run('paused', ctx => f.collection.creditEyes(ctx, 'alice', 5)), /paused/)
  assert.equal((await f.owner()).eyes, 0)
})

test('last missing piece stops batch exchange and retains remaining extras', async t => {
  const f = await fixture(t)
  await f.seed(Object.fromEntries(pieces.filter(piece => piece.id !== 'sel_br').map(piece => [piece.id, piece.id === 'had_tl' ? 11 : 1])))
  const result = await f.run('last', ctx => f.collection.exchangeDuplicates(ctx, 'alice'))
  assert.equal(result.receipt.awards.length, 1)
  assert.equal(result.receipt.awards[0].id, 'sel_br')
  assert.equal(result.receipt.duplicates, 5)
  assert.equal(result.receipt.completeCharacters.length, 7)
})

test('failed duplicate reward restores consumed extras and retries safely', async t => {
  let bad = true
  const f = await fixture(t, () => bad ? NaN : 0)
  await f.seed({ had_tl: 6 })
  const ledgerBefore = await f.models.Ledger.count()
  await assert.rejects(() => f.run('exchange-retry', ctx => f.collection.exchangeDuplicates(ctx, 'alice')), /Random value/)
  assert.equal((await f.models.Inventory.findOne()).quantity, 6)
  assert.equal(await f.models.Ledger.count(), ledgerBefore)
  bad = false
  const result = await f.run('exchange-retry', ctx => f.collection.exchangeDuplicates(ctx, 'alice'))
  assert.equal(result.receipt.awards.length, 1)
  const replay = await f.run('exchange-retry', () => { throw new Error('reroll') })
  assert.deepEqual(replay.receipt, result.receipt)
})
