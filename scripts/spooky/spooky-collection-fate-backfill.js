const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const sqlite = require('sqlite3')
const { Sequelize, DataTypes } = require('sequelize')
const { resolveRuntime } = require('../../config/runtime/runtime')
const { config: event } = require('../../services/spooky/config')

// One purpose, fixed production storage/guild and worker key; no migrations,
// resets, Discord calls, process operations or arbitrary database overrides.
async function main(args = process.argv.slice(2)) {
  if (args.length !== 2 || !['--plan', '--apply'].includes(args[0]) || args[1] !== '--production')
    throw Error('Use --plan --production or --apply --production')
  const apply = args[0] === '--apply'
  const runtime = resolveRuntime('production')
  const guildId = require('dotenv').parse(fs.readFileSync(runtime.envFile)).GUILDID
  if (!/^\d{17,20}$/.test(guildId || '') || !fs.existsSync(runtime.database.storage)) throw Error('Production scope/storage unavailable')
  const output = path.join(runtime.root, 'artifacts/spooky-piece-fate-2026-10-20')
  fs.mkdirSync(output, { recursive: true })
  const db = new Sequelize({ ...runtime.database, dialectOptions: { mode: apply ? sqlite.OPEN_READWRITE : sqlite.OPEN_READONLY } })
  const User = require('../../Models/User/User')(db, DataTypes)
  const models = require('../../services/spooky/models').defineSpookyModels(db)
  const baseEconomy = require('../../services/spooky/economy').createEconomy({ sequelize: db, models, configVersion: event.version })
  const economy = { ...baseEconomy, execute: (input, mutate) => baseEconomy.execute(input, async ctx => {
    const before = await snapshot(db, ctx.transaction)
    const report = await mutate(ctx)
    const after = await snapshot(db, ctx.transaction)
    const changed = new Map(report.targets.map(target => [target.userId, target.bank]))
    for (const name of Object.keys(before.tables)) {
      const rows = before.tables[name]
      const expected = name === 'Users' ? rows.map(row => changed.has(row.user_id) ? { ...row, bank: changed.get(row.user_id) } : row) : rows
      const actual = name === 'SpookyLedger' ? after.tables[name].slice(0, rows.length) : after.tables[name]
      if (JSON.stringify(expected) !== JSON.stringify(actual)) throw Error(`Unexpected row change in ${name}; backfill rolled back`)
    }
    if (JSON.stringify(before.schema) !== JSON.stringify(after.schema)) throw Error('Unexpected schema change; backfill rolled back')
    const added = after.tables.SpookyLedger.length - before.tables.SpookyLedger.length
    if (added !== report.targets.filter(target => target.amount > 0).length) throw Error('Unexpected ledger count; backfill rolled back')
    return { ...report, preservation: { tables: Object.keys(before.tables).length, schemaUnchanged: true,
      allPriorRowsPreserved: true, onlyRequestedBankColumnsChanged: true, ledgerRowsAdded: added } }
  }) }
  const service = require('../../services/spooky/collection-fate-backfill').createCollectionFateBackfill({ User, models, economy, event, guildId })
  try {
    const plan = await service.plan()
    const planPath = path.join(output, `production-plan-${Date.now()}.json`)
    fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), { flag: 'wx' })
    if (!apply || plan.replayed) {
      console.log(JSON.stringify(plan.replayed ? { replayed: true, operationId: plan.operationId, creditedPreviously: plan.receipt.credited } :
        { players: plan.players, uniquePieces: plan.uniquePieces, completionBonuses: plan.completionBonuses, credited: plan.credited, capped: plan.capped, report: planPath }))
      return
    }
    const backupPath = path.join(output, `production-before-${Date.now()}.sqlite`)
    await onlineBackup(runtime.database.storage, backupPath)
    const backupVerification = await verifyDatabase(backupPath)
    const result = await service.apply()
    const verification = await db.query('PRAGMA integrity_check', { type: Sequelize.QueryTypes.SELECT })
    const foreignKeys = await db.query('PRAGMA foreign_key_check', { type: Sequelize.QueryTypes.SELECT })
    if (verification.some(row => row.integrity_check !== 'ok') || foreignKeys.length) throw Error('Post-backfill database check failed; inspect committed receipt')
    for (const target of result.receipt.targets) {
      const user = await User.findByPk(target.userId)
      if (user.bank !== target.bank || user.fate_points !== target.fatePoints) throw Error('Post-backfill wallet differs; inspect concurrent activity and receipt')
    }
    const report = { at: new Date().toISOString(), environment: 'production', guildId, backupPath, backupVerification,
      backupSha256: crypto.createHash('sha256').update(fs.readFileSync(backupPath)).digest('hex'),
      result, verification, foreignKeys }
    const reportPath = path.join(output, `production-applied-${Date.now()}.json`)
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), { flag: 'wx' })
    console.log(JSON.stringify({ players: result.receipt.players, uniquePieces: result.receipt.uniquePieces,
      completionBonuses: result.receipt.completionBonuses, credited: result.receipt.credited, capped: result.receipt.capped,
      replayed: result.replayed, integrity: 'ok', foreignKeys: 0, report: reportPath }))
  } finally { await db.close() }
}

async function onlineBackup(sourcePath, destination) {
  if (fs.existsSync(destination)) throw Error('Backup already exists')
  const source = await new Promise((resolve, reject) => {
    const connection = new sqlite.Database(sourcePath, sqlite.OPEN_READONLY, error => error ? reject(error) : resolve(connection))
  })
  try {
    await new Promise((resolve, reject) => {
      const backup = source.backup(destination, error => {
        if (error) return reject(error)
        backup.step(-1, stepError => backup.finish(finishError => stepError || finishError ? reject(stepError || finishError) : resolve()))
      })
    })
  } finally { await new Promise((resolve, reject) => source.close(error => error ? reject(error) : resolve())) }
}

async function verifyDatabase(filename) {
  const db = new sqlite.Database(filename, sqlite.OPEN_READONLY)
  const read = sql => new Promise((resolve, reject) => db.all(sql, (error, rows) => error ? reject(error) : resolve(rows)))
  try {
    const integrity = await read('PRAGMA integrity_check'), foreignKeys = await read('PRAGMA foreign_key_check')
    if (integrity.some(row => row.integrity_check !== 'ok') || foreignKeys.length) throw Error('Backup validation failed')
    return { integrity: 'ok', foreignKeys: 0 }
  } finally { await new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve())) }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1 })
module.exports = { main, onlineBackup, verifyDatabase }

async function snapshot(db, transaction) {
  const select = sql => db.query(sql, { type: Sequelize.QueryTypes.SELECT, transaction })
  const schema = await select("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name")
  const tables = {}
  for (const table of schema.filter(row => row.type === 'table')) {
    const identifier = '"' + table.name.replaceAll('"', '""') + '"'
    tables[table.name] = await select(`SELECT * FROM ${identifier} ORDER BY rowid`)
  }
  return { schema, tables }
}
