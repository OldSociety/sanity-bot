const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
function fixedTrial(row, level, damage, config, seed) {
  const k = level - 1, q = Math.floor(k / 100), r = k % 100;
  const enemyMax = row.hp + (q ? 100 + 500*q*(q-1) + 10*q*r : k);
  const enemyDamage = row.damage + Math.floor(k / 25), playerMax = config.playerHp;
  let enemyHp = enemyMax, playerHp = playerMax, nextP = 3000, nextE = 10000;
  let wins = 0, losses = 0, damageOut = 0, hpLost = 0, x = seed >>> 0;
  function random() { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }
  const until = 31 * 86400000;
  while (Math.min(nextP, nextE) <= until) {
    const at = Math.min(nextP, nextE);
    if (nextP <= nextE) {
      nextP += 3000;
      if (random() < config.playerAccuracy) {
        damageOut += Math.min(enemyHp, damage); enemyHp = Math.max(0, enemyHp - damage);
        if (!enemyHp) { wins++; enemyHp = enemyMax; playerHp = playerMax; nextE = at + 10000; }
      }
    } else {
      nextE += 10000;
      if (random() < config.enemyAccuracy) {
        hpLost += Math.min(playerHp, enemyDamage); playerHp = Math.max(0, playerHp - enemyDamage);
        if (!playerHp) { losses++; enemyHp = enemyMax; playerHp = playerMax; nextE = at + 10000; }
      }
    }
  }
  return { wins, losses, damageOutPerMinute: damageOut/(31*1440), hpLostPerMinute: hpLost/(31*1440) };
}
function main() {
  const out = path.resolve(process.argv[2] || path.join(__dirname, '../../artifacts/winter-weapon-comparison-2026-10-29'));
  const verification = JSON.parse(fs.readFileSync(path.join(out, 'verification.json')));
  for (const [file, expected] of Object.entries(verification.hashes)) {
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(out, 'model', file))).digest('hex'), expected);
  }
  const model = require(path.join(out, 'model/scripts/winter/weapon-comparison.js'));
  const summary = JSON.parse(fs.readFileSync(path.join(out, 'summary.json')));
  const results = JSON.parse(fs.readFileSync(path.join(out, 'results.json')));
  let replays = 0;
  for (const group of summary.summary) {
    for (const expected of results.filter(r => r.tier === group.tier && r.weapon === group.weapon).slice(0, 3)) {
      assert.deepEqual(model.run(expected.tier, expected.weapon, expected.seed), expected); replays++;
    }
  }
  const rates = JSON.parse(fs.readFileSync(path.join(out, 'analytic-rates.json')));
  const selected = [[1, 1], [1, 26], [1, 51], [1, 101], [1, 151], [1, 201], [2, 1], [2, 126], [3, 76], [4, 1], [4, 126], [4, 250]];
  const checks = [];
  for (const [tier, level] of selected) for (const weapon of summary.weapons) {
    const expected = rates.find(r => r.tier === tier && r.level === level && r.weapon === weapon.id);
    const observed = fixedTrial(summary.config.snowmen.find(r => r.tier === tier), level, weapon.damage, summary.config, 314159);
    const n = observed.wins + observed.losses, p = expected.win_probability;
    const tolerance = 6*Math.sqrt(p*(1-p)/n) + 6/n;
    assert(Math.abs(observed.wins/n-p) <= tolerance, `Win-rate model mismatch S${tier}/L${level}/${weapon.id}`);
    assert(Math.abs(observed.damageOutPerMinute-expected.hp_dealt_per_minute) <= Math.max(.4, .015*expected.hp_dealt_per_minute));
    assert(Math.abs(observed.hpLostPerMinute-expected.hp_lost_per_minute) <= Math.max(.4, .015*expected.hp_lost_per_minute));
    checks.push({ tier, level, weapon: weapon.id, expected, observed });
  }
  fs.writeFileSync(path.join(out, 'independent-verification.json'), JSON.stringify({ freshProcessReplays: replays,
    analyticVsStochasticChecks: checks.length, checks, tolerance: 'Win fraction: 6 SE plus 6/N; damage rates: max(0.4 HP/min, 1.5%); month-long independent histories' }, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ freshProcessReplays: replays, analyticVsStochasticChecks: checks.length }) + '\n');
}
if (require.main === module) main();
