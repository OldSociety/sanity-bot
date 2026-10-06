const test = require('node:test')
const assert = require('node:assert/strict')
const Sequelize = require('sequelize')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const migration = require('../migrations/20261001000000-create-spooky-core')
const { defineSpookyModels } = require('../services/spooky/models')
const { createEconomy } = require('../services/spooky/economy')

async function fixture(t) {
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => sequelize.close())
  await migration.up(sequelize.getQueryInterface())
  const models = defineSpookyModels(sequelize)
  const economy = createEconomy({ sequelize, models, clock: () => new Date('2026-10-02T12:00:00Z') })
  const scope = { eventId: 'spooky-2026', guildId: 'guild-a' }
  async function participant(userId, values = {}) {
    return models.Participant.create({ ...scope, userId, refillAnchor: new Date('2026-10-01T07:00:00Z'), ...values })
  }
  const input = (interactionId, extra = {}) => ({ ...scope, actorId: 'alice', operationType: 'test-transfer', interactionId, ...extra })
  return { sequelize, models, economy, scope, participant, input }
}

test('migration up/down is reversible and leaves existing tables untouched', async t => {
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => sequelize.close())
  await sequelize.query('CREATE TABLE ExistingUserData (value TEXT NOT NULL)')
  await sequelize.query("INSERT INTO ExistingUserData VALUES ('preserve-me')")
  await migration.up(sequelize.getQueryInterface())
  const tables = await sequelize.getQueryInterface().showAllTables()
  assert.equal(tables.filter(name => name.startsWith('Spooky')).length, 6)
  await migration.down(sequelize.getQueryInterface())
  assert.deepEqual(await sequelize.getQueryInterface().showAllTables(), ['ExistingUserData'])
  await migration.up(sequelize.getQueryInterface())
  const [rows] = await sequelize.query('SELECT value FROM ExistingUserData')
  assert.equal(rows[0].value, 'preserve-me')
})

test('database constraints reject duplicate identities, raw negative balances and invalid inventory', async t => {
  const f = await fixture(t), alice = await f.participant('alice')
  await assert.rejects(() => f.participant('alice'), /Validation|constraint/i)
  await assert.rejects(() => f.sequelize.query('UPDATE SpookyParticipants SET eyes = -1'))
  await assert.rejects(() => f.sequelize.query('UPDATE SpookyParticipants SET candy = 81'))
  await assert.rejects(() => f.sequelize.query('UPDATE SpookyParticipants SET eyes = 1.5'))
  await f.models.Inventory.create({ participantId: alice.id, pieceId: 'had_tl', quantity: 1 })
  await assert.rejects(() => f.models.Inventory.create({ participantId: alice.id, pieceId: 'had_tl', quantity: 2 }))
  await assert.rejects(() => f.models.Inventory.create({ participantId: 999, pieceId: 'had_tr', quantity: 1 }))
  await assert.rejects(() => f.sequelize.query('UPDATE SpookyInventory SET quantity = 0'))
})

test('a transfer persists zero-sum linked ledger entries and a durable receipt', async t => {
  const f = await fixture(t)
  await f.participant('alice', { eyes: 0 }); await f.participant('bob', { eyes: 2 })
  const result = await f.economy.execute(f.input('transfer-1'), async ctx => {
    await ctx.transfer('bob', 'alice', 'eyes', 1, { outcome: 'steal_or_find_eye' })
    return { eyesStolen: 1 }
  })
  assert.equal(result.replayed, false)
  assert.deepEqual(result.receipt, { eyesStolen: 1 })
  const ledger = await f.models.Ledger.findAll({ order: [['id', 'ASC']] })
  assert.equal(ledger.length, 2)
  assert.equal(ledger.reduce((sum, row) => sum + row.delta, 0), 0)
  assert.equal(ledger[0].relatedUserId, 'alice')
  assert.equal(ledger[1].relatedUserId, 'bob')
  assert.ok(ledger.every(row => row.operationId === result.operationId && row.interactionId === 'transfer-1'))
  assert.equal((await f.models.Participant.findOne({ where: { ...f.scope, userId: 'bob' } })).eyes, 1)
})

test('repeated concurrent interactions run once, including across two service instances', async t => {
  const f = await fixture(t); await f.participant('alice')
  const second = createEconomy({ sequelize: f.sequelize, models: f.models })
  let executions = 0
  const mutate = async ctx => { executions++; await ctx.changeBalance('alice', 'eyes', 1); return { quarter: 'test-receipt' } }
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? second : f.economy).execute(f.input('repeat-1'), mutate)))
  assert.equal(executions, 1)
  assert.equal(results.filter(r => !r.replayed).length, 1)
  assert.ok(results.every(r => r.receipt.quarter === 'test-receipt'))
  assert.equal(await f.models.Ledger.count(), 1)
  assert.equal(await f.models.Operation.count(), 1)
  await assert.rejects(() => f.economy.execute(f.input('repeat-1', { actorId: 'mallory' }), mutate), /identity mismatch/)
  assert.equal(executions, 1)
})

test('failed second side of transfer rolls back balances, ledger and operation', async t => {
  const f = await fixture(t)
  await f.participant('alice', { candy: 80 }); await f.participant('bob', { candy: 10 })
  await assert.rejects(() => f.economy.execute(f.input('overflow'), async ctx => {
    await ctx.transfer('bob', 'alice', 'candy', 1); return { ok: true }
  }), /bounds/)
  assert.equal((await f.models.Participant.findOne({ where: { ...f.scope, userId: 'bob' } })).candy, 10)
  assert.equal(await f.models.Operation.count(), 0)
  assert.equal(await f.models.Ledger.count(), 0)
})

test('callback failure is atomic and failed operation can be retried without partial awards', async t => {
  const f = await fixture(t); await f.participant('alice')
  await assert.rejects(() => f.economy.execute(f.input('retry'), async ctx => {
    await ctx.changeBalance('alice', 'eyes', 2)
    throw new Error('simulated failure')
  }), /simulated failure/)
  assert.equal((await f.models.Participant.findOne({ where: { ...f.scope, userId: 'alice' } })).eyes, 0)
  assert.equal(await f.models.Ledger.count(), 0)
  const result = await f.economy.execute(f.input('retry'), async ctx => {
    await ctx.changeBalance('alice', 'eyes', 2); return { gained: 2 }
  })
  assert.equal(result.replayed, false)
  assert.equal(await f.models.Ledger.count(), 1)
})

test('competing transfers preserve the last Eye and can steal only the spare Eye', async t => {
  const f = await fixture(t)
  await f.participant('alice'); await f.participant('carol'); await f.participant('bob', { eyes: 2 })
  const steal = user => async ctx => { await ctx.transfer('bob', user, 'eyes', 1); return { stolen: 1 } }
  const outcomes = await Promise.allSettled([
    f.economy.execute(f.input('race-a'), steal('alice')),
    f.economy.execute(f.input('race-c', { actorId: 'carol' }), steal('carol')),
  ])
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1)
  const balances = await f.models.Participant.findAll()
  assert.equal(balances.reduce((sum, p) => sum + p.eyes, 0), 2)
  assert.equal(balances.find(p => p.userId === 'bob').eyes, 1)
  assert.equal(await f.models.Operation.count(), 1)
  assert.equal(await f.models.Ledger.count(), 2)
})

test('owner can spend the final Eye but another player cannot transfer it away', async t => {
  const f = await fixture(t)
  await f.participant('alice'); await f.participant('bob', { eyes: 1 })
  await assert.rejects(() => f.economy.execute(f.input('last-eye'), ctx => ctx.transfer('bob', 'alice', 'eyes', 1)), /last Evil Eye/)
  assert.equal(await f.models.Ledger.count(), 0)
  await f.economy.execute(f.input('owner-spends', { actorId: 'bob' }), async ctx => { await ctx.changeBalance('bob', 'eyes', -1); return {} })
  assert.equal((await f.models.Participant.findOne({ where: { userId: 'bob' } })).eyes, 0)
})

test('balances are isolated by guild/event and worker keys do not collide across scopes', async t => {
  const f = await fixture(t)
  await f.participant('alice')
  await f.participant('alice', { guildId: 'guild-b', eyes: 7 })
  await f.economy.execute(f.input('scope'), async ctx => { await ctx.changeBalance('alice', 'eyes', 1); return { ok: true } })
  assert.equal((await f.models.Participant.findOne({ where: { eventId: f.scope.eventId, guildId: 'guild-b', userId: 'alice' } })).eyes, 7)
  for (const guildId of ['guild-a', 'guild-b']) {
    const input = { eventId: f.scope.eventId, guildId, actorId: 'worker', operationType: 'refill', workerKey: 'tick-1' }
    const result = await f.economy.execute(input, () => ({ tick: 1 }))
    assert.equal(result.replayed, false)
    assert.equal((await f.economy.execute(input, () => { throw new Error('must not repeat') })).replayed, true)
  }
})

test('invalid receipts/ledger deltas roll back and history survives participant removal', async t => {
  const f = await fixture(t), alice = await f.participant('alice')
  await assert.rejects(() => f.economy.execute(f.input('no-receipt'), async ctx => { await ctx.changeBalance('alice', 'eyes', 1) }), /receipt/)
  await assert.rejects(() => f.economy.execute(f.input('bad-ledger'), async ctx => {
    await ctx.record({ userId: 'alice', resource: 'eyes', delta: 1, before: 0, after: 5 }); return {}
  }), /delta/)
  assert.equal(await f.models.Operation.count(), 0)
  await f.economy.execute(f.input('preserved'), async ctx => { await ctx.changeBalance('alice', 'eyes', 1); return {} })
  await f.models.Inventory.create({ participantId: alice.id, pieceId: 'had_tl', quantity: 1 })
  await alice.destroy()
  assert.equal(await f.models.Inventory.count(), 0)
  assert.equal(await f.models.Ledger.count(), 1)
  assert.equal(await f.models.Operation.count(), 1)
  await assert.rejects(() => f.models.Operation.destroy({ where: { operationId: 'discord:preserved' } }))
})

test('independent SQLite connections serialize the same operation and replay a persisted receipt', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'spooky-contention-test-'))
  const storage = path.join(directory, 'disposable.sqlite')
  const first = new Sequelize({ dialect: 'sqlite', storage, logging: false })
  const second = new Sequelize({ dialect: 'sqlite', storage, logging: false })
  t.after(async () => {
    await Promise.all([first.close(), second.close()])
    // Remove only these explicit disposable files; no recursive path deletion.
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      const file = storage + suffix
      if (fs.existsSync(file)) fs.unlinkSync(file)
    }
    fs.rmdirSync(directory)
  })
  await migration.up(first.getQueryInterface())
  const a = defineSpookyModels(first), b = defineSpookyModels(second)
  const identity = { eventId: 'spooky-2026', guildId: 'guild-a', actorId: 'alice', operationType: 'contention', interactionId: 'persisted-interaction' }
  await a.Participant.create({ eventId: identity.eventId, guildId: identity.guildId, userId: 'alice', refillAnchor: new Date() })
  let executions = 0
  const mutate = async ctx => {
    executions++
    await ctx.changeBalance('alice', 'eyes', 1)
    return { eyes: 1, outcome: 'find_eye' }
  }
  const outcomes = await Promise.allSettled([
    createEconomy({ sequelize: first, models: a }).execute(identity, mutate),
    createEconomy({ sequelize: second, models: b }).execute(identity, mutate),
  ])
  assert.ok(outcomes.every(r => r.status === 'fulfilled'), outcomes.filter(r => r.status === 'rejected').map(r => r.reason.message).join('; '))
  assert.equal(executions, 1)
  assert.equal(await a.Operation.count(), 1)
  assert.equal(await a.Ledger.count(), 1)
  const replay = await createEconomy({ sequelize: second, models: b }).execute(identity, () => { throw new Error('receipt must replay') })
  assert.equal(replay.replayed, true)
  assert.deepEqual(replay.receipt, { eyes: 1, outcome: 'find_eye' })
})
