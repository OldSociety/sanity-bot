const fs = require('node:fs'), path = require('node:path')
const { parse } = require('dotenv')
const sqlite = require('sqlite3')
const root = path.resolve(__dirname, '../..')
async function main() {
const report = []
for (const environment of ['development', 'production']) {
  const config = parse(fs.readFileSync(path.join(root, `.env.${environment}`)))
  const db = await new Promise((resolve, reject) => { const connection = new sqlite.Database(path.join(root, 'config', environment === 'development' ? 'dev.sqlite' : 'prod.sqlite'), sqlite.OPEN_READONLY, error => error ? reject(error) : resolve(connection)) })
  try {
    const rows = await new Promise((resolve, reject) => db.all('SELECT b.*, u.user_name FROM BadgeOwnership b LEFT JOIN Users u ON u.user_id=b.userId WHERE b.guildId=? ORDER BY b.awardedAt DESC', [config.GUILDID], (error, rows) => error ? reject(error) : resolve(rows)))
    const ledger = await new Promise((resolve, reject) => db.all("SELECT l.resource,l.timestamp,l.metadata,o.operationType FROM SpookyLedger l JOIN SpookyOperations o ON o.operationId=l.operationId WHERE l.guildId=? AND l.userId=? AND l.resource LIKE 'badge:%' ORDER BY l.timestamp DESC", [config.GUILDID, config.BOTADMINID], (error, rows) => error ? reject(error) : resolve(rows)))
    report.push({ environment, guildId: config.GUILDID, botRoleId: config.BOTROLEID || null, adminRoleId: config.ADMINROLEID || null,
      configuredOwnerBadges: rows.filter(row => row.userId === config.BOTADMINID), ownership: rows, badgeAwardLedger: ledger })
  } finally { await new Promise(resolve => db.close(resolve)) }
}
fs.writeFileSync(path.join(__dirname, 'badge-audit.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
