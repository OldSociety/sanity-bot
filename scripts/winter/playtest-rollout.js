// Explicit development-only activation evidence. Never opens production SQLite.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const { snapshot } = require('../checkins/development-rollout');
const root = path.resolve(__dirname, '../..');
const label = process.env.WINTER_ROLLOUT_LABEL || 'winter-live-chapter1-2026-10-29';
if (!/^winter-[a-z0-9-]+$/.test(label)) throw Error('Invalid Winter rollout evidence label.');
const directory = path.join(root, 'artifacts', label);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function files(folder) { return fs.existsSync(folder) ? fs.readdirSync(folder, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(folder, e.name)) : [path.join(folder, e.name)]) : []; }
function processes() {
  return JSON.parse(cp.execFileSync('pm2.cmd', ['jlist'], { shell: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })).map(p => ({
    name: p.name, pid: p.pid, status: p.pm2_env.status, restarts: p.pm2_env.restart_time, cwd: p.pm2_env.pm_cwd,
    out: p.pm2_env.pm_out_log_path, error: p.pm2_env.pm_err_log_path }));
}
const save = (name, value) => fs.writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2) + '\n');
const read = name => JSON.parse(fs.readFileSync(path.join(directory, name)));
async function auditStartup(backup) {
  const sqlite = require('sqlite3');
  const load = async file => {
    const db = new sqlite.Database(file, sqlite.OPEN_READONLY), result = {};
    const all = sql => new Promise((resolve, reject) => db.all(sql, (e, rows) => e ? reject(e) : resolve(rows)));
    try {
      await all('BEGIN');
      for (const table of ['SpookyLedger', 'SpookyOperations', 'SpookyNotifications', 'sqlite_sequence']) result[table] = await all(`SELECT * FROM ${table}`);
      await all('COMMIT'); return result;
    } finally { await new Promise((resolve, reject) => db.close(e => e ? reject(e) : resolve())); }
  };
  const before = await load(path.join(backup, 'dev.sqlite')), after = await load(path.join(root, 'config/dev.sqlite'));
  const keys = { SpookyLedger: 'id', SpookyOperations: 'operationId', SpookyNotifications: 'id', sqlite_sequence: 'name' }, added = {};
  for (const [table, key] of Object.entries(keys)) {
    const current = new Map(after[table].map(row => [row[key], row]));
    for (const row of before[table]) {
      const next = current.get(row[key]);
      if (!next) throw Error(`Startup deleted a prior ${table} row.`);
      if (table === 'sqlite_sequence' && ['SpookyLedger', 'SpookyNotifications'].includes(row.name)) {
        if (next.seq < row.seq) throw Error('Spooky sequence moved backwards.');
      } else if (JSON.stringify(row) !== JSON.stringify(next)) throw Error(`Startup changed a prior ${table} row.`);
    }
    const old = new Set(before[table].map(row => row[key])); added[table] = after[table].filter(row => !old.has(row[key]));
  }
  for (const row of added.SpookyOperations) if (row.actorId !== 'system' || !['event_maintenance', 'fate_reminder', 'community_spotlight', 'spotlight_plan'].includes(row.operationType)) throw Error('Unexpected startup operation.');
  for (const row of added.SpookyLedger) if (row.actorId !== 'system' || row.userId !== 'system' || row.delta !== 0 || !['fate_reminder', 'community_spotlight'].includes(row.operationType)) throw Error('Unexpected startup resource mutation.');
  const operations = new Set(added.SpookyOperations.map(row => row.operationId));
  for (const row of added.SpookyNotifications) if (!operations.has(row.operationId)) throw Error('Unexpected startup notification.');
  if (added.sqlite_sequence.length) throw Error('Unexpected sequence entry during startup.');
  return { priorRowsPreserved: true, playerResourcesUnchanged: true, added: Object.fromEntries(Object.entries(added).map(([k, rows]) => [k, rows.length])),
    note: `Normal existing Spooky startup maintenance/catch-up; ${added.SpookyNotifications.length} scheduled notification records appended. No Winter gameplay/test messages.` };
}
async function main() {
  if (process.env.NODE_ENV !== 'development') throw Error('Development environment required.');
  const list = processes(), dev = list.find(p => p.name === 'SB-development'), prod = list.find(p => p.name === 'SB-production');
  if (!dev || !prod || dev.cwd !== root || prod.cwd !== root) throw Error('Unexpected process target.');
  fs.mkdirSync(directory, { recursive: true });
  if (process.argv[2] === 'prepare') {
    if (dev.pid || dev.status !== 'stopped') throw Error('Development must be stopped before this backup.');
    if (fs.existsSync(path.join(directory, 'before.json'))) throw Error('Existing activation evidence must be preserved.');
    const candidate = JSON.parse(cp.execFileSync(process.execPath, ['scripts/arena/version.js', 'development'], { cwd: root, encoding: 'utf8' }));
    const activationFile = path.join(root, 'artifacts/arena-versions/activations.jsonl');
    const last = fs.readFileSync(activationFile, 'utf8').trim().split(/\r?\n/).map(x => JSON.parse(x)).filter(x => x.environment === 'development').at(-1);
    if (!last || candidate.buildHash !== last.buildHash || candidate.rulesHash !== last.rulesetHash) throw Error('Starting development would activate unrelated Arena changes.');
    const protectedFiles = ['app.js', ...['commands', 'Events', 'handlers', 'services', 'config/arena', 'config/commands', 'config/runtime', 'config/winter', 'artifacts/arena-versions'].flatMap(f => files(path.join(root, f)).map(p => path.relative(root, p)))];
    const hashes = Object.fromEntries(protectedFiles.map(file => [file, hash(fs.readFileSync(path.join(root, file)))]));
    const before = await snapshot(path.join(root, 'config/dev.sqlite'));
    const backup = path.join(root, `config/backups/winter-chapter1-${Date.now()}-stopped`); fs.mkdirSync(backup);
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      const original = path.join(root, 'config/dev.sqlite' + suffix);
      if (fs.existsSync(original)) fs.copyFileSync(original, path.join(backup, 'dev.sqlite' + suffix), fs.constants.COPYFILE_EXCL);
    }
    if (JSON.stringify(await snapshot(path.join(backup, 'dev.sqlite'))) !== JSON.stringify(before)) throw Error('Database backup mismatch.');
    for (const file of protectedFiles) {
      const destination = path.join(backup, file); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(path.join(root, file), destination, fs.constants.COPYFILE_EXCL);
    }
    save('before.json', { processes: list, hashes, before, backup, arena: candidate, activationBytes: fs.statSync(activationFile).size,
      logs: { out: fs.existsSync(dev.out) ? fs.statSync(dev.out).size : 0, error: fs.existsSync(dev.error) ? fs.statSync(dev.error).size : 0 } });
    console.log(JSON.stringify({ backup, integrity: before.integrity, tables: Object.keys(before.tables).length, protectedFiles: protectedFiles.length, arenaUnchanged: true }));
  } else if (process.argv[2] === 'schema') {
    if (dev.pid || dev.status !== 'stopped') throw Error('Initialize additive test tables while development is stopped.');
    const before = read('before.json');
    const { Sequelize } = require('sequelize');
    const db = new Sequelize({ dialect: 'sqlite', storage: path.join(root, 'config/dev.sqlite'), logging: false });
    try { await require('../../services/winter/playtest-store').createStore({ sequelize: db }).initialize(); } finally { await db.close(); }
    const after = await snapshot(path.join(root, 'config/dev.sqlite'));
    for (const [name, table] of Object.entries(before.before.tables)) if (JSON.stringify(after.tables[name]) !== JSON.stringify(table)) throw Error(`Prior table changed: ${name}`);
    save('schema.json', { after, addedTables: Object.keys(after.tables).filter(n => !before.before.tables[n]), priorTablesUnchanged: true });
    console.log(JSON.stringify({ addedTables: Object.keys(after.tables).filter(n => !before.before.tables[n]), integrity: after.integrity, priorTablesUnchanged: true }));
  } else if (process.argv[2] === 'verify') {
    const baseline = read('before.json'), original = baseline.processes.find(p => p.name === 'SB-production');
    if (prod.pid !== original.pid || prod.restarts !== original.restarts || prod.status !== original.status) throw Error('Production process changed.');
    if (!dev.pid || dev.status !== 'online') throw Error('Development is not online.');
    for (const [file, expected] of Object.entries(baseline.hashes)) {
      if (file.endsWith('activations.jsonl')) {
        if (hash(fs.readFileSync(path.join(root, file)).subarray(0, baseline.activationBytes)) !== expected) throw Error('Prior Arena activation history changed.');
      } else if (hash(fs.readFileSync(path.join(root, file))) !== expected) throw Error(`Protected source changed: ${file}`);
    }
    const out = fs.readFileSync(dev.out).subarray(baseline.logs.out).toString('utf8'), errors = fs.readFileSync(dev.error).subarray(baseline.logs.error).toString('utf8');
    const ready = out.includes('Ready! Logged in as Sanity Bot [DEV]');
    const after = await snapshot(path.join(root, 'config/dev.sqlite'));
    const changedTables = Object.keys(baseline.before.tables).filter(k => JSON.stringify(after.tables[k]) !== JSON.stringify(baseline.before.tables[k]));
    const startupAudit = await auditStartup(baseline.backup);
    const evidence = { development: { name: dev.name, pid: dev.pid, status: dev.status, restarts: dev.restarts }, production: { name: prod.name, pid: prod.pid, status: prod.status, restarts: prod.restarts },
      ready, addedErrorBytes: Buffer.byteLength(errors), errors, after, changedTables, startupAudit, productionUnchanged: true, sourceHashesMatch: true, backup: baseline.backup };
    save('activation.json', evidence);
    console.log(JSON.stringify({ ...evidence, after: undefined, errors: undefined }));
    if (!ready || errors.length || changedTables.some(n => !['SpookyLedger', 'SpookyOperations', 'SpookyNotifications', 'sqlite_sequence'].includes(n))) throw Error('Inspect startup evidence before claiming activation verified.');
  } else throw Error('Use prepare, schema or verify.');
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
