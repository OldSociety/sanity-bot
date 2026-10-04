const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const Sequelize = require('sequelize')
const { migrationGroups, selectDevelopmentTarget, inspectDatabase, createBackup } = require('../services/spooky/storage-tools')
const { parseArguments } = require('../scripts/spooky-storage')

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spooky-storage-tools-'))
  const config = path.join(root, 'config')
  await fs.mkdir(config)
  await fs.writeFile(path.join(root, '.env.development'), 'TOKEN=synthetic-secret\nCLIENTID=111111111111111111\nGUILDID=222222222222222222\n')
  await fs.writeFile(path.join(root, '.env.production'), 'TOKEN=synthetic-other\nCLIENTID=333333333333333333\nGUILDID=444444444444444444\n')
  const storage = path.join(config, 'dev.sqlite')
  const db = new Sequelize({ dialect: 'sqlite', storage, logging: false })
  await db.query('PRAGMA journal_mode = WAL')
  await db.query('CREATE TABLE ExistingAccounts (id TEXT PRIMARY KEY, bank INTEGER NOT NULL)')
  await db.query("INSERT INTO ExistingAccounts VALUES ('synthetic', 73)")
  let closed = false
  const close = async () => { if (!closed) { closed = true; await db.close() } }
  t.after(async () => {
    await close()
    // Only the private generated fixture root is removed, never a runtime path.
    assert.equal(path.dirname(root), await fs.realpath(os.tmpdir()))
    assert.ok(path.basename(root).startsWith('spooky-storage-tools-'))
    await fs.rm(root, { recursive: true, force: true })
  })
  const select = () => selectDevelopmentTarget({ environment: 'development', root })
  const up = async index => require(`../migrations/${migrationGroups[index].name}`).up(db.getQueryInterface())
  return { root, config, storage, db, close, select, up }
}

test('CLI requires explicit development/stopped writers and rejects targets, apply/down and inherited production/test', () => {
  assert.deepEqual(parseArguments(['status', '--development'], 'development'), { command: 'status', confirmStopped: false })
  const previous = process.env.NODE_ENV
  try {
    delete process.env.NODE_ENV
    assert.deepEqual(parseArguments(['status', '--development']), { command: 'status', confirmStopped: false })
  } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous }
  assert.deepEqual(parseArguments(['backup', '--development', '--confirm-stopped'], 'development'), { command: 'backup', confirmStopped: true })
  for (const args of [[], ['status'], ['status', '--development', '--database', 'prod.sqlite'],
    ['apply', '--development'], ['down', '--development'], ['backup', '--development'],
    ['status', '--development', '--development'], ['status', '--production'], ['status', '--development', '--root', 'elsewhere']]) {
    assert.throws(() => parseArguments(args, 'development'), /Use|requires/)
  }
  for (const env of ['production', 'test', '']) assert.throws(() => parseArguments(['status', '--development'], env), /NODE_ENV/)
})

test('target selection rejects missing, forged, production, symlink and hardlinked storage without creating a database', async t => {
  const f = await fixture(t)
  await assert.rejects(() => selectDevelopmentTarget({ environment: 'production', root: f.root }), /development only/)
  await assert.rejects(() => inspectDatabase({ databasePath: f.storage }), /selectDevelopmentTarget/)
  await f.close()
  await fs.rename(f.storage, path.join(f.config, 'saved.sqlite'))
  await assert.rejects(() => f.select(), { code: 'ENOENT' })
  await assert.rejects(() => fs.stat(f.storage), { code: 'ENOENT' })
  await fs.link(path.join(f.config, 'saved.sqlite'), f.storage)
  await fs.link(f.storage, path.join(f.config, 'prod.sqlite'))
  await assert.rejects(() => f.select(), /same file/)
  await fs.unlink(path.join(f.config, 'prod.sqlite'))
  await fs.unlink(f.storage)
  // Directory junction needs no Windows symlink privilege.
  await fs.rename(f.config, path.join(f.root, 'saved-config'))
  await fs.symlink(path.join(f.root, 'saved-config'), f.config, 'junction')
  await assert.rejects(() => f.select(), /non-linked/)
})

test('readonly status classifies absent, matching prefix and complete schema without changing rows/tracking', async t => {
  const f = await fixture(t), target = await f.select()
  const before = await fs.readFile(f.storage)
  let result = await inspectDatabase(target)
  assert.equal(result.classification, 'absent'); assert.equal(result.matchingPrefix, 0)
  assert.equal(result.databaseModified, false); assert.equal(result.discordContacted, false)
  assert.deepEqual(await fs.readFile(f.storage), before)
  await f.up(0)
  result = await inspectDatabase(target)
  assert.equal(result.classification, 'prefix'); assert.equal(result.matchingPrefix, 1)
  assert.equal(result.tracking.matchesSchema, false)
  assert.match(result.problems.join(' '), /tracking/)
  await f.up(1); await f.up(2); await f.up(3)
  result = await inspectDatabase(target)
  assert.equal(result.classification, 'complete'); assert.equal(result.matchingPrefix, 4)
  assert.equal(result.tableCounts.ExistingAccounts, 1)
  assert.equal(result.tableCounts.SpookyParticipants, 0)
  const [[user]] = await f.db.query('SELECT bank FROM ExistingAccounts')
  assert.equal(user.bank, 73)
  const [tracker] = await f.db.query("SELECT name FROM sqlite_master WHERE name = 'SequelizeMeta'")
  assert.deepEqual(tracker, [])
  assert.doesNotMatch(JSON.stringify(result), /synthetic-secret|synthetic-other/)
})

test('partial groups, non-prefix migrations, changed constraints and missing indexes require review', async t => {
  const partial = await fixture(t), target = await partial.select()
  await partial.db.query('CREATE TABLE SpookyParticipants (id INTEGER PRIMARY KEY, candy INTEGER)')
  assert.equal((await inspectDatabase(target)).classification, 'inconsistent')
  const nonprefix = await fixture(t); await nonprefix.up(1)
  assert.equal((await inspectDatabase(await nonprefix.select())).classification, 'inconsistent')
  const index = await fixture(t); await index.up(0)
  await index.db.query('DROP INDEX spooky_ledger_player_time')
  const result = await inspectDatabase(await index.select())
  assert.equal(result.classification, 'inconsistent')
  assert.match(result.problems.join(' '), /spooky_ledger_player_time/)
  const collision = await fixture(t)
  await collision.db.query('CREATE VIEW SpookyDeliveries AS SELECT id FROM ExistingAccounts')
  await collision.db.query('CREATE INDEX spooky_ledger_player_time ON ExistingAccounts (bank)')
  const occupied = await inspectDatabase(await collision.select())
  assert.equal(occupied.classification, 'inconsistent')
  assert.match(occupied.problems.join(' '), /Reserved migration schema name occupied/)
})

test('existing migration tracking is read and cross-checked; gaps/stale tracker never get adopted automatically', async t => {
  const f = await fixture(t); await f.up(0)
  await f.db.query('CREATE TABLE SequelizeMeta (name TEXT PRIMARY KEY)')
  await f.db.query('INSERT INTO SequelizeMeta VALUES (:name)', { replacements: { name: migrationGroups[0].name } })
  const target = await f.select()
  assert.equal((await inspectDatabase(target)).tracking.matchesSchema, true)
  await f.db.query('INSERT INTO SequelizeMeta VALUES (:name)', { replacements: { name: migrationGroups[2].name } })
  const result = await inspectDatabase(target)
  assert.equal(result.classification, 'prefix'); assert.equal(result.tracking.matchesSchema, false)
  const [[count]] = await f.db.query('SELECT COUNT(*) AS count FROM SequelizeMeta')
  assert.equal(count.count, 2)
})

test('exclusive WAL backup from readonly source preserves existing data and writes a verified secret-free manifest', async t => {
  const f = await fixture(t); await f.up(0); await f.up(1); await f.up(2); await f.up(3)
  const target = await f.select()
  await assert.rejects(() => createBackup(target), /writers are stopped/)
  await assert.rejects(() => fs.stat(path.join(f.config, 'backups')), { code: 'ENOENT' })
  const original = await fs.readFile(f.storage)
  const backup = await createBackup(target, { confirmStopped: true })
  assert.equal(backup.integrity, 'ok'); assert.equal(backup.noMigrationApplied, true)
  assert.equal(backup.foreignKeyViolations, 0); assert.match(backup.backupSha256, /^[a-f0-9]{64}$/)
  assert.deepEqual(await fs.readFile(f.storage), original)
  const copy = new Sequelize({ dialect: 'sqlite', storage: backup.backupPath, logging: false })
  try { const [[row]] = await copy.query('SELECT bank FROM ExistingAccounts'); assert.equal(row.bank, 73) } finally { await copy.close() }
  const manifest = await fs.readFile(path.join(path.dirname(backup.backupPath), 'manifest.json'), 'utf8')
  assert.doesNotMatch(manifest, /synthetic-secret|synthetic-other/)
  const again = await createBackup(target, { confirmStopped: true })
  assert.notEqual(again.backupPath, backup.backupPath)
  assert.equal((await inspectDatabase(target)).tracking.tablePresent, false)
})

test('backup rejects linked directories and preserves an interrupted backup failure record without applying migrations', async t => {
  const f = await fixture(t), target = await f.select()
  let failedDirectory
  await assert.rejects(() => createBackup(target, { confirmStopped: true, onCheckpoint: async ({ directory }) => {
    failedDirectory = directory; throw new Error('Injected backup interruption')
  } }), /inspect .*Injected backup interruption/)
  const failure = JSON.parse(await fs.readFile(path.join(failedDirectory, 'failure.json'), 'utf8'))
  assert.equal(failure.status, 'failed'); assert.equal((await inspectDatabase(target)).classification, 'absent')
  const parent = path.join(f.config, 'backups')
  await fs.rename(parent, path.join(f.config, 'saved-backups'))
  await fs.symlink(path.join(f.config, 'saved-backups'), parent, 'junction')
  await assert.rejects(() => createBackup(target, { confirmStopped: true }), /non-linked/)
})

test('target is revalidated after selection and cannot later be redirected through a hardlink', async t => {
  const f = await fixture(t), target = await f.select()
  await fs.link(f.storage, path.join(f.config, 'prod.sqlite'))
  await assert.rejects(() => inspectDatabase(target), /same file/)
  await assert.rejects(() => createBackup(target, { confirmStopped: true }), /same file/)
  await fs.unlink(path.join(f.config, 'prod.sqlite'))
  await fs.link(`${f.storage}-wal`, path.join(f.config, 'prod.sqlite-wal'))
  await assert.rejects(() => inspectDatabase(target), /sidecars refer to the same file/)
})

test('foreign-key violations block a backup before allocation and preserve the source for inspection', async t => {
  const f = await fixture(t); await f.up(0)
  await f.db.query('PRAGMA foreign_keys = OFF')
  await f.db.query("INSERT INTO SpookyInventory (participantId, pieceId, quantity) VALUES (999, 'had_tl', 1)")
  const target = await f.select()
  assert.equal((await inspectDatabase(target)).foreignKeyViolations, 1)
  await assert.rejects(() => createBackup(target, { confirmStopped: true }), /foreign-key checks failed/)
  await assert.rejects(() => fs.stat(path.join(f.config, 'backups')), { code: 'ENOENT' })
  const [[row]] = await f.db.query('SELECT COUNT(*) AS count FROM SpookyInventory')
  assert.equal(row.count, 1)
})
