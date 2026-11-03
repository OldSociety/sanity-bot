const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sqlite3 = require('sqlite3');
const { readDatabase } = require('./verify-hourly-progression');
async function verifyLoad(file, modelRoot) {
  const M = require(fs.existsSync(path.join(modelRoot,'services/winter/studies/early-progression.js')) ? path.join(modelRoot,'services/winter/studies/early-progression.js') : path.join(modelRoot,'services/winter/early-progression.js'));
  const R = require(fs.existsSync(path.join(modelRoot,'services/winter/studies/simulation-rng.js')) ? path.join(modelRoot,'services/winter/studies/simulation-rng.js') : path.join(modelRoot,'services/winter/simulation-rng.js'));
  const db = await new Promise((resolve, reject) => {
    const c = new sqlite3.Database(file, sqlite3.OPEN_READONLY, error => error ? reject(error) : resolve(c));
  });
  const all = sql => new Promise((resolve, reject) => db.all(sql, (error, rows) => error ? reject(error) : resolve(rows)));
  try {
    if ((await all('PRAGMA integrity_check'))[0].integrity_check !== 'ok') throw Error('Load SQLite integrity failed.');
    const rows = await all('SELECT * FROM WinterSimPlayers ORDER BY id');
    if (rows.length !== 10) throw Error('Expected 10 durable load-test players.');
    for (const row of rows) {
      const e = JSON.parse(row.envelope), state = M.fresh(), random = R.initial(314159 + Number(row.id.slice(1)));
      M.settle(state, 31 * 24 * M.HOUR, R.streams(random));
      if (JSON.stringify(state) !== JSON.stringify(e.state) || JSON.stringify(random) !== JSON.stringify(e.random)) throw Error('Load-test catch-up/native mismatch.');
      if (e.discardedMs !== 0 || e.creditedMs !== 31 * 24 * M.HOUR) throw Error('Load-test lost time.');
    }
    return { players: rows.length, daysEach: 31, integrity: 'ok', exactNativeMatches: rows.length };
  } finally { await new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve())); }
}
async function main() {
  const out = path.resolve(process.argv[2] || path.join(__dirname, '../../artifacts/winter-return-progression-2026-10-29'));
  const verification = JSON.parse(fs.readFileSync(path.join(out, 'verification.json')));
  for (const [file, hash] of Object.entries(verification.manifest)) {
    if (crypto.createHash('sha256').update(fs.readFileSync(path.join(out, 'model', file))).digest('hex') !== hash) throw Error('Frozen source mismatch.');
  }
  const model = require(path.join(out, 'model/scripts/winter/return-progression.js'));
  const runs = JSON.parse(fs.readFileSync(path.join(out, 'results.json'))), checks = [];
  for (const scenario of model.scenarios) {
    const expected = runs.find(r => r.scenario === scenario.id);
    if (JSON.stringify(await model.run(expected.seed, scenario)) !== JSON.stringify(expected)) throw Error('Fresh-process replay mismatch.');
    checks.push(await readDatabase(path.join(out, `${scenario.id}.winter-sim.sqlite`), expected));
    process.stdout.write(`Verified ${scenario.id}\n`);
  }
  const load = await verifyLoad(path.join(out, 'load-10.winter-sim.sqlite'), path.join(out, 'model'));
  const result = { freshProcessReplays: checks.length, sqlite: checks, load,
    frozenSourcesVerified: Object.keys(verification.manifest).length };
  fs.writeFileSync(path.join(out, 'fresh-process-verification.json'), JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ freshProcessReplays: checks.length, loadNativeMatches: load.exactNativeMatches }) + '\n');
}
if (require.main === module) main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
