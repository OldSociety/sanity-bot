const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..'), directory = path.join(root, 'artifacts/winter-regular-only-month-2026-10-30');
const original = JSON.parse(fs.readFileSync(path.join(directory, 'results.json')));
for (const [file, expected] of Object.entries(original.hashes)) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex'), expected);
const checks = [];
for (const id of ['instant', 'hourly', 'four', 'daily', 'four-coats']) {
  const rows = original.results.filter(r => r.policy === id);
  for (const sample of [rows[0], rows.at(-1)]) {
    const source = `const M=require('./scripts/winter/regular-only-month');const p=M.policies.find(x=>x.id===${JSON.stringify(id)});process.stdout.write(M.run(${sample.seed},p).finalHash);`;
    const actual = cp.execFileSync(process.execPath, ['-e', source], { cwd: root, encoding: 'utf8' });
    assert.equal(actual, sample.finalHash); checks.push({ policy: id, seed: sample.seed, exact: true });
  }
}
const result = { histories: original.results.length, frozenInputsUnchanged: true, freshProcessReplays: checks.length, checks };
fs.writeFileSync(path.join(directory, 'verification.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ histories: result.histories, frozenInputsUnchanged: true, freshProcessReplays: checks.length }));
