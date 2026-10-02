const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { createHash } = require('node:crypto')
const Sequelize = require('sequelize')

const migrationNames = [
  '20261001000000-create-spooky-core.js',
  '20261001000001-create-spooky-delivery.js',
  '20261001000002-create-spooky-notifications.js',
  '20261001000003-create-permanent-badges.js',
]
const migrations = migrationNames.map(name => require(`../migrations/${name}`))
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')

async function logicalState(db) {
  const [tables] = await db.query("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  const state = []
  for (const table of tables) {
    const quoted = db.getQueryInterface().quoteIdentifier(table.name)
    const [rows] = await db.query(`SELECT * FROM ${quoted} ORDER BY rowid`)
    state.push({ ...table, rows })
  }
  const [indexes] = await db.query("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name")
  const [sequenceTable] = await db.query("SELECT name FROM sqlite_master WHERE name = 'sqlite_sequence'")
  const [sequences] = sequenceTable.length ? await db.query('SELECT name, seq FROM sqlite_sequence ORDER BY name') : [[]]
  return { tables: state, indexes, sequences }
}
async function integrity(db) {
  const [checks] = await db.query('PRAGMA integrity_check')
  assert.deepEqual(checks.map(row => row.integrity_check), ['ok'])
  const [foreignKeys] = await db.query('PRAGMA foreign_key_check')
  assert.deepEqual(foreignKeys, [])
  return { integrity: 'ok', foreignKeyViolations: 0 }
}

// No target/path override: this tool creates synthetic storage itself and never
// imports runtime/sequelize/global models or opens a development/production DB.
async function runRehearsal({ onCheckpoint = async () => {} } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'spooky-storage-rehearsal-'))
  const files = ['fixture.sqlite', 'before.sqlite', 'after.sqlite', 'restored-before.sqlite', 'restored-after.sqlite']
  const ownedPaths = files.map(name => path.join(directory, name))
  const connections = new Set()
  const open = storage => {
    assert.ok(ownedPaths.includes(storage), 'Only generated rehearsal paths may be opened')
    const db = new Sequelize({ dialect: 'sqlite', storage, logging: false })
    connections.add(db)
    return db
  }
  const close = async db => { await db.close(); connections.delete(db) }
  const backup = async (db, destination) => {
    assert.ok(ownedPaths.includes(destination), 'Backup must stay in the generated directory')
    // VACUUM INTO produces a consistent SQLite snapshot, including committed WAL
    // data. A raw copy of an open main file can silently omit that data.
    await db.query(`VACUUM INTO ${db.escape(destination)}`)
  }
  let result
  try {
    const db = open(ownedPaths[0])
    const [version] = await db.query('SELECT sqlite_version() AS version')
    await db.query('PRAGMA journal_mode = WAL')
    const User = require('../Models/User/User')(db, Sequelize.DataTypes)
    await User.sync() // Actual User model, only on newly generated synthetic storage.
    await User.create({ user_id: 'rehearsal-user', user_name: 'Synthetic User', bank: 73, fate_points: 12 })
    await db.query('CREATE TABLE ExistingServerData (id INTEGER PRIMARY KEY, value TEXT NOT NULL)')
    await db.query("INSERT INTO ExistingServerData VALUES (1, 'preserve-existing-data')")
    const baseline = await logicalState(db), baselineHash = digest(baseline)
    assert.ok((await fs.stat(`${ownedPaths[0]}-wal`)).size > 0, 'Rehearsal must include WAL-backed writes')
    await backup(db, ownedPaths[1])
    await onCheckpoint({ stage: 'baseline_backup', directory })
    for (const migration of migrations) await migration.up(db.getQueryInterface())
    const models = require('../services/spooky/models').defineSpookyModels(db)
    const { config } = require('../services/spooky/config')
    const economy = require('../services/spooky/economy').createEconomy({ sequelize: db, models, configVersion: config.version,
      clock: () => new Date('2026-10-10T12:00:00Z') })
    const scope = { eventId: config.eventId, guildId: 'synthetic-guild' }
    const badges = require('../services/badges').createBadges({ sequelize: db })
    const collection = require('../services/spooky/collection').createCollection({ models, badges,
      participants: { prepare: async (ctx, userId) => ({ participant: await models.Participant.findOne({
        where: { ...ctx.scope, userId }, transaction: ctx.transaction }) }) } })
    const operation = await economy.execute({ ...scope, actorId: 'rehearsal-user', workerKey: 'storage-rehearsal', operationType: 'rehearsal' }, async ctx => {
      await models.EventState.create({ ...scope, configVersion: config.version }, { transaction: ctx.transaction })
      const player = await models.Participant.create({ ...scope, userId: 'rehearsal-user', registeredAt: ctx.now,
        refillAnchor: ctx.now, candy: 39, eyes: 2 }, { transaction: ctx.transaction })
      // A removed generation must never recycle its identity after restoration:
      // prestige evidence now uses participant IDs across development resets.
      const removed = await models.Participant.create({ ...scope, userId: 'removed-generation', refillAnchor: ctx.now }, { transaction: ctx.transaction })
      await removed.destroy({ transaction: ctx.transaction })
      await models.Inventory.create({ participantId: player.id, pieceId: 'had_tl', quantity: 2 }, { transaction: ctx.transaction })
      // Earn real permanent ownership through collection, rather than inserting a
      // sentinel row. Badge, quarters and ledger must share this root transaction.
      let completion
      for (const piece of require('../services/spooky/config').pieces.filter(piece => piece.characterId === 'sel')) {
        completion = await collection.grantQuarter(ctx, player.userId, piece.id)
      }
      assert.deepEqual(completion.newlyAwardedBadges, ['spooky-2026:sel'])
      await models.Effect.create({ participantId: player.id, effectType: 'theft_protection',
        expiresAt: new Date('2026-10-10T13:00:00Z'), metadata: { source: 'synthetic' } }, { transaction: ctx.transaction })
      await models.Delivery.create({ ...scope, userId: player.userId, kind: 'sweet_tooth_role', revision: ctx.operationId,
        payload: { roleId: 'synthetic-role', present: true }, status: 'pending' }, { transaction: ctx.transaction })
      await models.Notification.create({ operationId: ctx.operationId, ordinal: 0, channelId: 'synthetic-channel',
        payload: { content: 'Synthetic saved notification', allowedMentions: { parse: [] } }, status: 'uncertain' }, { transaction: ctx.transaction })
      await ctx.record({ userId: player.userId, resource: 'rehearsal', delta: 0, metadata: { synthetic: true } })
      return { synthetic: true, preserveOnRestore: true, newlyAwardedBadges: completion.newlyAwardedBadges }
    })
    const populated = await logicalState(db), populatedHash = digest(populated)
    assert.equal(populated.tables.filter(table => table.name.startsWith('Spooky')).length, 8)
    await backup(db, ownedPaths[2])
    await onCheckpoint({ stage: 'populated_backup', directory })
    const checks = await integrity(db)
    const ownershipBeforeRollback = await badges.details(scope.guildId, 'rehearsal-user')
    // Seasonal schema rollback is distinct from explicitly destroying permanent
    // storage. Never include the badge migration in a seasonal reset.
    for (const migration of migrations.slice(0, 3).reverse()) await migration.down(db.getQueryInterface())
    assert.deepEqual(await badges.details(scope.guildId, 'rehearsal-user'), ownershipBeforeRollback)
    await migrations[3].down(db.getQueryInterface()) // Synthetic-only full schema rollback.
    assert.equal(digest(await logicalState(db)), baselineHash, 'Reverse schema rollback must preserve existing User/server data')
    for (const migration of migrations) await migration.up(db.getQueryInterface())
    for (const table of (await logicalState(db)).tables.filter(table => table.name.startsWith('Spooky'))) assert.equal(table.rows.length, 0)
    assert.deepEqual(await badges.owned(scope.guildId, 'rehearsal-user'), [])
    await close(db)

    // Restore into NEW files, never over an open DB or its journal/sidecars.
    await fs.copyFile(ownedPaths[1], ownedPaths[3], fs.constants.COPYFILE_EXCL)
    await fs.copyFile(ownedPaths[2], ownedPaths[4], fs.constants.COPYFILE_EXCL)
    const before = open(ownedPaths[3]), after = open(ownedPaths[4])
    assert.equal(digest(await logicalState(before)), baselineHash)
    assert.equal(digest(await logicalState(after)), populatedHash)
    await integrity(before); await integrity(after)
    const restoredModels = require('../services/spooky/models').defineSpookyModels(after)
    assert.equal((await restoredModels.Operation.findByPk(operation.operationId)).receipt.preserveOnRestore, true)
    assert.equal((await restoredModels.Notification.findOne()).status, 'uncertain')
    assert.equal((await restoredModels.Delivery.findOne()).status, 'pending')
    const next = await restoredModels.Participant.create({ ...scope, userId: 'new-generation', refillAnchor: new Date('2026-10-10T12:00:00Z') })
    assert.equal(next.id, 3, 'Restore must preserve the deleted generation AUTOINCREMENT high-water mark')
    const [[account]] = await after.query('SELECT bank, fate_points FROM Users WHERE user_id = :id', { replacements: { id: 'rehearsal-user' } })
    assert.deepEqual(account, { bank: 73, fate_points: 12 })
    const restoredBadges = require('../services/badges').createBadges({ sequelize: after })
    assert.deepEqual(await restoredBadges.details(scope.guildId, 'rehearsal-user'), ownershipBeforeRollback)
    const restoredEconomy = require('../services/spooky/economy').createEconomy({ sequelize: after, models: restoredModels,
      configVersion: config.version, clock: () => new Date('2026-10-10T12:00:00Z') })
    const replay = await restoredEconomy.execute({ ...scope, actorId: 'rehearsal-user', workerKey: 'storage-rehearsal', operationType: 'rehearsal' },
      () => { throw new Error('Restored committed operation must not rerun') })
    assert.equal(replay.replayed, true)
    assert.deepEqual(replay.receipt.newlyAwardedBadges, ['spooky-2026:sel'])
    const restoredUser = require('../Models/User/User')(after, Sequelize.DataTypes)
    const admin = require('../services/spooky/admin').createAdmin({ sequelize: after, User: restoredUser, models: restoredModels,
      economy: restoredEconomy, badges: restoredBadges, guildId: scope.guildId, event: config,
      environment: 'development', developmentStorage: ownedPaths[4], authorize: async () => true })
    const reset = await admin.control({ guildId: scope.guildId, actorId: 'synthetic-admin', userId: 'rehearsal-user',
      interactionId: 'restored-reset', action: 'reset-development', confirm: true, reason: 'Synthetic recovery verification' })
    assert.deepEqual(reset.receipt.badgeOwnershipRetained, ['spooky-2026:sel'])
    assert.deepEqual(await restoredBadges.details(scope.guildId, 'rehearsal-user'), ownershipBeforeRollback)
    assert.equal(await restoredModels.Participant.count({ where: { userId: 'rehearsal-user' } }), 0)
    assert.equal(await restoredModels.Ledger.count({ where: { resource: 'badge:spooky-2026:sel' } }), 1)
    assert.equal((await restoredModels.Notification.findOne()).status, 'uncertain')
    assert.equal((await restoredUser.findByPk('rehearsal-user')).bank, 73)
    assert.equal((await restoredUser.findByPk('rehearsal-user')).fate_points, 12)
    await integrity(after)
    await onCheckpoint({ stage: 'badge_restore_reset', directory })
    await close(before); await close(after)
    result = { status: 'passed', generatedAt: new Date().toISOString(), syntheticStorageOnly: true, discordAccessed: false, sqliteVersion: version[0].version,
      journalMode: 'WAL', backupMethod: 'VACUUM INTO', migrations: migrationNames,
      migrationSha256: Object.fromEntries(await Promise.all(migrationNames.map(async name => [name,
        createHash('sha256').update(await fs.readFile(path.join(__dirname, '..', 'migrations', name))).digest('hex')]))),
      spookyTables: 8, baselineHash, populatedHash, beforeRestoreMatches: true, populatedRestoreMatches: true,
      schemaRollbackPreservesExistingData: true, reapplyCreatesEmptySeasonalTables: true,
      autoincrementHighWatermarkPreserved: true,
      permanentBadgeTables: 1, restoredBadges: ownershipBeforeRollback.map(row => row.badgeId),
      permanentOwnershipRestoreMatches: true, seasonalSchemaRollbackPreservesBadges: true,
      restoredOperationReplayPreservesBadge: true, restoredParticipantResetPreservesBadges: true,
      restoredQueueStates: { delivery: 'pending', notification: 'uncertain' }, existingWallet: account, ...checks }
  } finally {
    // Close every owned connection, including failure paths. Remove exact known
    // files only after verifying their parent is our generated directory; no
    // recursive deletion or user-supplied path is ever accepted.
    await Promise.all([...connections].map(close))
    const resolvedDirectory = await fs.realpath(directory)
    for (const file of ownedPaths) for (const suffix of ['', '-wal', '-shm', '-journal']) {
      const target = `${file}${suffix}`
      assert.equal(path.dirname(path.resolve(target)), resolvedDirectory)
      await fs.unlink(target).catch(error => { if (error.code !== 'ENOENT') throw error })
    }
    await fs.rmdir(directory)
  }
  return { ...result, temporaryFilesRemoved: true }
}

if (require.main === module) {
  if (process.argv.length !== 2) {
    console.error('This offline rehearsal accepts no arguments or database targets.')
    process.exitCode = 1
  } else runRehearsal().then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch(error => {
    console.error(`Storage rehearsal failed: ${error.message}`)
    process.exitCode = 1
  })
}
module.exports = { runRehearsal }
