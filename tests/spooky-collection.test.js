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
  // Historical duplicate/replay fixtures explicitly retain the old policy.
  const models = defineSpookyModels(sequelize), event = { ...config, enabled: true, duplicates: { ...config.duplicates, allowDuplicates: true }, ...overrides }
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

test('unique draws fill all28 quarters without repetition and retain Eyes after completion', async t => {
  const f = await fixture(t, () => 0, { duplicates: { ...config.duplicates, allowDuplicates: false } })
  const credited = await f.run('unique-fill', ctx => f.collection.creditEyes(ctx, 'alice', 142))
  assert.equal(credited.receipt.awards.length, 28)
  assert.equal(new Set(credited.receipt.awards.map(a => a.id)).size, 28)
  assert.equal(credited.receipt.completeCharacters.length, 7)
  assert.equal(credited.receipt.eyes, 2)
  assert.ok((await f.models.Inventory.findAll()).every(row => row.quantity === 1))
  await assert.rejects(f.run('unique-full-paid', ctx => f.collection.drawFateQuarter(ctx, 'alice')), /complete/)
  await assert.rejects(f.run('unique-full-grant', ctx => f.collection.grantQuarter(ctx, 'alice', 'had_tl')), /already owned/)
  const held = await f.run('unique-full-eyes', ctx => f.collection.creditEyes(ctx, 'alice', 5))
  assert.equal(held.receipt.eyes, 7); assert.equal(held.receipt.awards.length, 0)
})
test('unique draws reweight remaining rarities rather than discarding exhausted-pool draws', async t => {
  const f = await fixture(t, () => 0, { duplicates: { ...config.duplicates, allowDuplicates: false } })
  await f.seed(Object.fromEntries(pieces.filter(p => p.rarity === 'common').map(p => [p.id, 1])))
  const drawn = await f.run('rare-remaining', ctx => f.collection.drawQuarter(ctx, 'alice'))
  assert.equal(drawn.receipt.awards[0].rarity, 'rare')
  assert.equal(drawn.receipt.awards[0].duplicate, false)
})
test('quiet cutover gives4 Eyes per extra once across concurrent and replayed runs', async t => {
  const f = await fixture(t, () => 0, { duplicates: { ...config.duplicates, allowDuplicates: false } })
  await f.seed({ mrq_bl: 2, had_tl: 3 }); await (await f.owner()).update({ eyes: 2 })
  const compensation = require('../services/spooky/duplicate-compensation').createDuplicateCompensation({ models: f.models, economy: f.economy, event: f.event })
  const scope = { eventId: config.eventId, guildId: 'guild' }
  const results = await Promise.all([compensation.run(scope), compensation.run(scope)])
  assert.equal(results.filter(r => !r.replayed).length, 1)
  assert.equal(results[0].receipt.extras, 3); assert.equal(results[0].receipt.eyesCredited, 12)
  assert.equal((await f.owner()).eyes, 14)
  assert.ok((await f.models.Inventory.findAll()).every(row => row.quantity === 1))
  assert.equal(await f.models.Ledger.count({ where: { resource: 'eyes' } }), 1)
  assert.equal((await compensation.run(scope)).replayed, true)
})
test('quiet cutover rolls back removed extras if Eye credit overflows', async t => {
  const f = await fixture(t, () => 0, { duplicates: { ...config.duplicates, allowDuplicates: false } })
  await f.seed({ mrq_bl: 2 }); await (await f.owner()).update({ eyes: Number.MAX_SAFE_INTEGER })
  const compensation = require('../services/spooky/duplicate-compensation').createDuplicateCompensation({ models: f.models, economy: f.economy, event: f.event })
  await assert.rejects(compensation.run({ eventId: config.eventId, guildId: 'guild' }), /overflow|bounds/i)
  assert.equal((await f.models.Inventory.findOne()).quantity, 2)
})

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

test('rarity update preserves owned IDs and old acquisition receipts while new grants use current metadata', async t => {
  const f = await fixture(t)
  const oldEconomy = createEconomy({ sequelize: f.models.Participant.sequelize, models: f.models, configVersion: 4, clock: () => new Date(config.startsAt) })
  const historical = await oldEconomy.execute(f.input('old-bottom-left'), async ctx => {
    const player = await f.models.Participant.findOne({ where: { userId: 'alice' }, transaction: ctx.transaction })
    await f.models.Inventory.create({ participantId: player.id, pieceId: 'had_bl', quantity: 1 }, { transaction: ctx.transaction })
    await ctx.record({ userId: 'alice', resource: 'quarter:had_bl', delta: 1, before: 0, after: 1, metadata: { rarity: 'rare' } })
    return { awards: [{ id: 'had_bl', rarity: 'rare', color: '#9B59B6' }] }
  })
  const replay = await f.run('old-bottom-left', () => { throw new Error('Never regenerate an old award') })
  assert.deepEqual(replay.receipt, historical.receipt)
  const next = await f.run('new-bottom-left', ctx => f.collection.grantQuarter(ctx, 'alice', 'had_bl'))
  assert.equal(next.receipt.awards[0].rarity, 'common')
  assert.equal(next.receipt.awards[0].color, '#3498DB')
  assert.equal(next.receipt.awards[0].duplicate, true)
  assert.equal((await f.models.Inventory.findOne({ where: { pieceId: 'had_bl' } })).quantity, 2)
  const entries = await f.models.Ledger.findAll({ where: { resource: 'quarter:had_bl' }, order: [['id','ASC']] })
  assert.deepEqual(entries.map(row => row.configVersion), [4, config.version])
})

test('ordinary rarity boundaries and within-rarity endpoints use approved weights', async t => {
  const values = [0, 0, .699999, .999999, .70, 0, .919999, .999999, .92, 0, .999999, .999999]
  const f = await fixture(t, () => values.shift())
  const awards = []
  for (let i = 0; i < 6; i++) awards.push((await f.run(`draw${i}`, ctx => f.collection.drawQuarter(ctx, 'alice'))).receipt.awards[0])
  assert.deepEqual(awards.map(piece => piece.rarity), ['common', 'common', 'rare', 'rare', 'legendary', 'legendary'])
  assert.deepEqual(awards.map(piece => piece.id), ['had_tl', 'sel_br', 'had_br', 'qam_br', 'hfm_br', 'nik_br'])
})

test('every character-specific piece is reachable through its current ordinary rarity bucket', async t => {
  const values = [], expected = []
  for (const [rarity, rarityRoll] of [['common', 0.2], ['rare', 0.8], ['legendary', 0.95]]) {
    const pool = pieces.filter(piece => piece.rarity === rarity)
    pool.forEach((piece, index) => { expected.push(piece); values.push(rarityRoll, (index + 0.5) / pool.length) })
  }
  const f = await fixture(t, () => values.shift())
  for (const piece of expected) {
    const result = await f.run('reach-' + piece.id, ctx => f.collection.drawQuarter(ctx, 'alice'))
    assert.equal(result.receipt.awards[0].id, piece.id)
    assert.equal(result.receipt.awards[0].rarity, piece.rarity)
    assert.equal(result.receipt.awards[0].color, piece.color)
  }
  assert.equal(await f.models.Inventory.count(), 28)
  assert.equal(values.length, 0)
})

test('fifth mixed duplicate automatically consumes only five extras and awards an unowned piece', async t => {
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
  await f.models.Participant.update({ eyes: 2 }, { where: { userId: 'bob' } })
  const broken = createCollection({ models: f.models, participants: f.participants, event: f.event, random: () => 1 })
  await assert.rejects(() => f.run('failed', ctx => broken.creditEyes(ctx, 'alice', 1, { fromUserId: 'bob' })), /Random value/)
  assert.equal((await f.owner()).eyes, 4)
  assert.equal((await f.models.Participant.findOne({ where: { userId: 'bob' } })).eyes, 2)
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


test('duplicate award snapshots fifth extra before exchange and replays that count', async t => {
  const f = await fixture(t)
  await f.seed({ sel_tl: 5 })
  const result = await f.run('fifth-extra', ctx => f.collection.grantQuarter(ctx, 'alice', 'sel_tl'))
  assert.equal(result.receipt.awards[0].duplicates, 5)
  assert.equal(result.receipt.awards[0].duplicate, true)
  assert.equal(result.receipt.duplicates, 0)
  const replay = await f.run('fifth-extra', () => { throw new Error('must replay') })
  assert.equal(replay.receipt.awards[0].duplicates, 5)
})
