// Development-only rollout evidence and stopped-writer backup; no bot login,
// Discord sends, schema migrations, or production mutations.
const fs = require('node:fs')
const path = require('node:path')
const cp = require('node:child_process')
const { createHash } = require('node:crypto')
const root = path.resolve(__dirname, '../..')
const directory = path.join(root, 'artifacts/checkins-reminders-2026-10-25')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const save = (name, value) => fs.writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2) + '\n')
function processes() {
  return JSON.parse(cp.execFileSync('pm2.cmd', ['jlist'], { shell: true, encoding: 'utf8' })).map(p => ({
    name: p.name, pid: p.pid, status: p.pm2_env.status, restarts: p.pm2_env.restart_time,
    cwd: p.pm2_env.pm_cwd, error: p.pm2_env.pm_err_log_path, out: p.pm2_env.pm_out_log_path,
  }))
}
async function snapshot(file) {
  const sqlite = require('sqlite3')
  const db = await new Promise((resolve, reject) => { const connection = new sqlite.Database(file, sqlite.OPEN_READONLY, error => error ? reject(error) : resolve(connection)) })
  const all = sql => new Promise((resolve, reject) => db.all(sql, (error, rows) => error ? reject(error) : resolve(rows)))
  try {
    const schema = await all("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name")
    const tables = {}
    for (const entry of schema.filter(x => x.type === 'table')) {
      const rows = await all(`SELECT * FROM "${entry.name.replaceAll('"', '""')}"`)
      tables[entry.name] = { count: rows.length, hash: hash(JSON.stringify(rows)) }
    }
    const integrity = await all('PRAGMA integrity_check'), foreignKeys = await all('PRAGMA foreign_key_check')
    if (integrity[0].integrity_check !== 'ok' || foreignKeys.length) throw Error('Database integrity check failed.')
    return { schemaHash: hash(JSON.stringify(schema)), tables, integrity: 'ok', foreignKeyViolations: 0 }
  } finally { await new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve())) }
}
function filesUnder(folder) {
  if (!fs.existsSync(folder)) return []
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? filesUnder(path.join(folder, entry.name)) : [path.join(folder, entry.name)])
}
async function main() {
  if (process.env.NODE_ENV !== 'development') throw Error('Explicit development environment required.')
  fs.mkdirSync(directory, { recursive: true })
  const list = processes(), dev = list.find(p => p.name === 'SB-development'), prod = list.find(p => p.name === 'SB-production')
  if (!dev || !prod || dev.cwd !== root || prod.cwd !== root) throw Error('Unexpected bot process target.')
  const phase = process.argv[2]
  if (phase === 'before') {
    const candidates = Object.fromEntries(['development', 'production'].map(env => [env,
      JSON.parse(cp.execFileSync(process.execPath, [path.join(root, 'scripts/arena/version.js'), env], { encoding: 'utf8', cwd: root })).buildHash]))
    const sourceFiles = ['app.js', 'Events/InteractionCreate.js', 'commands/CheckIn/CheckInTest.js', 'commands/CheckIn/CheckIn.js', 'config/checkins/checkins.json',
      ...filesUnder(path.join(root, 'services/checkins')).map(file => path.relative(root, file))]
    const hashes = Object.fromEntries(sourceFiles.map(file => [file, hash(fs.readFileSync(path.join(root, file)))]))
    const archives = Object.fromEntries(filesUnder(path.join(root, 'artifacts/arena-versions')).map(file => [path.relative(root, file), hash(fs.readFileSync(file))]))
    const logs = Object.fromEntries(list.map(p => [p.name, { error: fs.statSync(p.error).size, out: fs.statSync(p.out).size }]))
    save('process-before.json', { processes: list, logs, candidates, hashes, archives })
    console.log(JSON.stringify({ processes: list.map(({ name, pid, status }) => ({ name, pid, status })), candidates, sourceFiles: sourceFiles.length, protectedArchives: Object.keys(archives).length }))
  } else if (phase === 'backup') {
    if (dev.status !== 'stopped' || dev.pid) throw Error('Development writer must be stopped before backup.')
    const original = path.join(root, 'config/dev.sqlite')
    const before = await snapshot(original)
    const backup = path.join(root, 'config/backups', `checkins-development-${Date.now()}-stopped`)
    fs.mkdirSync(backup)
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      if (fs.existsSync(original + suffix)) fs.copyFileSync(original + suffix, path.join(backup, 'dev.sqlite' + suffix), fs.constants.COPYFILE_EXCL)
    }
    const copied = await snapshot(path.join(backup, 'dev.sqlite'))
    if (JSON.stringify(before) !== JSON.stringify(copied)) throw Error('Stopped database backup verification failed.')
    const testFile = path.join(root, 'config/checkins/state/owner-tests-development.sqlite')
    let testBefore = null
    if (fs.existsSync(testFile)) {
      testBefore = await snapshot(testFile)
      const testBackup = path.join(backup, 'checkins/owner-tests-development.sqlite')
      fs.mkdirSync(path.dirname(testBackup), { recursive: true })
      for (const suffix of ['', '-wal', '-shm', '-journal']) {
        if (fs.existsSync(testFile + suffix)) fs.copyFileSync(testFile + suffix, testBackup + suffix, fs.constants.COPYFILE_EXCL)
      }
      if (JSON.stringify(await snapshot(testBackup)) !== JSON.stringify(testBefore)) throw Error('Check-in test backup verification failed.')
    }
    const baseline = JSON.parse(fs.readFileSync(path.join(directory, 'process-before.json')))
    for (const file of [...Object.keys(baseline.hashes), ...Object.keys(baseline.archives)]) {
      const destination = path.join(backup, file)
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.copyFileSync(path.join(root, file), destination, fs.constants.COPYFILE_EXCL)
    }
    save('storage-before.json', { backup, before, testBefore })
    console.log(JSON.stringify({ backup, integrity: before.integrity, tables: Object.keys(before.tables).length, verifiedBackup: true }))
  } else if (phase === 'verify') {
    const baseline = JSON.parse(fs.readFileSync(path.join(directory, 'process-before.json')))
    const oldProd = baseline.processes.find(p => p.name === 'SB-production')
    if (prod.pid !== oldProd.pid || prod.restarts !== oldProd.restarts || prod.status !== 'online') throw Error('Production process changed.')
    if (dev.status !== 'online' || !dev.pid || dev.pid === baseline.processes.find(p => p.name === 'SB-development').pid) throw Error('Development did not restart successfully.')
    for (const [file, expected] of Object.entries(baseline.hashes)) if (hash(fs.readFileSync(path.join(root, file))) !== expected) throw Error(`Candidate source changed: ${file}`)
    // The registry appends activation history, while all prior bytes and immutable
    // version snapshots must survive unchanged.
    for (const [file, expected] of Object.entries(baseline.archives)) {
      if (file.endsWith('activations.jsonl')) continue
      if (hash(fs.readFileSync(path.join(root, file))) !== expected) throw Error(`Version archive changed: ${file}`)
    }
    const stopped = JSON.parse(fs.readFileSync(path.join(directory, 'storage-before.json')))
    const after = await snapshot(path.join(root, 'config/dev.sqlite'))
    const changedTables = Object.keys(stopped.before.tables).filter(name => JSON.stringify(stopped.before.tables[name]) !== JSON.stringify(after.tables[name]))
    if (after.schemaHash !== stopped.before.schemaHash) throw Error('Existing database schema changed.')
    const testAfter = await snapshot(path.join(root, 'config/checkins/state/owner-tests-development.sqlite'))
    const changedTestTables = stopped.testBefore ? Object.keys(stopped.testBefore.tables).filter(name => JSON.stringify(stopped.testBefore.tables[name]) !== JSON.stringify(testAfter.tables[name])) : []
    const out = fs.readFileSync(dev.out).subarray(baseline.logs[dev.name].out).toString('utf8')
    const errorBytes = fs.statSync(dev.error).size - baseline.logs[dev.name].error
    if (!out.includes('Ready! Logged in as Sanity Bot [DEV]') || errorBytes !== 0) throw Error('Development startup is not clean; inspect logs.')
    save('activation.json', { processes: list, after, changedTables, testAfter, changedTestTables, freshReady: true, addedErrorBytes: errorBytes, productionUnchanged: true, candidates: baseline.candidates })
    console.log(JSON.stringify({ development: dev.pid, production: prod.pid, freshReady: true, addedErrorBytes: errorBytes, schemaUnchanged: true, changedTables, productionUnchanged: true }))
  } else throw Error('Use before, backup, or verify.')
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1 })
module.exports = { snapshot }
