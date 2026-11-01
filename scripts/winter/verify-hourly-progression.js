// Run in a fresh Node process after the study. Replay frozen source copies and
// independently inspect the durable representative SQLite files read-only.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sqlite3 = require('sqlite3');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function readDatabase(file, expected) {
  const db = await new Promise((resolve, reject) => {
    const connection = new sqlite3.Database(file, sqlite3.OPEN_READONLY, error => error ? reject(error) : resolve(connection));
  });
  const all = sql => new Promise((resolve, reject) => db.all(sql, (error, rows) => error ? reject(error) : resolve(rows)));
  try {
    const integrity = await all('PRAGMA integrity_check');
    if (JSON.stringify(integrity) !== JSON.stringify([{ integrity_check: 'ok' }])) throw Error('SQLite integrity failure.');
    const foreignKeys = await all('PRAGMA foreign_key_check');
    if (foreignKeys.length) throw Error('SQLite FK failure.');
    const rows = await all('SELECT envelope FROM WinterSimPlayers');
    if (rows.length !== 1 || rows[0].envelope !== JSON.stringify(expected.envelope)) throw Error('Durable final checkpoint mismatch.');
    const journal = await all('SELECT * FROM WinterSimCheckpoints ORDER BY revision');
    let through = 0, credited = 0, discarded = 0, captures = 0;
    const ledger = {};
    for (let i = 0; i < journal.length; i++) {
      const row = journal[i], delta = JSON.parse(row.delta);
      if (row.revision !== i + 1 || row.fromAt !== through || row.throughAt < row.fromAt) throw Error('Checkpoint gap/overlap.');
      if (row.kind === 'capture') {
        if (row.throughAt - row.fromAt > 4 * 3600000 || delta.discardedMs !== 0 ||
          delta.creditedMs !== row.throughAt - row.fromAt) throw Error('Invalid capture chunk.');
        captures++;
      } else if (delta.creditedMs !== 0 || delta.discardedMs !== row.throughAt - row.fromAt) throw Error('Invalid command discard.');
      credited += delta.creditedMs; discarded += delta.discardedMs;
      for (const [key, value] of Object.entries(delta.ledger)) ledger[key] = (ledger[key] || 0) + value;
      through = row.throughAt;
    }
    if (credited !== expected.envelope.creditedMs || discarded !== expected.envelope.discardedMs ||
      JSON.stringify(ledger) !== JSON.stringify(expected.envelope.state.ledger)) throw Error('Checkpoint journal totals mismatch.');
    return { file: path.basename(file), integrity: 'ok', rows: journal.length, captures, credited, discarded };
  } finally { await new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve())); }
}
async function main() {
  const out = path.resolve(process.argv[2] || path.join(__dirname, '../../artifacts/winter-hourly-progression-2026-10-29'));
  const verification = JSON.parse(fs.readFileSync(path.join(out, 'verification.json')));
  for (const [file, expected] of Object.entries(verification.manifest)) {
    if (hash(fs.readFileSync(path.join(out, 'model', file))) !== expected) throw Error('Frozen source hash mismatch.');
  }
  const model = require(path.join(out, 'model/scripts/winter/hourly-progression.js'));
  const results = JSON.parse(fs.readFileSync(path.join(out, 'results.json')));
  const checks = [];
  for (const scenario of model.scenarios) {
    const expected = results.find(r => r.scenario === scenario.id);
    const replay = await model.run(expected.seed, scenario);
    if (JSON.stringify(replay) !== JSON.stringify(expected)) throw Error('Fresh-process replay mismatch.');
    checks.push(await readDatabase(path.join(out, `${scenario.id}.winter-sim.sqlite`), expected));
    process.stdout.write(`Verified ${scenario.id}\n`);
  }
  const report = { freshProcessReplays: checks.length, sqlite: checks,
    frozenSourcesVerified: Object.keys(verification.manifest).length,
    verifierHash: hash(fs.readFileSync(__filename)) };
  fs.writeFileSync(path.join(out, 'fresh-process-verification.json'), JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ freshProcessReplays: checks.length, sqliteIntegrity: 'all ok' }) + '\n');
}
if (require.main === module) main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
module.exports = { readDatabase };
