const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { Sequelize } = require('sequelize')
const sqlite = require('sqlite3')
const { resolveRuntime } = require('../../config/runtime/runtime')
const { onlineBackup, verifyDatabase } = require('../spooky/spooky-collection-fate-backfill')

async function main(args = process.argv.slice(2)) {
  if (args.length !== 1 || !['--plan', '--apply'].includes(args[0])) throw Error('Use --plan or --apply; fixed hendrixh production target')
  const apply = args[0] === '--apply', userId = '596071449219956915'
  if (!require('../../services/sanity').isPaused(userId)) throw Error('Pause must be configured before updating its account')
  const runtime = resolveRuntime('production')
  const guildId = require('dotenv').parse(fs.readFileSync(runtime.envFile)).GUILDID
  const db = new Sequelize({ ...runtime.database, dialectOptions: { mode: apply ? sqlite.OPEN_READWRITE : sqlite.OPEN_READONLY } })
  const select = (sql, transaction) => db.query(sql, { type: Sequelize.QueryTypes.SELECT, transaction })
  const read = transaction => db.query('SELECT * FROM SanityAccount WHERE guildId = ? AND userId = ?', {
    replacements: [guildId, userId], type: Sequelize.QueryTypes.SELECT, transaction })
  const directory = path.join(runtime.root, 'artifacts/sanity-hendrixh-pause-2026-10-20')
  fs.mkdirSync(directory, { recursive: true })
  try {
    const [account] = await read()
    if (!account || account.userName !== 'hendrixh') throw Error('Target identity mismatch')
    const report = { at: new Date().toISOString(), environment: 'production', before: account, applied: apply }
    if (apply) {
      const filename = path.join(directory, `production-before-${Date.now()}.sqlite`)
      await onlineBackup(runtime.database.storage, filename)
      report.backup = { path: filename, ...await verifyDatabase(filename),
        sha256: require('node:crypto').createHash('sha256').update(fs.readFileSync(filename)).digest('hex') }
      await db.transaction({ type: Sequelize.Transaction.TYPES.IMMEDIATE }, async transaction => {
        const schema = await select("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name", transaction)
        const tables = {}
        for (const table of schema.filter(row => row.type === 'table')) tables[table.name] = await select(`SELECT * FROM "${table.name.replaceAll('"', '""')}" ORDER BY rowid`, transaction)
        const [current] = await read(transaction)
        assert.equal(current.userName, 'hendrixh')
        report.before = current
        await db.query('UPDATE SanityAccount SET trackingEnabled = 0 WHERE guildId = ? AND userId = ?', { replacements: [guildId, userId], transaction })
        for (const [name, rows] of Object.entries(tables)) {
          const actual = await select(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`, transaction)
          const expected = name === 'SanityAccount' ? rows.map(row => row.guildId === guildId && row.userId === userId ? { ...row, trackingEnabled: 0 } : row) : rows
          assert.deepEqual(actual, expected, `Unexpected changes in ${name}`)
        }
        assert.deepEqual(await select("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name", transaction), schema)
        report.preservation = { tables: Object.keys(tables).length, onlyTargetTrackingFlagChanged: true, schemaUnchanged: true }
        report.after = (await read(transaction))[0]
      })
      report.integrity = await select('PRAGMA integrity_check')
      report.foreignKeys = await select('PRAGMA foreign_key_check')
      assert.equal(report.integrity[0].integrity_check, 'ok'); assert.equal(report.foreignKeys.length, 0)
    }
    const filename = path.join(directory, `${apply ? 'applied' : 'plan'}-${Date.now()}.json`)
    fs.writeFileSync(filename, JSON.stringify(report, null, 2), { flag: 'wx' })
    console.log(JSON.stringify({ userName: account.userName, balance: (report.after || account).balance,
      trackingEnabled: (report.after || account).trackingEnabled, applied: apply, report: filename }))
  } finally { await db.close() }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1 })
module.exports = { main }
