// Explicitly authorized production profile rollout; no Discord test messages.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process')
const { createHash } = require('node:crypto')
const { snapshot } = require('../checkins/development-rollout')
const root = path.resolve(__dirname, '../..')
const dir = path.join(root, 'artifacts/profile-requia-production')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const save = (name, data) => fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify(data, null, 2))
const read = name => JSON.parse(fs.readFileSync(path.join(dir, name + '.json')))
const walk = folder => fs.readdirSync(folder, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? ['backups', 'state'].includes(e.name) ? [] : walk(path.join(folder, e.name)) : [path.join(folder, e.name)])
function processes() {
  return JSON.parse(cp.execFileSync('pm2.cmd', ['jlist'], { shell: true, encoding: 'utf8' })).map(p => ({
    name: p.name, pid: p.pid, status: p.pm2_env.status, restarts: p.pm2_env.restart_time,
    cwd: p.pm2_env.pm_cwd, out: p.pm2_env.pm_out_log_path, error: p.pm2_env.pm_err_log_path,
  }))
}
function arena() {
  return fs.readFileSync(path.join(root, 'artifacts/arena-versions/activations.jsonl'), 'utf8').trim().split('\n')
    .map(row => JSON.parse(row)).filter(row => row.environment === 'production').at(-1)
}
async function main() {
  if (process.env.NODE_ENV !== 'production') throw Error('Explicit production environment required')
  fs.mkdirSync(dir, { recursive: true })
  const list = processes(), prod = list.find(p => p.name === 'SB-production'), dev = list.find(p => p.name === 'SB-development')
  if (prod?.cwd !== root || dev?.cwd !== root) throw Error('Unexpected process target')
  const phase = process.argv[2]
  if (phase === 'before') {
    const live = arena()
    const candidate = JSON.parse(cp.execFileSync(process.execPath, ['scripts/arena/version.js', 'production'], { cwd: root, encoding: 'utf8' }))
    if (live.pid !== prod.pid || live.buildHash !== candidate.buildHash) throw Error('Unrelated Arena promotion detected')
    const files = ['app.js', ...['services', 'commands', 'Events', 'config'].flatMap(f => walk(path.join(root, f)))]
      .filter(f => /\.(js|json)$/.test(f)).map(f => path.relative(root, f))
    const hashes = Object.fromEntries(files.map(f => [f, hash(fs.readFileSync(path.join(root, f)))]))
    const archives = Object.fromEntries(walk(path.join(root, 'artifacts/arena-versions')).map(f => [path.relative(root, f),
      { size: fs.statSync(f).size, hash: hash(fs.readFileSync(f)) }]))
    save('before', { processes: list, arena: live, hashes, archives,
      logs: { out: fs.statSync(prod.out).size, error: fs.statSync(prod.error).size } })
    console.log(JSON.stringify({ production: prod.pid, development: dev.pid, arena: live.version, ruleset: live.rulesetId, sourceFiles: files.length }))
  } else if (phase === 'backup') {
    if (prod.status !== 'stopped' || prod.pid) throw Error('Production must be stopped')
    const baseline = read('before'), backup = path.join(root, 'config/backups/profile-requia-' + Date.now() + '-production-stopped')
    fs.mkdirSync(backup)
    const databases = ['config/prod.sqlite', 'config/checkins/state/checkins-production.sqlite']
    const storage = {}
    for (const file of databases.filter(f => fs.existsSync(path.join(root, f)))) {
      const before = await snapshot(path.join(root, file)), destination = path.join(backup, file)
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      for (const suffix of ['', '-wal', '-shm', '-journal']) if (fs.existsSync(path.join(root, file + suffix)))
        fs.copyFileSync(path.join(root, file + suffix), destination + suffix, fs.constants.COPYFILE_EXCL)
      if (JSON.stringify(before) !== JSON.stringify(await snapshot(destination))) throw Error('Backup mismatch: ' + file)
      storage[file] = before
    }
    for (const file of [...Object.keys(baseline.hashes), ...Object.keys(baseline.archives)]) {
      const destination = path.join(backup, file)
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.copyFileSync(path.join(root, file), destination, fs.constants.COPYFILE_EXCL)
    }
    save('backup', { backup, storage }); console.log(JSON.stringify({ backup, databasesVerified: Object.keys(storage) }))
  } else if (phase === 'verify') {
    const baseline = read('before'), storage = read('backup'), oldProd = baseline.processes.find(p => p.name === prod.name)
    const oldDev = baseline.processes.find(p => p.name === dev.name)
    if (prod.status !== 'online' || !prod.pid || prod.pid === oldProd.pid || dev.pid !== oldDev.pid || dev.restarts !== oldDev.restarts) throw Error('Unexpected process state')
    for (const [file, expected] of Object.entries(baseline.hashes)) if (hash(fs.readFileSync(path.join(root, file))) !== expected) throw Error('Source changed: ' + file)
    for (const [file, expected] of Object.entries(baseline.archives)) {
      const bytes = fs.readFileSync(path.join(root, file))
      if (hash(file.endsWith('activations.jsonl') ? bytes.subarray(0, expected.size) : bytes) !== expected.hash) throw Error('Archive changed: ' + file)
    }
    const after = {}
    for (const [file, original] of Object.entries(storage.storage)) {
      after[file] = await snapshot(path.join(root, file))
      if (after[file].schemaHash !== original.schemaHash) throw Error('Schema changed: ' + file)
    }
    const out = fs.readFileSync(prod.out).subarray(baseline.logs.out).toString('utf8')
    const addedErrorBytes = fs.statSync(prod.error).size - baseline.logs.error, live = arena()
    if (!out.includes('Ready! Logged in as') || addedErrorBytes !== 0) throw Error('Startup not clean yet')
    if (live.pid !== prod.pid || live.version !== baseline.arena.version || live.rulesetId !== baseline.arena.rulesetId) throw Error('Arena changed')
    const tableChanges = Object.fromEntries(Object.entries(after).map(([file, data]) => [file,
      Object.keys(data.tables).filter(table => JSON.stringify(data.tables[table]) !== JSON.stringify(storage.storage[file].tables[table]))]))
    save('activation', { processes: list, freshReady: true, addedErrorBytes, arena: live, after, tableChanges, developmentUnchanged: true })
    console.log(JSON.stringify({ production: prod.pid, freshReady: true, addedErrorBytes, developmentUnchanged: true, arena: live.version, ruleset: live.rulesetId, tableChanges }))
  } else throw Error('Use before, backup or verify')
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
