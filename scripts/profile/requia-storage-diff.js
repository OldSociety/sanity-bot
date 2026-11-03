// Read-only comparison of the stopped backup and live production data.
const fs = require('node:fs'), path = require('node:path'), sqlite = require('sqlite3')
const root = path.resolve(__dirname, '../..'), dir = path.join(root, 'artifacts/profile-requia-production')
const backup = JSON.parse(fs.readFileSync(path.join(dir, 'backup.json'))).backup
const connect = file => new Promise((resolve, reject) => { const db = new sqlite.Database(file, sqlite.OPEN_READONLY, e => e ? reject(e) : resolve(db)) })
const all = (db, sql) => new Promise((resolve, reject) => db.all(sql, (e, rows) => e ? reject(e) : resolve(rows)))
async function main() {
  const before = await connect(path.join(backup, 'config/prod.sqlite')), after = await connect(path.join(root, 'config/prod.sqlite'))
  const result = {}
  try {
    for (const { name } of await all(before, "SELECT name FROM sqlite_master WHERE type='table'")) {
      const quoted = '"' + name.replaceAll('"', '""') + '"'
      const keys = (await all(before, `PRAGMA table_info(${quoted})`)).filter(c => c.pk).sort((a,b) => a.pk-b.pk).map(c => c.name)
      const old = await all(before, `SELECT * FROM ${quoted}`), current = await all(after, `SELECT * FROM ${quoted}`)
      const key = row => JSON.stringify(keys.length ? keys.map(k => row[k]) : row)
      const indexed = new Map(current.map(row => [key(row), row])), previous = new Set(old.map(key))
      const changes = old.flatMap(row => {
        const now = indexed.get(key(row))
        if (!now) return [{ missing: true }]
        const fields = Object.keys(row).filter(f => JSON.stringify(row[f]) !== JSON.stringify(now[f]))
        return fields.length ? [{ fields, numericChanges: Object.fromEntries(fields.filter(f => typeof row[f] === 'number').map(f => [f, { before: row[f], after: now[f] }])) }] : []
      })
      const added = current.filter(row => !previous.has(key(row)))
      result[name] = { before: old.length, after: current.length, changes, added: added.length,
        addedKinds: [...new Set(added.map(row => row.kind || row.type || row.purpose || row.operationId?.split(':')[0]).filter(Boolean))] }
      if (name === 'SanityAccount') {
        const oldReceipts = new Set((await all(before, 'SELECT operationId FROM SanityReceipt')).map(row => row.operationId))
        const receipts = (await all(after, 'SELECT * FROM SanityReceipt')).filter(row => !oldReceipts.has(row.operationId))
        result[name].balanceChangesSupportedByNewDailyReceipts = old.every(row => {
          const now = indexed.get(key(row))
          if (!now || now.balance === row.balance) return Boolean(now)
          return receipts.some(receipt => {
            const data = typeof receipt.result === 'string' ? JSON.parse(receipt.result) : receipt.result
            return receipt.userId === row.userId && receipt.guildId === row.guildId && data.kind === 'daily-settlement' && data.before === row.balance && data.after === now.balance
          })
        })
        if (!result[name].balanceChangesSupportedByNewDailyReceipts) throw Error('Unexplained balance change')
      }
    }
  } finally { await new Promise(r => before.close(r)); await new Promise(r => after.close(r)) }
  fs.writeFileSync(path.join(dir, 'storage-diff.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(Object.fromEntries(Object.entries(result).filter(([, v]) => v.changes.length || v.added)), null, 2))
}
main().catch(e => { console.error(e.message); process.exitCode = 1 })
