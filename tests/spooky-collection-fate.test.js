const test = require('node:test')
const assert = require('node:assert/strict')
const Sequelize = require('sequelize')
const { config, pieces } = require('../services/spooky/config')

async function fixture(t, bank = 0) {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => db.close())
  const User = require('../Models/User/User')(db, Sequelize.DataTypes)
  await User.sync()
  await require('../migrations/20261001000000-create-spooky-core').up(db.getQueryInterface())
  const models = require('../services/spooky/models').defineSpookyModels(db)
  const event = { ...config, enabled: true }
  const economy = require('../services/spooky/economy').createEconomy({ sequelize: db, models,
    configVersion: event.version, clock: () => new Date(event.startsAt) })
  const participants = require('../services/spooky/participants').createParticipants({ models, economy, event })
  const collection = require('../services/spooky/collection').createCollection({ User, models, participants, event, random: () => 0 })
  const input = id => ({ eventId: event.eventId, guildId: 'guild', actorId: 'alice', interactionId: id, operationType: 'test' })
  await participants.register(input('register'))
  const user = await User.create({ user_id: 'alice', user_name: 'Alice', bank, fate_points: 50 })
  const player = await models.Participant.findOne()
  const run = (id, fn) => economy.execute(input(id), fn)
  const backfill = require('../services/spooky/collection-fate-backfill').createCollectionFateBackfill({ User, models, economy, event, guildId: 'guild' })
  return { db, User, models, user, player, event, collection, run, backfill }
}

test('28 unique pieces award exactly 30 banked Fate, including +2 on the last piece; replay is inert', async t => {
  const f = await fixture(t, 5) // Existing Crown reward is preserved.
  let last
  for (const piece of pieces) last = await f.run(piece.id, ctx => f.collection.grantQuarter(ctx, 'alice', piece.id))
  assert.equal((await f.user.reload()).bank, 35)
  assert.equal(f.user.fate_points, 50)
  assert.equal(last.receipt.awards[0].fateReward.credited, 3)
  assert.equal(last.receipt.awards[0].fateReward.completionBonus, 2)
  const replay = await f.run(pieces.at(-1).id, () => { throw Error('must replay') })
  assert.equal(replay.replayed, true)
  assert.equal((await f.user.reload()).bank, 35)
  assert.equal(await f.models.Ledger.count({ where: { resource: 'bank' } }), 28)
})

test('duplicates earn zero; a missing piece from duplicate exchange earns one', async t => {
  const f = await fixture(t)
  for (const piece of pieces.filter(piece => piece.characterId === 'mrq')) await f.run(piece.id, ctx => f.collection.grantQuarter(ctx, 'alice', piece.id))
  let result
  for (let i = 0; i < 5; i++) result = await f.run(`duplicate-${i}`, ctx => f.collection.grantQuarter(ctx, 'alice', 'mrq_tl'))
  assert.equal(result.receipt.awards[0].fateReward, undefined)
  assert.equal(result.receipt.awards[1].source, 'duplicate_exchange')
  assert.equal(result.receipt.awards[1].fateReward.credited, 1)
  assert.equal((await f.user.reload()).bank, 5)
})

test('Eye conversion credits the piece recipient rather than another actor', async t => {
  const f = await fixture(t)
  await f.User.create({ user_id: 'bob', user_name: 'Bob', bank: 7 })
  const result = await f.run('eyes', ctx => f.collection.creditEyes(ctx, 'alice', 5))
  assert.equal(result.receipt.awards[0].fateReward.credited, 1)
  assert.equal((await f.user.reload()).bank, 1)
  assert.equal((await f.User.findByPk('bob')).bank, 7)
})

test('bank caps and historical above-cap balances remain intact; failures roll inventory and wallet back together', async t => {
  for (const bank of [99, 100, 120]) {
    const f = await fixture(t, bank)
    const r = await f.run('first', ctx => f.collection.grantQuarter(ctx, 'alice', pieces[0].id))
    assert.equal(r.receipt.awards[0].fateReward.credited, bank < 100 ? 1 : 0)
    assert.equal((await f.user.reload()).bank, Math.max(bank, 100))
  }
  const f = await fixture(t)
  await assert.rejects(f.run('rollback', async ctx => {
    await f.collection.grantQuarter(ctx, 'alice', pieces[0].id)
    throw Error('rollback')
  }), /rollback/)
  assert.equal((await f.user.reload()).bank, 0)
  assert.equal(await f.models.Inventory.count(), 0)
  assert.equal(await f.models.Ledger.count({ where: { resource: 'bank' } }), 0)
})

test('backfill counts distinct pieces, preserves Crown/Fate, pays full-collection bonus once and never pays duplicates or another guild', async t => {
  const f = await fixture(t, 5)
  for (const piece of pieces) await f.models.Inventory.create({ participantId: f.player.id, pieceId: piece.id, quantity: 5 })
  await f.models.Participant.create({ eventId: config.eventId, guildId: 'other', userId: 'outsider', refillAnchor: new Date() })
  const plan = await f.backfill.plan()
  assert.equal(plan.credited, 30)
  assert.equal(plan.completionBonuses, 2)
  assert.equal((await f.user.reload()).bank, 5)
  const results = await Promise.all([f.backfill.apply(), f.backfill.apply()])
  assert.equal(results.filter(r => !r.replayed).length, 1)
  assert.equal((await f.user.reload()).bank, 35)
  assert.equal(f.user.fate_points, 50)
  assert.equal(await f.models.Inventory.count(), 28)
  assert.equal((await f.backfill.plan()).replayed, true)
})

test('backfill subtracts collection rewards already paid; later discoveries still earn one', async t => {
  const f = await fixture(t)
  await f.models.Inventory.create({ participantId: f.player.id, pieceId: pieces[0].id, quantity: 3 })
  await f.run('new-piece', ctx => f.collection.grantQuarter(ctx, 'alice', pieces[1].id))
  const plan = await f.backfill.plan()
  assert.equal(plan.credited, 1)
  await f.backfill.apply()
  assert.equal((await f.user.reload()).bank, 2)
  await f.run('later-piece', ctx => f.collection.grantQuarter(ctx, 'alice', pieces[2].id))
  assert.equal((await f.user.reload()).bank, 3)
  await f.backfill.apply()
  assert.equal((await f.user.reload()).bank, 3)
})

test('piece and completion reveals explain collection Fate; help no longer advertises random drops', () => {
  const ui = require('../services/spooky/presentation')
  const award = { ...pieces[0], ownedPositions: ['tl'], fateReward: { credited: 1, capped: 0, completionBonus: 0 } }
  const messages = ui.actionMessages({ result: { awards: [award] } }, {
    actorId: 'alice', members: [{ userId: 'alice', displayName: 'Alice' }], registeredIds: new Set(), variantKey: 'test' })
  assert.match(JSON.stringify(messages), /Collection Fate.*\+1 added to your Bank/)
  assert.match(JSON.stringify(ui.helpScreen()), /30 Fate Points total/)
  assert.doesNotMatch(JSON.stringify(ui.helpScreen()), /3%|chance.*Fate|Fate drops/)
})

test('online backup captures a WAL database and verifies integrity without changing the source', async t => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), sqlite = require('sqlite3')
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'spooky-piece-backup-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const source = path.join(directory, 'source.sqlite'), destination = path.join(directory, 'backup.sqlite')
  const db = new sqlite.Database(source)
  const execute = sql => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()))
  try {
    await execute('PRAGMA journal_mode=WAL; CREATE TABLE sentinel (value TEXT); INSERT INTO sentinel VALUES (\'preserved\')')
    const { onlineBackup, verifyDatabase } = require('../scripts/spooky/spooky-collection-fate-backfill')
    await onlineBackup(source, destination)
    assert.deepEqual(await verifyDatabase(destination), { integrity: 'ok', foreignKeys: 0 })
    const restored = new sqlite.Database(destination, sqlite.OPEN_READONLY)
    try {
      const rows = await new Promise((resolve, reject) => restored.all('SELECT * FROM sentinel', (error, rows) => error ? reject(error) : resolve(rows)))
      assert.deepEqual(rows, [{ value: 'preserved' }])
    } finally { await new Promise(resolve => restored.close(resolve)) }
    await assert.rejects(onlineBackup(source, destination), /already exists/)
  } finally { await new Promise(resolve => db.close(resolve)) }
})
