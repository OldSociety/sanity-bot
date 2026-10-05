// Narrow, explicit development rollout helper. No player actions or production writes.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process')
const { createHash } = require('node:crypto')
const root = path.resolve(__dirname, '..'), checkout = root
const output = path.join(checkout, 'artifacts/profile-development-rollout')
fs.mkdirSync(output, { recursive: true })
const save = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n')
function processes() {
  return JSON.parse(cp.execFileSync('pm2.cmd', ['jlist'], { shell: true, encoding: 'utf8' })).map(p => ({ name: p.name, pid: p.pid,
    status: p.pm2_env.status, cwd: p.pm2_env.pm_cwd, script: p.pm2_env.pm_exec_path, restarts: p.pm2_env.restart_time,
    error: p.pm2_env.pm_err_log_path, out: p.pm2_env.pm_out_log_path }))
}
function runtime() {
  if (process.env.NODE_ENV !== 'development' || process.env.SANITY_DEVELOPMENT_RUNTIME_ROOT !== root) throw Error('Explicit pinned development runtime required')
  const selected = require('../config/runtime').loadDiscordEnvironment('development')
  if (selected.root !== root || selected.guildId !== '684459745167671453' || selected.productionGuildComparison !== 'distinct' ||
    selected.database.storage !== path.join(root, 'config/dev.sqlite')) throw Error('Unexpected development target')
  return selected
}
async function readDatabase(file) {
  const sqlite = require('sqlite3')
  const db = await new Promise((resolve, reject) => { const connection = new sqlite.Database(file, sqlite.OPEN_READONLY, error => error ? reject(error) : resolve(connection)) })
  return { all: sql => new Promise((resolve, reject) => db.all(sql, (error, rows) => error ? reject(error) : resolve(rows))),
    close: () => new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve())) }
}
async function snapshot(db) {
  const tables = (await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).map(row => row.name)
  const contents = []
  for (const name of tables) contents.push({ name, rows: await db.all(`SELECT * FROM "${name.replaceAll('"', '""')}"`) })
  return { digest: createHash('sha256').update(JSON.stringify(contents)).digest('hex'), counts: Object.fromEntries(contents.map(t => [t.name, t.rows.length])), tables }
}
async function storage(selected, daily = false) {
  const current = processes(), dev = current.find(p => p.name === 'SB-development')
  if (!dev || dev.status !== 'stopped' || dev.pid) throw Error('Development writer must be stopped before backup/migration')
  const db = await readDatabase(selected.database.storage)
  if ((await db.all('PRAGMA integrity_check'))[0].integrity_check !== 'ok' || (await db.all('PRAGMA foreign_key_check')).length) throw Error('Development database failed integrity checks')
  const before = await snapshot(db)
  const addedTables = daily ? ['SanityDay', 'SanityDailyState'] : ['SanityAccount', 'SanityReceipt']
  if (!before.tables.includes('BadgeOwnership') || addedTables.some(name => before.tables.includes(name)) ||
    (daily && !before.tables.includes('SanityAccount'))) throw Error('Unexpected migration baseline')
  const directory = path.join(root, 'config/backups', (daily ? 'sanity-daily-' : 'profile-sanity-') + Date.now())
  fs.mkdirSync(directory, { recursive: true })
  const backup = path.join(directory, 'dev.sqlite')
  await db.close()
  const wal = selected.database.storage + '-wal'
  if (fs.existsSync(wal) && fs.statSync(wal).size !== 0) throw Error('Uncheckpointed WAL must be backed up before continuing')
  fs.copyFileSync(selected.database.storage, backup, fs.constants.COPYFILE_EXCL)
  const check = await readDatabase(backup)
  if ((await check.all('PRAGMA integrity_check'))[0].integrity_check !== 'ok' || (await snapshot(check)).digest !== before.digest) throw Error('Backup failed verification')
  await check.close()
  save(daily ? 'daily-storage-before.json' : 'storage-before.json', { database: selected.database.storage, backup, before })
  const Sequelize = require('sequelize'), sequelize = new Sequelize({ ...selected.database, logging: false })
  try { await require(daily ? '../migrations/sanity-daily' : '../migrations/sanity').up(sequelize.getQueryInterface()) } finally { await sequelize.close() }
  const afterDb = await readDatabase(selected.database.storage)
  const after = await snapshot(afterDb), oldTables = after.tables.filter(name => !addedTables.includes(name))
  const contents = []
  for (const name of oldTables) contents.push({ name, rows: await afterDb.all(`SELECT * FROM "${name.replaceAll('"', '""')}"`) })
  if (createHash('sha256').update(JSON.stringify(contents)).digest('hex') !== before.digest ||
    (daily ? after.counts.SanityDailyState !== before.counts.SanityAccount : after.counts.SanityAccount !== 0 || after.counts.SanityReceipt !== 0) ||
    (await afterDb.all('PRAGMA integrity_check'))[0].integrity_check !== 'ok' || (await afterDb.all('PRAGMA foreign_key_check')).length) throw Error('Existing data changed during migration')
  await afterDb.close(); save(daily ? 'daily-storage-after.json' : 'storage-after.json', { after, preservedExistingData: true, integrity: 'ok', foreignKeyViolations: 0 })
  console.log('Verified backup and additive Sanity migration; existing rows unchanged.')
}
async function registry(selected, apply) {
  const { REST, Routes } = require('discord.js'), { matches } = require('../deploy-commands')
  const rest = new REST().setToken(process.env.TOKEN), route = Routes.applicationGuildCommands(selected.clientId, selected.guildId)
  const live = await rest.get(route)
  const desired = [require('../commands/Server/Profile').data.toJSON(), require('../services/spooky/command-definition').spookyCommand({}).data.toJSON()]
  const plan = { guildId: selected.guildId, clientId: selected.clientId, live, desired }
  const hash = createHash('sha256').update(JSON.stringify(plan)).digest('hex')
  if (!apply) { save('registry-plan.json', { ...plan, hash }); console.log(JSON.stringify({ guildId: selected.guildId, commands: live.map(x => x.name), targetedUpdates: desired.map(x => ({ name: x.name, subcommands: x.options.map(o => o.name) })), hash })); return }
  const reviewed = JSON.parse(fs.readFileSync(path.join(output, 'registry-plan.json')))
  if (reviewed.hash !== hash) throw Error('Registry changed since review; inspect a fresh plan')
  if (!fs.existsSync(path.join(output, 'storage-after.json'))) throw Error('Migration must be verified before command update')
  for (const definition of desired) {
    const old = live.find(x => x.name === definition.name && x.type === 1)
    if (old) await rest.patch(Routes.applicationGuildCommand(selected.clientId, selected.guildId, old.id), { body: definition })
    else await rest.post(route, { body: definition })
  }
  const after = await rest.get(route)
  for (const definition of desired) if (!matches(after.find(x => x.name === definition.name), definition)) throw Error('Updated command definition mismatch')
  const other = live.filter(x => !desired.some(d => d.name === x.name))
  if (other.some(old => !matches(after.find(x => x.id === old.id), old))) throw Error('An unrelated command changed')
  save('registry-after.json', { guildId: selected.guildId, commands: after, preservedOtherCommands: true })
  console.log('Profile and Spooky development definitions verified; other commands preserved.')
}
async function main() {
  const selected = runtime(), phase = process.argv[2]
  if (phase === 'full-start-plan') {
    const list = processes(), logs = list.map(p => ({ name: p.name, error: fs.statSync(p.error).size, out: fs.statSync(p.out).size }))
    const { REST, Routes } = require('discord.js'), rest = new REST().setToken(process.env.TOKEN)
    const humans = []; let after
    do {
      const members = await rest.get(Routes.guildMembers(selected.guildId), { query: new URLSearchParams({ limit: '1000', ...(after ? { after } : {}) }) })
      humans.push(...members.filter(m => !m.user.bot).map(m => m.user.id))
      if (members.length < 1000) break
      after = members[members.length - 1].user.id
    } while (true)
    save('full-start-plan.json', { guildId: selected.guildId, humans, processes: list, logs })
    console.log(JSON.stringify({ humanMembers: humans.length, processes: list }))
  } else if (phase === 'full-start-apply') {
    const plan = JSON.parse(fs.readFileSync(path.join(output, 'full-start-plan.json')))
    if (plan.guildId !== selected.guildId) throw Error('Unexpected baseline guild')
    const dev = processes().find(p => p.name === 'SB-development')
    if (!dev || dev.status !== 'stopped' || dev.pid || dev.cwd !== checkout) throw Error('Pinned development writer must be stopped')
    const original = await readDatabase(selected.database.storage), before = await snapshot(original)
    if ((await original.all('PRAGMA integrity_check'))[0].integrity_check !== 'ok' || (await original.all('PRAGMA foreign_key_check')).length) throw Error('Invalid original storage')
    const protectedRows = async db => {
      const rows = []
      for (const table of before.tables.filter(t => !['SanityAccount', 'SanityDailyState', 'SanityReceipt'].includes(t))) rows.push({ table, rows: await db.all(`SELECT * FROM "${table}"`) })
      return createHash('sha256').update(JSON.stringify(rows)).digest('hex')
    }
    const protectedBefore = await protectedRows(original)
    await original.close()
    const wal = selected.database.storage + '-wal'
    if (fs.existsSync(wal) && fs.statSync(wal).size) throw Error('Uncheckpointed WAL')
    const directory = path.join(root, 'config/backups/sanity-full-start-' + Date.now()); fs.mkdirSync(directory, { recursive: true })
    const backup = path.join(directory, 'dev.sqlite'); fs.copyFileSync(selected.database.storage, backup, fs.constants.COPYFILE_EXCL)
    const copy = await readDatabase(backup)
    if ((await snapshot(copy)).digest !== before.digest) throw Error('Backup verification failed')
    await copy.close()
    save('full-start-storage-before.json', { before, backup })
    const Sequelize = require('sequelize'), db = new Sequelize({ ...selected.database, logging: false })
    let applied = 0, seeded = 0
    try {
      const models = require('../services/sanity').defineModels(db), now = new Date()
      const today = require('../services/community-leveling/config').dayKey(now, 'America/Los_Angeles')
      const { dayAt, dayIndex } = require('../services/sanity-daily-models')
      await db.transaction({ type: Sequelize.Transaction.TYPES.IMMEDIATE }, async transaction => {
        const accounts = await models.Account.findAll({ where: { guildId: selected.guildId }, transaction })
        for (const userId of new Set([...accounts.map(a => a.userId), ...plan.humans])) {
          const where = { guildId: selected.guildId, operationId: `baseline:v3:${userId}` }
          if (await models.Receipt.findOne({ where, transaction })) continue
          const [account, created] = await models.Account.findOrCreate({ where: { guildId: selected.guildId, userId }, defaults: { balance: 100, day: today, lastActiveAt: now }, transaction })
          const previous = account.balance
          await account.update({ balance: 100 }, { transaction })
          const [state] = await models.State.findOrCreate({ where: { guildId: selected.guildId, userId }, defaults: { lastSettledDay: dayAt(dayIndex(today) - 1) }, transaction })
          await state.update({ lastSettledDay: dayAt(dayIndex(today) - 1), lastReminderAt: null, lostNotified: false }, { transaction })
          await models.Receipt.create({ ...where, userId, result: { kind: 'initial-full-sanity', before: created ? null : previous, after: 100, credited: created ? 100 : 100 - previous, at: now.toISOString() } }, { transaction })
          applied++; if (created) seeded++
        }
      })
    } finally { await db.close() }
    const afterDb = await readDatabase(selected.database.storage), after = await snapshot(afterDb)
    if (await protectedRows(afterDb) !== protectedBefore || (await afterDb.all('PRAGMA integrity_check'))[0].integrity_check !== 'ok' || (await afterDb.all('PRAGMA foreign_key_check')).length) throw Error('Baseline preservation check failed')
    const balances = await afterDb.all(`SELECT balance FROM SanityAccount WHERE guildId='${selected.guildId}'`)
    if (applied && balances.some(a => a.balance !== 100)) throw Error('Baseline balances mismatch')
    await afterDb.close()
    save('full-start-storage-after.json', { after, applied, seeded, allFull: balances.every(a => a.balance === 100), protectedExistingTables: true })
    console.log(JSON.stringify({ applied, seeded, allFull: balances.every(a => a.balance === 100), backup }))
  } else if (phase === 'inspect-daily') {
    const list = processes(), logs = list.map(p => ({ name: p.name, error: fs.statSync(p.error).size, out: fs.statSync(p.out).size }))
    save('daily-processes-before.json', { processes: list, logs }); console.log(JSON.stringify(list))
  } else if (phase === 'inspect') {
    const list = processes(), logs = list.map(p => ({ name: p.name, error: fs.statSync(p.error).size, out: fs.statSync(p.out).size }))
    save('processes-before.json', { processes: list, logs });
    save('pm2.config.cjs.json', { apps: [{ name: 'SB-development', script: path.join(checkout, 'app.js'), cwd: checkout,
      env: { NODE_ENV: 'development', PORT: 3000, SANITY_DEVELOPMENT_RUNTIME_ROOT: root } }] })
    fs.writeFileSync(path.join(output, 'pm2.config.cjs'), 'module.exports = ' + fs.readFileSync(path.join(output, 'pm2.config.cjs.json'), 'utf8'))
    console.log(JSON.stringify({ checkout, database: selected.database.storage, guildId: selected.guildId, processes: list }))
  } else if (phase === 'storage') await storage(selected)
  else if (phase === 'storage-daily') await storage(selected, true)
  else if (phase === 'plan') await registry(selected, false)
  else if (phase === 'apply') await registry(selected, true)
  else throw Error('Unknown rollout phase')
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
