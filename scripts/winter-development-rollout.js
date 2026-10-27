// Stopped development backup and activation verification. Never logs credentials.
const fs = require('node:fs')
const path = require('node:path')
const cp = require('node:child_process')
const { createHash } = require('node:crypto')
const { snapshot } = require('./checkins/development-rollout')
const root = path.resolve(__dirname, '..')
const directory = path.join(root, 'artifacts/winter-gym-max-dialogue-development-2026-10-27')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const save = (name, value) => fs.writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2))
const read = name => JSON.parse(fs.readFileSync(path.join(directory, name)))
function files(folder) {
  if (!fs.existsSync(folder)) return []
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(folder, e.name)) : [path.join(folder, e.name)])
}
function processes() {
  return JSON.parse(cp.execFileSync('pm2.cmd', ['jlist'], { shell: true, encoding: 'utf8' })).map(p => ({ name: p.name, pid: p.pid, status: p.pm2_env.status, restarts: p.pm2_env.restart_time, cwd: p.pm2_env.pm_cwd, error: p.pm2_env.pm_err_log_path, out: p.pm2_env.pm_out_log_path }))
}
async function main() {
  if (process.env.NODE_ENV !== 'development') throw Error('Development required.')
  fs.mkdirSync(directory, { recursive: true })
  const list = processes(), dev = list.find(p => p.name === 'SB-development'), prod = list.find(p => p.name === 'SB-production')
  if (!dev || !prod || dev.cwd.toLowerCase() !== root.toLowerCase()) throw Error('Unexpected PM2 target.')
  const phase = process.argv[2]
  if (phase === 'before') {
    const candidates = [...['app.js', 'ecosystem.config.js', 'AGENTS.md', 'assets/badges/Winter/WINTER_KYLAX_BADGE.png', 'assets/badges/Classic/REQUIA_BADGE.png', 'assets/badges/Classic/HENDRIX_BADGE.png'].map(f => path.join(root, f)), ...['commands', 'Events', 'handlers', 'services', 'config/arena', 'config/commands', 'config/runtime', 'config/winter', 'assets/winter', 'artifacts/arena-versions'].flatMap(f => files(path.join(root, f)))]
    const hashes = Object.fromEntries(candidates.map(file => [path.relative(root, file), hash(fs.readFileSync(file))]))
    save('before.json', { processes: list, hashes, logs: { out: fs.statSync(dev.out).size, error: fs.statSync(dev.error).size } })
    console.log(JSON.stringify({ processes: list, protectedFiles: candidates.length }))
  } else if (phase === 'backup') {
    if (dev.pid || dev.status !== 'stopped') throw Error('Stop development before backup.')
    const before = await snapshot(path.join(root, 'config/dev.sqlite'))
    const backup = path.join(root, `config/backups/winter-development-${Date.now()}-stopped`)
    fs.mkdirSync(backup)
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      const file = path.join(root, 'config/dev.sqlite' + suffix)
      if (fs.existsSync(file)) fs.copyFileSync(file, path.join(backup, 'dev.sqlite' + suffix), fs.constants.COPYFILE_EXCL)
    }
    if (JSON.stringify(before) !== JSON.stringify(await snapshot(path.join(backup, 'dev.sqlite')))) throw Error('Backup differs.')
    for (const file of Object.keys(read('before.json').hashes)) {
      const destination = path.join(backup, file)
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.copyFileSync(path.join(root, file), destination, fs.constants.COPYFILE_EXCL)
    }
    save('storage-before.json', { before, backup })
    console.log(JSON.stringify({ backup, integrity: before.integrity, tables: Object.keys(before.tables).length }))
  } else if (phase === 'verify') {
    const baseline = read('before.json'), original = baseline.processes.find(p => p.name === 'SB-production')
    if (prod.pid !== original.pid || prod.restarts !== original.restarts || prod.status !== original.status) throw Error('Production process changed.')
    if (dev.status !== 'online' || !dev.pid || dev.pid === baseline.processes.find(p => p.name === dev.name).pid) throw Error('Development did not restart.')
    for (const [file, expected] of Object.entries(baseline.hashes)) {
      if (file.endsWith('activations.jsonl')) continue
      if (hash(fs.readFileSync(path.join(root, file))) !== expected) throw Error(`Protected source changed: ${file}`)
    }
    const out = fs.readFileSync(dev.out).subarray(baseline.logs.out).toString('utf8')
    const errors = fs.readFileSync(dev.error).subarray(baseline.logs.error).toString('utf8')
    const ready = out.includes('Ready! Logged in as Sanity Bot [DEV]')
    const stopped = read('storage-before.json'), after = await snapshot(path.join(root, 'config/dev.sqlite'))
    const changedTables = Object.keys(stopped.before.tables).filter(k => JSON.stringify(after.tables[k]) !== JSON.stringify(stopped.before.tables[k]))
    const evidence = { processes: list, ready, addedErrorBytes: Buffer.byteLength(errors), errors, after, changedTables, schemaUnchanged: after.schemaHash === stopped.before.schemaHash, productionUnchanged: true, backup: stopped.backup }
    save('activation.json', evidence)
    console.log(JSON.stringify({ development: dev.pid, production: prod.pid, ready, addedErrorBytes: evidence.addedErrorBytes, changedTables, schemaUnchanged: evidence.schemaUnchanged, productionUnchanged: true }))
    if (!ready || errors.length) throw Error('Inspect startup evidence.')
  } else throw Error('Use before, backup or verify.')
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
