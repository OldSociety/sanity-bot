const fs = require('node:fs/promises')
const path = require('node:path')
const { createHash } = require('node:crypto')
const Sequelize = require('sequelize')
const sqlite3 = require('sqlite3')
const { loadDiscordEnvironment } = require('../../config/runtime')

const migrationGroups = Object.freeze([
  { name: '20261001000000-create-spooky-core.js', tables: ['SpookyEventStates', 'SpookyParticipants', 'SpookyInventory', 'SpookyEffects', 'SpookyOperations', 'SpookyLedger'] },
  { name: '20261001000001-create-spooky-delivery.js', tables: ['SpookyDeliveries'] },
  { name: '20261001000002-create-spooky-notifications.js', tables: ['SpookyNotifications'] },
  { name: '20261001000003-create-permanent-badges.js', tables: ['BadgeOwnership'] },
].map(group => Object.freeze({ ...group, tables: Object.freeze(group.tables) })))
const validatedTargets = new WeakMap()
const provenanceSql = `CREATE TABLE SpookySchemaMigrations (
  name TEXT PRIMARY KEY NOT NULL, sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  appliedAt TEXT NOT NULL, backupPath TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('applied', 'adopted'))
)`
const hash = value => createHash('sha256').update(value).digest('hex')
const normalizeSql = sql => sql?.replace(/\s+/g, ' ').trim()
let referencePromise
async function referenceSchema() {
  if (!referencePromise) referencePromise = (async () => {
    const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
    try {
      for (const group of migrationGroups) await require(`../../migrations/${group.name}`).up(db.getQueryInterface())
      const [schema] = await db.query("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type, name")
      const hashes = Object.fromEntries(await Promise.all(migrationGroups.map(async group => [group.name,
        hash(await fs.readFile(path.join(__dirname, '..', '..', 'migrations', group.name)))])))
      return { schema, hashes }
    } finally { await db.close() }
  })()
  return referencePromise
}

async function regularPath(location, directory = false) {
  const stat = await fs.lstat(location)
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())) throw new Error('Storage path must be a regular non-linked file/directory')
  return stat
}
async function verifyTarget(target) {
  if (!validatedTargets.has(target)) throw new Error('Storage target must come from selectDevelopmentTarget')
  await regularPath(path.join(target.root, 'config'), true)
  const stat = await regularPath(target.databasePath)
  const identity = validatedTargets.get(target)
  if (identity && identity.ino !== 0 && (identity.ino !== stat.ino || identity.dev !== stat.dev)) throw new Error('Storage target was replaced; select and review it again')
  if (await fs.realpath(target.databasePath) !== target.databasePath) throw new Error('Storage target resolves outside its configured path')
  const production = await fs.stat(path.join(target.root, 'config', 'prod.sqlite')).catch(error => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (production && stat.ino !== 0 && stat.ino === production.ino && stat.dev === production.dev) throw new Error('Development and production storage refer to the same file')
  for (const suffix of ['-wal', '-shm', '-journal']) {
    const sidecar = await regularPath(`${target.databasePath}${suffix}`).catch(error => { if (error.code === 'ENOENT') return null; throw error })
    const other = await fs.stat(path.join(target.root, 'config', `prod.sqlite${suffix}`)).catch(error => { if (error.code === 'ENOENT') return null; throw error })
    if (sidecar && other && sidecar.ino !== 0 && sidecar.ino === other.ino && sidecar.dev === other.dev) throw new Error('Development and production storage sidecars refer to the same file')
  }
  return stat
}

// CLI callers cannot override root/path; tests inject a private fixture root.
// Credentials select the authoritative environment but never enter the report.
async function selectDevelopmentTarget({ environment, root = path.resolve(__dirname, '..', '..') } = {}) {
  if (environment !== 'development') throw new Error('Storage tools support explicit development only')
  const actualRoot = await fs.realpath(root)
  const runtime = loadDiscordEnvironment('development', { root: actualRoot, target: {} })
  if (runtime.productionGuildComparison !== 'distinct') throw new Error('A distinct configured production guild is required')
  const target = Object.freeze({ environment: 'development', root: actualRoot, databasePath: runtime.database.storage,
    applicationId: runtime.clientId, guildId: runtime.guildId })
  validatedTargets.set(target, null)
  const identity = await verifyTarget(target)
  validatedTargets.set(target, { ino: identity.ino, dev: identity.dev })
  return target
}
function openReadOnly(storage) {
  return new Sequelize({ dialect: 'sqlite', storage, logging: false, dialectOptions: { mode: sqlite3.OPEN_READONLY } })
}
async function inventory(db) {
  const [schema] = await db.query("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type, name")
  const counts = {}
  for (const table of schema.filter(row => row.type === 'table')) {
    const [[row]] = await db.query(`SELECT COUNT(*) AS count FROM ${db.getQueryInterface().quoteIdentifier(table.name)}`)
    counts[table.name] = row.count
  }
  const [integrityRows] = await db.query('PRAGMA integrity_check')
  const [foreignKeys] = await db.query('PRAGMA foreign_key_check')
  let tracked = []
  const trackerObject = schema.find(row => row.name === 'SequelizeMeta')
  const hasTracker = trackerObject?.type === 'table'
  if (hasTracker) {
    const [rows] = await db.query('SELECT name FROM SequelizeMeta WHERE name IN (:names) ORDER BY name', {
      replacements: { names: migrationGroups.map(group => group.name) },
    })
    tracked = rows.map(row => row.name)
  }
  const provenanceTable = schema.find(row => row.name === 'SpookySchemaMigrations')
  const provenanceSchemaMatches = !provenanceTable || (provenanceTable.type === 'table' && normalizeSql(provenanceTable.sql) === normalizeSql(provenanceSql))
  let provenance = []
  if (provenanceTable && provenanceSchemaMatches) [provenance] = await db.query('SELECT name, sha256, appliedAt, backupPath, source FROM SpookySchemaMigrations ORDER BY name')
  return { schema, counts, tracked, hasTracker, provenance,
    trackerNameAvailable: !trackerObject || hasTracker, provenanceTablePresent: Boolean(provenanceTable), provenanceSchemaMatches,
    integrity: integrityRows.length === 1 && integrityRows[0].integrity_check === 'ok' ? 'ok' : 'failed', foreignKeyViolations: foreignKeys.length }
}
async function inspectDatabase(target) {
  await verifyTarget(target)
  const db = openReadOnly(target.databasePath)
  try {
    const expected = await referenceSchema()
    const observed = await db.transaction(async transaction => {
      // All inventory statements share this connection's snapshot. Sequelize's
      // CLS is not configured; bind statements explicitly via a tiny facade.
      return inventory({ query: (sql, options = {}) => db.query(sql, { ...options, transaction }), getQueryInterface: () => db.getQueryInterface() })
    })
    await verifyTarget(target)
    return describeInventory(target, observed, expected)
  } finally { await db.close() }
}
function describeInventory(target, observed, expected) {
    const problems = [], groups = []
    for (const group of migrationGroups) {
      const entries = expected.schema.filter(row => group.tables.includes(row.tbl_name))
      const present = group.tables.filter(name => observed.schema.some(row => row.type === 'table' && row.name === name))
      let state = present.length === 0 ? 'absent' : present.length === group.tables.length ? 'matching' : 'partial'
      if (state === 'absent' && entries.some(entry => observed.schema.some(row => row.name === entry.name))) {
        state = 'mismatch'
        problems.push(`Reserved migration schema name occupied: ${group.name}`)
      }
      if (state !== 'absent') {
        for (const row of entries) {
          const actual = observed.schema.find(item => item.type === row.type && item.name === row.name)
          if (!actual || normalizeSql(actual.sql) !== normalizeSql(row.sql)) { state = 'mismatch'; problems.push(`Schema differs: ${row.name}`) }
        }
        for (const row of observed.schema.filter(row => group.tables.includes(row.tbl_name))) {
          if (!entries.some(entry => entry.type === row.type && entry.name === row.name)) { state = 'mismatch'; problems.push(`Unexpected schema object: ${row.name}`) }
        }
      }
      groups.push({ name: group.name, sha256: expected.hashes[group.name], state, tablesPresent: present })
    }
    let prefix = 0
    while (groups[prefix]?.state === 'matching') prefix++
    const inconsistent = groups.some((group, index) => group.state === 'mismatch' || group.state === 'partial' || (index >= prefix && group.state !== 'absent'))
    const classification = inconsistent ? 'inconsistent' : prefix === groups.length ? 'complete' : prefix ? 'prefix' : 'absent'
    const matchingNames = groups.slice(0, prefix).map(group => group.name)
    const trackingMatches = JSON.stringify(observed.tracked) === JSON.stringify(matchingNames)
    if (!trackingMatches) problems.push('Migration tracking does not match the observed schema prefix')
    return { ...target, databaseOpenedReadOnly: true, databaseModified: false, discordContacted: false,
      classification, matchingPrefix: prefix, migrations: groups, problems,
      tracking: { tablePresent: observed.hasTracker, names: observed.tracked, matchesSchema: trackingMatches,
        nameAvailable: observed.trackerNameAvailable,
        provenanceTablePresent: observed.provenanceTablePresent, provenanceSchemaMatches: observed.provenanceSchemaMatches, provenance: observed.provenance },
      schemaSha256: hash(JSON.stringify(observed.schema)), tableCounts: observed.counts,
      integrity: observed.integrity, foreignKeyViolations: observed.foreignKeyViolations }
}

async function createBackup(target, { confirmStopped = false, onCheckpoint = async () => {} } = {}) {
  if (confirmStopped !== true) throw new Error('Backup requires explicit confirmation that all writers are stopped')
  await verifyTarget(target)
  const before = await inspectDatabase(target)
  if (before.integrity !== 'ok' || before.foreignKeyViolations) throw new Error('Source integrity/foreign-key checks failed; inspect before backing up')
  const parent = path.join(target.root, 'config', 'backups')
  await fs.mkdir(parent).catch(error => { if (error.code !== 'EEXIST') throw error })
  await regularPath(parent, true)
  if (await fs.realpath(parent) !== parent) throw new Error('Backup directory resolves outside the configured path')
  const directory = await fs.mkdtemp(path.join(parent, 'spooky-'))
  const destination = path.join(directory, 'dev.sqlite')
  const db = openReadOnly(target.databasePath)
  let verification
  try {
    await onCheckpoint({ directory })
    await verifyTarget(target)
    await db.query(`VACUUM INTO ${db.escape(destination)}`)
    const copy = openReadOnly(destination)
    try {
      verification = await inventory(copy)
      if (verification.integrity !== 'ok' || verification.foreignKeyViolations ||
        hash(JSON.stringify(verification.schema)) !== before.schemaSha256 ||
        JSON.stringify(verification.counts) !== JSON.stringify(before.tableCounts)) throw new Error('Backup verification differs from the stopped source')
    } finally { await copy.close() }
    const after = await inspectDatabase(target)
    if (after.schemaSha256 !== before.schemaSha256 || JSON.stringify(after.tableCounts) !== JSON.stringify(before.tableCounts)) throw new Error('Source changed during backup; stop all writers and inspect')
    const manifest = { createdAt: new Date().toISOString(), target, backupPath: destination,
      backupSha256: hash(await fs.readFile(destination)), method: 'VACUUM INTO from read-only source',
      status: before, integrity: verification.integrity, foreignKeyViolations: verification.foreignKeyViolations,
      stoppedWritersConfirmed: true, noMigrationApplied: true, discordContacted: false }
    await fs.writeFile(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
    return manifest
  } catch (error) {
    // Preserve partial artifacts for diagnosis, never overwrite or silently
    // recycle a failed backup. An operator inspects its exclusive directory.
    await fs.writeFile(path.join(directory, 'failure.json'), `${JSON.stringify({ status: 'failed', error: error.message, target, backupPath: destination })}\n`, { flag: 'wx' })
    throw new Error(`Backup failed; inspect ${directory}: ${error.message}`)
  } finally { await db.close() }
}

function createMigrationPlan(status, { adoptMatching = false } = {}) {
  if (typeof adoptMatching !== 'boolean') throw new Error('Adoption mode must be explicit boolean')
  const prefix = status.migrations.slice(0, status.matchingPrefix), names = prefix.map(group => group.name)
  const blocked = []
  if (status.classification === 'inconsistent') blocked.push('Schema is inconsistent')
  if (status.integrity !== 'ok' || status.foreignKeyViolations) blocked.push('Integrity/foreign-key checks failed')
  if (!status.tracking.nameAvailable || !status.tracking.provenanceSchemaMatches) blocked.push('Migration metadata schema is incompatible')
  if (new Set(status.tracking.names).size !== status.tracking.names.length || status.tracking.names.some(name => !names.includes(name))) blocked.push('Tracker names disagree with the schema prefix')
  const records = status.tracking.provenance
  if (new Set(records.map(row => row.name)).size !== records.length || records.some(row =>
    !names.includes(row.name) || row.sha256 !== prefix.find(group => group.name === row.name)?.sha256 ||
    !['applied', 'adopted'].includes(row.source) || !Number.isFinite(Date.parse(row.appliedAt)) || !row.backupPath)) blocked.push('Migration provenance is stale or invalid')
  const adopting = prefix.filter(group => !status.tracking.names.includes(group.name) || !records.some(row => row.name === group.name)).map(group => group.name)
  if (adopting.length && !adoptMatching) blocked.push('Matching schema needs an explicitly reviewed adoption plan')
  const payload = { version: 1, target: { environment: status.environment, root: status.root, databasePath: status.databasePath,
    applicationId: status.applicationId, guildId: status.guildId }, schemaSha256: status.schemaSha256,
    tableCounts: status.tableCounts, tracking: status.tracking, migrations: status.migrations,
    adoptMatching, adopting, applying: status.migrations.slice(status.matchingPrefix).map(group => group.name) }
  return { ...payload, blocked, ready: blocked.length === 0, planHash: hash(JSON.stringify(payload)) }
}

async function verifyMigrationSources(expected) {
  for (const group of migrationGroups) {
    const current = hash(await fs.readFile(path.join(__dirname, '..', '..', 'migrations', group.name)))
    if (current !== expected.hashes[group.name]) throw new Error(`Migration source changed: ${group.name}; restart and review a new plan`)
  }
}
async function applyMigrations(target, { confirmStopped = false, planHash, adoptMatching = false, onCheckpoint = async () => {} } = {}) {
  if (confirmStopped !== true) throw new Error('Apply requires explicit confirmation that all writers are stopped')
  if (typeof planHash !== 'string' || !/^[a-f0-9]{64}$/.test(planHash)) throw new Error('A reviewed migration plan hash is required')
  await verifyTarget(target)
  const expected = await referenceSchema()
  await verifyMigrationSources(expected)
  const before = await inspectDatabase(target), plan = createMigrationPlan(before, { adoptMatching })
  if (!plan.ready) throw new Error(`Migration plan blocked: ${plan.blocked.join('; ')}`)
  if (plan.planHash !== planHash) throw new Error('Migration plan changed; inspect and review again')
  if (!plan.applying.length && !plan.adopting.length) return { noOp: true, applied: [], adopted: [], planHash, status: before }
  const backup = await createBackup(target, { confirmStopped })
  await onCheckpoint({ stage: 'after_backup', backup })
  await verifyTarget(target)
  await verifyMigrationSources(expected)
  const db = new Sequelize({ dialect: 'sqlite', storage: target.databasePath, logging: false, dialectOptions: { mode: sqlite3.OPEN_READWRITE } })
  try {
    await db.transaction({ type: Sequelize.Transaction.TYPES.EXCLUSIVE }, async transaction => {
      const bound = { query: (sql, options = {}) => db.query(sql, { ...options, transaction }), getQueryInterface: () => db.getQueryInterface() }
      const locked = describeInventory(target, await inventory(bound), expected)
      const lockedPlan = createMigrationPlan(locked, { adoptMatching })
      if (!lockedPlan.ready || lockedPlan.planHash !== planHash) throw new Error('Migration plan changed before the write lock; inspect again')
      if (!locked.tracking.provenanceTablePresent) await bound.query(provenanceSql)
      if (!locked.tracking.tablePresent) await bound.query('CREATE TABLE SequelizeMeta (name VARCHAR(255) NOT NULL PRIMARY KEY)')
      const record = async (name, source) => {
        if (!locked.tracking.names.includes(name)) await bound.query('INSERT INTO SequelizeMeta (name) VALUES (:name)', { replacements: { name } })
        if (!locked.tracking.provenance.some(row => row.name === name)) await bound.query(
          'INSERT INTO SpookySchemaMigrations (name, sha256, appliedAt, backupPath, source) VALUES (:name, :sha256, :appliedAt, :backupPath, :source)',
          { replacements: { name, sha256: expected.hashes[name], appliedAt: new Date().toISOString(), backupPath: backup.backupPath, source } })
      }
      for (const name of plan.adopting) await record(name, 'adopted')
      for (const name of plan.applying) {
        await require(`../../migrations/${name}`).up(db.getQueryInterface(), { transaction })
        await record(name, 'applied')
        await onCheckpoint({ stage: 'after_migration', name, backup })
      }
      const final = describeInventory(target, await inventory(bound), expected)
      if (final.classification !== 'complete' || !createMigrationPlan(final).ready) throw new Error('Applied schema/tracking failed verification')
      await verifyTarget(target)
      await verifyMigrationSources(expected)
      await onCheckpoint({ stage: 'before_commit', backup })
    })
    return { noOp: false, applied: plan.applying, adopted: plan.adopting, planHash, backupPath: backup.backupPath,
      atomicSchemaAndTracking: true, status: await inspectDatabase(target) }
  } catch (error) {
    throw new Error(`Migration batch failed; verified backup retained at ${backup.backupPath}: ${error.message}`)
  } finally { await db.close() }
}

module.exports = { migrationGroups, selectDevelopmentTarget, inspectDatabase, createBackup, createMigrationPlan, applyMigrations }
