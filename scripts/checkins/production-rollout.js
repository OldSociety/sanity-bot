// Explicit human-authorized production cutover. Never sends Discord messages.
const fs = require('node:fs')
const path = require('node:path')
const cp = require('node:child_process')
const { createHash } = require('node:crypto')
const { snapshot } = require('./development-rollout')
const root = path.resolve(__dirname, '../..')
const maintenanceFlag = process.argv[3]
const maintenance = ['--reminder-backup','--owner-access'].includes(maintenanceFlag)
const directory = path.join(root, maintenanceFlag === '--owner-access' ? 'artifacts/checkins-owner-access-2026-10-25/production'
  : maintenance ? 'artifacts/checkins-reminder-backup-2026-10-25/production' : 'artifacts/checkins-reminders-2026-10-25/production')
const configFile = path.join(root, 'config/checkins/checkins.json')
const hash = value => createHash('sha256').update(value).digest('hex')
const save = (name, value) => fs.writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2) + '\n')
const read = name => JSON.parse(fs.readFileSync(path.join(directory, name)))
function filesUnder(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? filesUnder(path.join(folder, entry.name)) : [path.join(folder, entry.name)])
}
function processes() {
  return JSON.parse(cp.execFileSync('pm2.cmd', ['jlist'], { shell: true, encoding: 'utf8' })).map(p => ({ name: p.name, pid: p.pid,
    status: p.pm2_env.status, restarts: p.pm2_env.restart_time, cwd: p.pm2_env.pm_cwd, error: p.pm2_env.pm_err_log_path, out: p.pm2_env.pm_out_log_path }))
}
async function preserveRows(beforeFile, afterFile) {
  const sqlite = require('sqlite3')
  const connect = file => new Promise((resolve, reject) => { const db = new sqlite.Database(file, sqlite.OPEN_READONLY, error => error ? reject(error) : resolve(db)) })
  const all = (db, sql) => new Promise((resolve, reject) => db.all(sql, (error, rows) => error ? reject(error) : resolve(rows)))
  const close = db => new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()))
  const before = await connect(beforeFile), after = await connect(afterFile)
  const summary = {}
  try {
    for (const table of await all(before, "SELECT name FROM sqlite_master WHERE type='table'")) {
      const query = `SELECT * FROM "${table.name.replaceAll('"','""')}"`
      const original = await all(before, query), current = await all(after, query)
      const counts = new Map()
      for (const row of current) { const key = hash(JSON.stringify(row)); counts.set(key, (counts.get(key) || 0) + 1) }
      let missing = 0
      for (const row of original) { const key = hash(JSON.stringify(row)), n = counts.get(key) || 0; if (n) counts.set(key, n - 1); else missing++ }
      summary[table.name] = { before: original.length, after: current.length, priorRowsMissingOrChanged: missing }
      if (table.name === 'SanityAccount') {
        const withoutName = row => { const copy = { ...row }; delete copy.displayName; return hash(JSON.stringify(copy)) }
        const stable = new Map()
        for (const row of current) { const key = withoutName(row); stable.set(key, (stable.get(key) || 0) + 1) }
        let otherChanges = 0
        for (const row of original) { const key = withoutName(row), n = stable.get(key) || 0; if (n) stable.set(key,n-1); else otherChanges++ }
        summary[table.name].nonDisplayNameRowsMissingOrChanged = otherChanges
      }
    }
  } finally { await close(before); await close(after) }
  return summary
}
async function main() {
  if (process.env.NODE_ENV !== 'production') throw Error('Explicit production environment required.')
  fs.mkdirSync(directory, { recursive: true })
  const list = processes(), prod = list.find(p => p.name === 'SB-production'), dev = list.find(p => p.name === 'SB-development')
  if (!prod || !dev || prod.cwd !== root || dev.cwd !== root) throw Error('Unexpected process target.')
  const phase = process.argv[2]
  if (phase === 'before') {
    const config = JSON.parse(fs.readFileSync(configFile))
    if (maintenance ? !config.production.liveEnabled || !config.production.scheduledEnabled
      : config.production.liveEnabled || config.production.scheduledEnabled) throw Error('Unexpected production activation state.')
    const candidates = Object.fromEntries(['development','production'].map(env => [env,
      JSON.parse(cp.execFileSync(process.execPath, [path.join(root, 'scripts/arena/version.js'), env], { encoding: 'utf8' })).buildHash]))
    const activationFile = path.join(root, 'artifacts/arena-versions/activations.jsonl')
    const live = fs.readFileSync(activationFile, 'utf8').trim().split('\n').map(row => JSON.parse(row)).filter(row => row.environment === 'production').at(-1)
    if (live.pid !== prod.pid || live.buildHash !== candidates.production) throw Error('Production Arena differs from the live build; no unrelated promotion is allowed.')
    const arenaFiles = Object.keys(JSON.parse(fs.readFileSync(path.join(root, `artifacts/arena-versions/build-${live.build}.json`))).sources)
    const sourceFiles = [...new Set(['app.js','Events/InteractionCreate.js','commands/CheckIn/CheckIn.js','commands/CheckIn/CheckInTest.js',
      'services/command-channels.js','config/commands/channel-policy.json',
      ...filesUnder(path.join(root,'services/checkins')).map(f => path.relative(root,f)), ...arenaFiles])]
    const hashes = Object.fromEntries(sourceFiles.map(file => [file, hash(fs.readFileSync(path.join(root,file)))]))
    const archives = Object.fromEntries(filesUnder(path.join(root,'artifacts/arena-versions')).map(file => [path.relative(root,file), { hash: hash(fs.readFileSync(file)), size: fs.statSync(file).size }]))
    const logs = Object.fromEntries(list.map(p => [p.name, { out: fs.statSync(p.out).size, error: fs.statSync(p.error).size }]))
    save('process-before.json', { processes: list, candidates, hashes, archives, logs, config, configHash: hash(fs.readFileSync(configFile)), arena: live, maintenance })
    console.log(JSON.stringify({ processes: list.map(({name,pid,status}) => ({name,pid,status})), arena: live.version, ruleset: live.rulesetId, candidateFiles: sourceFiles.length, protectedArchives: Object.keys(archives).length }))
  } else if (phase === 'backup') {
    if (prod.status !== 'stopped' || prod.pid) throw Error('Stop production before taking its backup.')
    const baseline = read('process-before.json')
    if (hash(fs.readFileSync(configFile)) !== baseline.configHash) throw Error('Configuration changed before backup.')
    const file = path.join(root,'config/prod.sqlite'), before = await snapshot(file)
    const backup = path.join(root, 'config/backups', `checkins-production-${Date.now()}-stopped`)
    fs.mkdirSync(backup)
    for (const suffix of ['','-wal','-shm','-journal']) if (fs.existsSync(file + suffix)) fs.copyFileSync(file + suffix, path.join(backup,'prod.sqlite' + suffix), fs.constants.COPYFILE_EXCL)
    if (JSON.stringify(before) !== JSON.stringify(await snapshot(path.join(backup,'prod.sqlite')))) throw Error('Production backup does not match.')
    for (const file of [...Object.keys(baseline.hashes),...Object.keys(baseline.archives),'config/checkins/checkins.json']) {
      const destination = path.join(backup,file)
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.copyFileSync(path.join(root,file),destination,fs.constants.COPYFILE_EXCL)
    }
    const state = path.join(root,'config/checkins/state/checkins-production.sqlite')
    let featureBefore = null
    if (fs.existsSync(state)) {
      featureBefore = await snapshot(state)
      fs.mkdirSync(path.join(backup,'checkins'))
      for (const suffix of ['','-wal','-shm','-journal']) if (fs.existsSync(state + suffix)) fs.copyFileSync(state + suffix,path.join(backup,'checkins/checkins-production.sqlite' + suffix),fs.constants.COPYFILE_EXCL)
      if (JSON.stringify(featureBefore) !== JSON.stringify(await snapshot(path.join(backup,'checkins/checkins-production.sqlite')))) throw Error('Feature backup does not match.')
    }
    save('storage-before.json', { before, backup, featureBefore })
    console.log(JSON.stringify({ backup, tables: Object.keys(before.tables).length, integrity: before.integrity, backupVerified: true }))
  } else if (phase === 'activate') {
    if (prod.status !== 'stopped' || prod.pid) throw Error('Production must be stopped for activation.')
    const baseline = read('process-before.json'), storage = read('storage-before.json'), plan = read('registry-plan.json')
    if (!storage.backup || hash(fs.readFileSync(configFile)) !== baseline.configHash) throw Error('Stopped backup/configuration baseline mismatch.')
    const desired = structuredClone(baseline.config)
    desired.production.liveEnabled = true; desired.production.scheduledEnabled = true
    if (JSON.stringify(desired) !== JSON.stringify(plan.desiredConfig)) throw Error('Configuration does not match the reviewed registry plan.')
    fs.writeFileSync(configFile + '.tmp', JSON.stringify(desired,null,2) + '\n', { flag: 'wx' })
    fs.renameSync(configFile + '.tmp',configFile)
    save('configuration-activation.json', { productionEnabled: true, scheduledEnabled: true, legacyReminderReplaced: true, config: desired })
    console.log('Enabled production check-ins and their scheduler from the reviewed configuration; no messages sent.')
  } else if (phase === 'verify') {
    const baseline = read('process-before.json'), storage = read('storage-before.json')
    const oldDev = baseline.processes.find(p => p.name === 'SB-development'), oldProd = baseline.processes.find(p => p.name === 'SB-production')
    if (dev.pid !== oldDev.pid || dev.restarts !== oldDev.restarts || dev.status !== 'online') throw Error('Development process changed.')
    if (prod.status !== 'online' || !prod.pid || prod.pid === oldProd.pid) throw Error('Production did not restart.')
    for (const [file,expected] of Object.entries(baseline.hashes)) if (hash(fs.readFileSync(path.join(root,file))) !== expected) throw Error(`Candidate source changed: ${file}`)
    for (const [file,expected] of Object.entries(baseline.archives)) {
      const bytes = fs.readFileSync(path.join(root,file))
      if (hash(file.endsWith('activations.jsonl') ? bytes.subarray(0,expected.size) : bytes) !== expected.hash) throw Error(`Prior version archive changed: ${file}`)
    }
    const after = await snapshot(path.join(root,'config/prod.sqlite'))
    if (after.schemaHash !== storage.before.schemaHash) throw Error('Main production database schema changed.')
    const preservation = await preserveRows(path.join(storage.backup,'prod.sqlite'),path.join(root,'config/prod.sqlite'))
    save('row-preservation.json',preservation)
    const changedPriorRows = Object.entries(preservation).filter(([,result]) => result.priorRowsMissingOrChanged)
    const identityEvidenceFile = path.join(directory,'sanity-startup-diff.json')
    const reviewedIdentity = fs.existsSync(identityEvidenceFile) ? JSON.parse(fs.readFileSync(identityEvidenceFile)) : null
    const reviewedNames = reviewedIdentity?.changes?.every(row => !row.missing && row.changes.every(change => change.field === 'displayName'))
    const unexplainedChanges = changedPriorRows.filter(([name,result]) => !(name === 'SanityAccount' && reviewedNames &&
      result.nonDisplayNameRowsMissingOrChanged === 0 && result.priorRowsMissingOrChanged === reviewedIdentity.changes.length))
    const feature = await snapshot(path.join(root,'config/checkins/state/checkins-production.sqlite'))
    const out = fs.readFileSync(prod.out).subarray(baseline.logs[prod.name].out).toString('utf8')
    const errorBytes = fs.statSync(prod.error).size - baseline.logs[prod.name].error
    if (!out.includes('Ready! Logged in as') || errorBytes !== 0) throw Error('Production startup is not clean; inspect logs.')
    const latest = fs.readFileSync(path.join(root,'artifacts/arena-versions/activations.jsonl'),'utf8').trim().split('\n').map(row=>JSON.parse(row)).filter(row=>row.environment==='production').at(-1)
    if (latest.pid !== prod.pid || latest.version !== baseline.arena.version || latest.rulesetId !== baseline.arena.rulesetId) throw Error('Arena version changed unexpectedly.')
    save('activation.json', { processes: list, after, preservation, changedPriorRows, unexplainedChanges,
      reviewedIdentityRefreshes: reviewedNames ? reviewedIdentity.changes.length : 0,
      feature, freshReady: true, addedErrorBytes: errorBytes, developmentUnchanged: true, arena: latest, legacySchedulerReplaced: true })
    console.log(JSON.stringify({ production: prod.pid, development: dev.pid, freshReady: true, addedErrorBytes: errorBytes,
      schemaUnchanged: true, changedPriorRows: changedPriorRows.map(([name,result])=>({name,...result})), featureCounts: Object.fromEntries(Object.entries(feature.tables).map(([name,result])=>[name,result.count])), arena: latest.version, ruleset: latest.rulesetId }))
    if (unexplainedChanges.length) throw Error('Unexplained prior database rows changed; inspect the saved preservation evidence.')
  } else throw Error('Use before, backup, activate or verify.')
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1 })
