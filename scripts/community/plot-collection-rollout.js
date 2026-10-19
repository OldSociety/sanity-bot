// Explicit operator utility for the October 16 rollout. No startup caller.
// Never restores a database: rollback disables Plot and preserves live activity.
const fs = require('node:fs'),
  path = require('node:path'),
  cp = require('node:child_process')
const { createHash } = require('node:crypto')
const sqlite = require('sqlite3'),
  Sequelize = require('sequelize')
const root = path.resolve(__dirname, '..')
const added = ['PlotContribution', 'PlotGuild', 'PlotMilestone']
const hash = (value) => createHash('sha256').update(value).digest('hex')
const save = (file, value) =>
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
function processes() {
  return JSON.parse(
    cp.execSync('pm2 jlist', { encoding: 'utf8', shell: true }),
  ).map((p) => ({
    name: p.name,
    pid: p.pid,
    status: p.pm2_env.status,
    cwd: p.pm2_env.pm_cwd,
    entry: p.pm2_env.pm_exec_path,
    restarts: p.pm2_env.restart_time,
    out: p.pm2_env.pm_out_log_path,
    error: p.pm2_env.pm_err_log_path,
    outBytes: fs.existsSync(p.pm2_env.pm_out_log_path)
      ? fs.statSync(p.pm2_env.pm_out_log_path).size
      : 0,
    errorBytes: fs.existsSync(p.pm2_env.pm_err_log_path)
      ? fs.statSync(p.pm2_env.pm_err_log_path).size
      : 0,
  }))
}
function assertStopped() {
  const rows = processes()
  for (const name of ['SB-production', 'SB-development']) {
    const matches = rows.filter((p) => p.name === name)
    if (
      matches.length !== 1 ||
      matches[0].status !== 'stopped' ||
      matches[0].pid ||
      path.resolve(matches[0].cwd) !== root ||
      path.resolve(matches[0].entry) !== path.join(root, 'app.js')
    )
      throw Error(`Stop the single pinned ${name} writer first`)
  }
  return rows
}
async function readDatabase(file, inspect) {
  const db = await new Promise((resolve, reject) => {
    const connection = new sqlite.Database(
      file,
      sqlite.OPEN_READONLY,
      (error) => (error ? reject(error) : resolve(connection)),
    )
  })
  const all = (sql) =>
    new Promise((resolve, reject) =>
      db.all(sql, (error, rows) => (error ? reject(error) : resolve(rows))),
    )
  try {
    await all('BEGIN')
    if (
      (await all('PRAGMA integrity_check'))[0].integrity_check !== 'ok' ||
      (await all('PRAGMA foreign_key_check')).length
    )
      throw Error('Database integrity check failed')
    const tables = (
      await all(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
    ).map((row) => row.name)
    const contents = {}
    for (const name of tables) {
      const rows = await all(`SELECT * FROM "${name.replaceAll('"', '""')}"`)
      contents[name] = {
        count: rows.length,
        hash: hash(
          JSON.stringify(rows.map((row) => JSON.stringify(row)).sort()),
        ),
      }
    }
    const extra = inspect ? await inspect(all) : {}
    return {
      tables,
      contents,
      integrity: 'ok',
      foreignKeyViolations: 0,
      ...extra,
    }
  } finally {
    await all('ROLLBACK').catch(() => {})
    await new Promise((resolve, reject) =>
      db.close((error) => (error ? reject(error) : resolve())),
    )
  }
}
function preserve(before, after) {
  for (const [name, value] of Object.entries(before.contents))
    if (JSON.stringify(after.contents[name]) !== JSON.stringify(value))
      throw Error(`Existing table changed: ${name}`)
  const newTables = after.tables.filter((name) => !before.tables.includes(name))
  if (newTables.some((name) => !added.includes(name)))
    throw Error('Unexpected added table')
  if (!added.every((name) => after.tables.includes(name)))
    throw Error('Incomplete Plot schema')
}
async function migrate(file) {
  const before = await readDatabase(file)
  const present = added.filter((name) => before.tables.includes(name))
  if (present.length && present.length !== added.length)
    throw Error('Partial Plot schema requires manual review')
  if (!present.length) {
    const db = new Sequelize({
      dialect: 'sqlite',
      storage: file,
      logging: false,
    })
    try {
      await require('../../migrations/plot-points').up(db.getQueryInterface())
    } finally {
      await db.close()
    }
  }
  const after = await readDatabase(file)
  preserve(before, after)
  for (const name of added.filter((name) => !before.tables.includes(name)))
    if (after.contents[name].count) throw Error('New Plot table must be empty')
  return {
    before,
    after,
    added: after.tables.filter((name) => !before.tables.includes(name)),
    preservedExistingRows: true,
  }
}
function sourceBackup(directory) {
  const source = path.join(directory, 'source'),
    files = []
  fs.mkdirSync(source)
  function visit(relative) {
    const absolute = path.join(root, relative),
      stat = fs.statSync(absolute)
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute))
        if (name !== 'backups') visit(path.join(relative, name))
    } else if (/\.(js|json)$/.test(relative)) {
      const destination = path.join(source, relative)
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.copyFileSync(absolute, destination, fs.constants.COPYFILE_EXCL)
      const digest = hash(fs.readFileSync(absolute))
      if (hash(fs.readFileSync(destination)) !== digest)
        throw Error('Source backup mismatch')
      files.push({ path: relative, hash: digest })
    }
  }
  for (const name of [
    'app.js',
    'ecosystem.config.js',
    'package.json',
    'package-lock.json',
    'services',
    'handlers',
    'Events',
    'commands',
    'config',
    'Models',
    'migrations',
  ])
    visit(name)
  return files
}
async function storage() {
  const stopped = assertStopped()
  const directory = path.join(
    root,
    'config/backups',
    `plot-collection-production-${Date.now()}`,
  )
  fs.mkdirSync(directory, { recursive: true })
  save(path.join(directory, 'source.json'), sourceBackup(directory))
  save(path.join(directory, 'processes-before.json'), stopped)
  const baseline = {}
  // Back up and rehearse BOTH databases before mutating either live database.
  for (const name of ['prod', 'dev']) {
    const file = path.join(root, 'config', `${name}.sqlite`),
      backup = path.join(directory, `${name}.sqlite`)
    if (fs.existsSync(file + '-wal') && fs.statSync(file + '-wal').size)
      throw Error('Uncheckpointed WAL requires explicit handling')
    const before = await readDatabase(file)
    fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL)
    if (hash(fs.readFileSync(file)) !== hash(fs.readFileSync(backup)))
      throw Error('Database backup hash mismatch')
    if (JSON.stringify(await readDatabase(backup)) !== JSON.stringify(before))
      throw Error('Database backup row mismatch')
    const rehearsal = path.join(directory, `${name}-rehearsal.sqlite`)
    fs.copyFileSync(backup, rehearsal, fs.constants.COPYFILE_EXCL)
    const proof = await migrate(rehearsal)
    baseline[name] = {
      file,
      backup,
      hash: hash(fs.readFileSync(backup)),
      before,
      rehearsal: proof,
    }
  }
  save(path.join(directory, 'baseline.json'), baseline)
  assertStopped()
  const result = {}
  for (const name of ['prod', 'dev']) {
    if (hash(fs.readFileSync(baseline[name].file)) !== baseline[name].hash)
      throw Error('Database changed after backup')
    result[name] = await migrate(baseline[name].file)
    save(path.join(directory, `${name}-migration.json`), result[name])
  }
  save(path.join(directory, 'storage-complete.json'), {
    directory,
    preservedExistingRows: true,
  })
  console.log(
    JSON.stringify({
      directory,
      databases: Object.fromEntries(
        Object.entries(result).map(([name, proof]) => [
          name,
          {
            added: proof.added,
            tables: proof.after.tables.length,
            preservedExistingRows: true,
          },
        ]),
      ),
    }),
  )
}
async function registry(environment, apply, directory) {
  if (!['production', 'development'].includes(environment))
    throw Error('Select a pinned environment')
  if (
    apply &&
    (!directory ||
      !fs.existsSync(path.join(directory, 'storage-complete.json')))
  )
    throw Error('Verified stopped-writer storage evidence required')
  const runtime =
    require('../../config/runtime/runtime').loadDiscordEnvironment(environment)
  const { REST, Routes } = require('discord.js'),
    { matches } = require('../../deploy-commands')
  const rest = new REST().setToken(process.env.TOKEN),
    route = Routes.applicationGuildCommands(runtime.clientId, runtime.guildId)
  const before = await rest.get(route),
    desired = require('../../commands/Server/Profile').data.toJSON()
  if (
    environment === 'production' &&
    before.some((command) => ['arena', 'cocoa'].includes(command.name))
  )
    throw Error(
      'Unexpected development game in production registry; inspect separately',
    )
  if (!apply) {
    const database = await readDatabase(runtime.database.storage)
    console.log(
      JSON.stringify({
        environment,
        guildId: runtime.guildId,
        commands: before.map((command) => ({
          name: command.name,
          options: command.options?.map((option) => option.name),
        })),
        tables: database.tables,
        desiredProfile: desired,
      }),
    )
    return
  }
  const old = before.find(
    (command) => command.name === 'profile' && command.type === 1,
  )
  save(path.join(directory, `${environment}-registry-before.json`), before)
  if (!old || !matches(old, desired)) {
    if (old)
      await rest.patch(
        Routes.applicationGuildCommand(
          runtime.clientId,
          runtime.guildId,
          old.id,
        ),
        { body: desired },
      )
    else await rest.post(route, { body: desired })
  }
  const after = await rest.get(route),
    profile = after.find(
      (command) => command.name === 'profile' && command.type === 1,
    )
  if (!matches(profile, desired))
    throw Error('Profile registry verification failed')
  for (const command of before.filter(
    (command) => command.name !== 'profile',
  )) {
    const preserved = after.find((item) => item.id === command.id)
    if (JSON.stringify(preserved) !== JSON.stringify(command))
      throw Error(`Unrelated command changed: ${command.name}`)
  }
  if (after.length !== before.length + (old ? 0 : 1))
    throw Error('Unexpected command count change')
  save(path.join(directory, `${environment}-registry-after.json`), after)
  console.log(
    JSON.stringify({
      environment,
      profileOptions: profile.options.map((option) => option.name),
      commandCount: after.length,
      unrelatedCommandsPreserved: true,
    }),
  )
}
async function main() {
  const [mode, environment, directory] = process.argv.slice(2)
  if (mode === 'storage' && !environment) return storage()
  if (mode === 'plan' && !directory) return registry(environment, false)
  if (mode === 'registry') return registry(environment, true, directory)
  throw Error(
    'Usage: plot-collection-rollout.js storage | plan <environment> | registry <environment> <backup-directory>',
  )
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
module.exports = { readDatabase, preserve }
