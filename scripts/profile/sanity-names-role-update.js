const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { Sequelize, DataTypes } = require('sequelize')
const sqlite = require('sqlite3')
const { REST, Routes } = require('discord.js')
const { resolveRuntime } = require('../../config/runtime/runtime')
const { onlineBackup, verifyDatabase } = require('../spooky/spooky-collection-fate-backfill')

async function snapshot(db, transaction) {
  const select = sql => db.query(sql, { type: Sequelize.QueryTypes.SELECT, transaction })
  const schema = await select("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name")
  const tables = {}
  for (const row of schema.filter(row => row.type === 'table')) tables[row.name] = await select(`SELECT * FROM "${row.name.replaceAll('"', '""')}" ORDER BY rowid`)
  return { schema, tables }
}

async function main(args = process.argv.slice(2)) {
  if (args.length !== 1 || !['--plan', '--apply'].includes(args[0])) throw Error('Use --plan or --apply; fixed development and production targets')
  const apply = args[0] === '--apply'
  const root = resolveRuntime('production').root
  const directory = path.join(root, 'artifacts/sanity-names-role-2026-10-20')
  fs.mkdirSync(directory, { recursive: true })
  const reports = []
  for (const environment of ['development', 'production']) {
    const runtime = resolveRuntime(environment)
    const env = require('dotenv').parse(fs.readFileSync(runtime.envFile))
    if (!env.GUILDID || !env.UNWANTEDROLEID || !env.TOKEN || !fs.existsSync(runtime.database.storage)) throw Error(`Missing ${environment} scope or database`)
    const rest = new REST({ version: '10' }).setToken(env.TOKEN)
    const db = new Sequelize({ ...runtime.database, dialectOptions: { mode: apply ? sqlite.OPEN_READWRITE : sqlite.OPEN_READONLY } })
    try {
      const accounts = await db.query('SELECT a.*, u.user_name AS storedUserName FROM SanityAccount a LEFT JOIN Users u ON u.user_id = a.userId', { type: Sequelize.QueryTypes.SELECT })
      if (accounts.some(account => account.guildId !== env.GUILDID)) throw Error('Unexpected Sanity guild scope')
      const members = []
      for (const account of accounts) {
        let member = null, user
        try { member = await rest.get(Routes.guildMember(env.GUILDID, account.userId)); user = member.user }
        catch (error) {
          if (error.status !== 404) throw Error(`${environment} membership lookup failed (${error.status || error.code})`)
          try { user = await rest.get(Routes.user(account.userId)) }
          catch (error) { if (error.status !== 404) throw Error(`${environment} username lookup failed (${error.status || error.code})`) }
        }
        const userName = user?.username || account.storedUserName || account.userName || null
        members.push({ guildId: account.guildId, userId: account.userId, userName,
          displayName: member?.nick || user?.global_name || userName || account.displayName || null,
          trackingEnabled: Boolean(member && !user.bot && member.roles.includes(env.UNWANTEDROLEID) && !member.roles.includes(env.BOTROLEID) && !require('../../services/sanity').isPaused(account.userId)),
          memberFound: Boolean(member) })
      }
      const report = { environment, at: new Date().toISOString(), accounts: accounts.length,
        named: members.filter(member => member.userName).length, tracking: members.filter(member => member.trackingEnabled).length,
        excluded: members.filter(member => !member.trackingEnabled).length, members }
      if (apply) {
        const backupPath = path.join(directory, `${environment}-before-${Date.now()}.sqlite`)
        await onlineBackup(runtime.database.storage, backupPath)
        report.backup = { path: backupPath, ...await verifyDatabase(backupPath),
          sha256: require('node:crypto').createHash('sha256').update(fs.readFileSync(backupPath)).digest('hex') }
        await require('../../services/spooky/economy').serialize(db, () => db.transaction({ type: Sequelize.Transaction.TYPES.IMMEDIATE }, async transaction => {
          const before = await snapshot(db, transaction)
          await require('../../migrations/sanity-account-names').up(db.getQueryInterface(), { transaction })
          for (const member of members) await db.query('UPDATE SanityAccount SET userName = ?, displayName = ?, trackingEnabled = ? WHERE guildId = ? AND userId = ?', {
            replacements: [member.userName, member.displayName, Number(member.trackingEnabled), member.guildId, member.userId], transaction })
          const after = await snapshot(db, transaction)
          for (const [name, rows] of Object.entries(before.tables)) {
            const comparable = name === 'SanityAccount' ? after.tables[name].map(row => {
              const copy = { ...row }; delete copy.userName; delete copy.displayName; delete copy.trackingEnabled; return copy
            }) : after.tables[name]
            const original = name === 'SanityAccount' ? rows.map(row => {
              const copy = { ...row }; delete copy.userName; delete copy.displayName; delete copy.trackingEnabled; return copy
            }) : rows
            assert.deepEqual(comparable, original, `Unexpected ${name} row changes`)
          }
          assert.deepEqual(after.schema.filter(row => row.name !== 'SanityAccount'), before.schema.filter(row => row.name !== 'SanityAccount'))
          report.preservation = { tables: Object.keys(before.tables).length, balancesAndAllPriorColumnsUnchanged: true, otherSchemaUnchanged: true }
        }))
        if (environment === 'production') {
          const User = require('../../Models/User/User')(db, DataTypes)
          const models = require('../../services/spooky/models').defineSpookyModels(db)
          const event = require('../../services/spooky/config').config
          const baseEconomy = require('../../services/spooky/economy').createEconomy({ sequelize: db, models, configVersion: event.version })
          const economy = { ...baseEconomy, execute: (input, mutate) => baseEconomy.execute(input, async ctx => {
            const before = await snapshot(db, ctx.transaction)
            const result = await mutate(ctx)
            const after = await snapshot(db, ctx.transaction)
            for (const [name, rows] of Object.entries(before.tables)) {
              const expected = name === 'Users' ? rows.map(row => row.user_id === result.userId ? { ...row, bank: result.bank } : row) : rows
              const actual = name === 'SpookyLedger' ? after.tables[name].slice(0, rows.length) : after.tables[name]
              assert.deepEqual(actual, expected, `Unexpected correction changes in ${name}`)
            }
            assert.deepEqual(after.schema, before.schema)
            return { ...result, allOtherDataPreserved: true }
          }) }
          report.ownerCorrection = await require('../../services/spooky/owner-collection-correction').correctOwnerCollectionFate({
            User, models, economy, event, guildId: env.GUILDID, userId: '138131238803210240' })
        }
        report.integrity = await db.query('PRAGMA integrity_check', { type: Sequelize.QueryTypes.SELECT })
        report.foreignKeys = await db.query('PRAGMA foreign_key_check', { type: Sequelize.QueryTypes.SELECT })
        assert.equal(report.integrity[0].integrity_check, 'ok'); assert.equal(report.foreignKeys.length, 0)
      }
      const filename = path.join(directory, `${environment}-${apply ? 'applied' : 'plan'}-${Date.now()}.json`)
      fs.writeFileSync(filename, JSON.stringify(report, null, 2), { flag: 'wx' })
      reports.push({ environment, accounts: report.accounts, named: report.named, tracking: report.tracking,
        excluded: report.excluded, ownerReversed: report.ownerCorrection?.receipt.reversed, report: filename })
      console.log(JSON.stringify(reports.at(-1)))
    } finally { await db.close() }
  }
  return reports
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1 })
module.exports = { main }
