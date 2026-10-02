const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const Sequelize = require('sequelize')
const { migrationGroups, selectDevelopmentTarget, inspectDatabase, createMigrationPlan, applyMigrations } = require('../services/spooky/storage-tools')
const { parseArguments } = require('../scripts/spooky-storage')

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spooky-apply-'))
  await fs.mkdir(path.join(root, 'config'))
  await fs.writeFile(path.join(root, '.env.development'), 'TOKEN=synthetic\nCLIENTID=111111111111111111\nGUILDID=222222222222222222\n')
  await fs.writeFile(path.join(root, '.env.production'), 'TOKEN=other\nCLIENTID=333333333333333333\nGUILDID=444444444444444444\n')
  const storage = path.join(root, 'config', 'dev.sqlite')
  const db = new Sequelize({ dialect: 'sqlite', storage, logging: false })
  await db.query('PRAGMA journal_mode = WAL')
  await db.query('CREATE TABLE Sentinel (bank INTEGER NOT NULL)')
  await db.query('INSERT INTO Sentinel VALUES (73)')
  t.after(async () => {
    await db.close()
    assert.equal(path.dirname(root), await fs.realpath(os.tmpdir()))
    assert.ok(path.basename(root).startsWith('spooky-apply-'))
    await fs.rm(root, { recursive: true, force: true })
  })
  const target = await selectDevelopmentTarget({ environment: 'development', root })
  const plan = async options => createMigrationPlan(await inspectDatabase(target), options)
  const apply = async options => applyMigrations(target, { confirmStopped: true, planHash: (await plan(options)).planHash, ...options })
  return { root, db, target, plan, apply }
}

test('apply CLI requires reviewed hash and stopped declaration, with explicit adoption mode', () => {
  const hash = 'a'.repeat(64)
  assert.deepEqual(parseArguments(['apply', '--development', '--confirm-stopped', '--plan-hash', hash, '--adopt-matching'], 'development'),
    { command: 'apply', confirmStopped: true, adoptMatching: true, planHash: hash })
  for (const args of [['apply', '--development'], ['apply', '--development', '--confirm-stopped'],
    ['apply', '--development', '--confirm-stopped', '--plan-hash', 'bad'], ['plan', '--development', '--confirm-stopped']]) assert.throws(() => parseArguments(args, 'development'))
})

test('fresh apply atomically records hashes and backup, preserves legacy rows, restart is no-op', async t => {
  const f = await fixture(t), result = await f.apply()
  assert.equal(result.atomicSchemaAndTracking, true)
  assert.equal(result.status.classification, 'complete')
  assert.equal(result.applied.length, 4)
  assert.equal(result.status.tracking.provenance.length, 4)
  assert.ok(result.status.tracking.provenance.every(row => row.source === 'applied' && row.backupPath === result.backupPath))
  const manifest = JSON.parse(await fs.readFile(path.join(path.dirname(result.backupPath), 'manifest.json')))
  assert.equal(manifest.status.classification, 'absent')
  assert.equal((await f.db.query('SELECT bank FROM Sentinel', { type: Sequelize.QueryTypes.SELECT }))[0].bank, 73)
  assert.equal((await f.apply()).noOp, true)
  assert.equal((await fs.readdir(path.join(f.root, 'config', 'backups'))).length, 1)
})

test('matching untracked prefix requires adoption and does not rerun existing migration', async t => {
  const f = await fixture(t)
  await require(`../migrations/${migrationGroups[0].name}`).up(f.db.getQueryInterface())
  assert.equal((await f.plan()).ready, false)
  await assert.rejects(() => f.apply(), /adoption/)
  const result = await f.apply({ adoptMatching: true })
  assert.deepEqual(result.adopted, [migrationGroups[0].name])
  assert.equal(result.applied.length, 3)
  assert.equal(result.status.tracking.provenance[0].source, 'adopted')
})

for (const stage of ['after_migration', 'before_commit']) test(`failure at ${stage} rolls back schema and tracking, retaining verified backup`, async t => {
  const f = await fixture(t)
  await assert.rejects(() => f.apply({ onCheckpoint: async checkpoint => {
    if (checkpoint.stage === stage) throw new Error('injected interruption')
  } }), /backup retained.*injected interruption/)
  const status = await inspectDatabase(f.target)
  assert.equal(status.classification, 'absent')
  assert.equal(status.tracking.tablePresent, false)
  assert.equal(status.tracking.provenanceTablePresent, false)
  assert.equal((await fs.readdir(path.join(f.root, 'config', 'backups'))).length, 1)
  assert.equal((await f.apply()).applied.length, 4)
})

test('stale plans fail before backup; changes after backup fail under lock without creating tracking', async t => {
  const f = await fixture(t)
  await assert.rejects(() => applyMigrations(f.target, { confirmStopped: true, planHash: '0'.repeat(64) }), /plan changed/)
  await assert.rejects(() => fs.stat(path.join(f.root, 'config', 'backups')), { code: 'ENOENT' })
  await assert.rejects(() => f.apply({ onCheckpoint: async checkpoint => {
    if (checkpoint.stage === 'after_backup') await f.db.query('INSERT INTO Sentinel VALUES (99)')
  } }), /plan changed before the write lock/)
  const status = await inspectDatabase(f.target)
  assert.equal(status.classification, 'absent')
  assert.equal(status.tracking.tablePresent, false)
})

test('tampered provenance fails closed even when seasonal DDL matches', async t => {
  const f = await fixture(t)
  await f.apply()
  await f.db.query('UPDATE SpookySchemaMigrations SET sha256 = :hash', { replacements: { hash: '0'.repeat(64) } })
  assert.match((await f.plan()).blocked.join(' '), /provenance/)
  await assert.rejects(() => f.apply({ adoptMatching: true }), /provenance/)
})

test('adoption interruption preserves existing prefix without writing either tracking table', async t => {
  const f = await fixture(t)
  await require(`../migrations/${migrationGroups[0].name}`).up(f.db.getQueryInterface())
  await assert.rejects(() => f.apply({ adoptMatching: true, onCheckpoint: async checkpoint => {
    if (checkpoint.stage === 'before_commit') throw new Error('adoption interruption')
  } }), /adoption interruption/)
  const status = await inspectDatabase(f.target)
  assert.equal(status.matchingPrefix, 1)
  assert.equal(status.tracking.tablePresent, false)
  assert.equal(status.tracking.provenanceTablePresent, false)
})

test('competing reviewed runners cannot duplicate tracking or reapply migrations', async t => {
  const f = await fixture(t), planHash = (await f.plan()).planHash
  const results = await Promise.allSettled([1, 2].map(() => applyMigrations(f.target, { confirmStopped: true, planHash })))
  assert.ok(results.some(result => result.status === 'fulfilled'))
  const status = await inspectDatabase(f.target)
  assert.equal(status.classification, 'complete')
  assert.equal(status.tracking.names.length, 4)
  assert.equal(status.tracking.provenance.length, 4)
  assert.equal((await f.apply()).noOp, true)
})
