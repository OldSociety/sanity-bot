// Stops the same unlimited-supply comparison at the first loss. Offline only.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const M = require('../../services/winter/studies/early-progression');
const R = require('../../services/winter/studies/simulation-rng');
const W = require('./weapon-comparison');
const C = M.config, DAY = 86400000;
function run(tier, weapon, seed) {
  const t = W.trial(tier, weapon, seed, { stopOnFirstLoss: true });
  const final = t.advance(C.durationDays * DAY);
  assert(final.losses <= 1);
  if (final.losses) {
    assert.equal(final.playerHp, 0);
    assert.equal(final.now, final.stoppedAt);
    assert.deepEqual(t.advance(C.durationDays * DAY), final);
  }
  return { tier, weapon, seed, final };
}
function native(tier, weapon, seed) {
  const s = M.fresh(), saved = R.initial(seed), draws = R.streams(saved);
  s.target = tier; s.enemyHp = s.enemyMaxHp = C.snowmen.find(r => r.tier === tier).hp;
  const supply = C.durationDays * DAY / C.playerIntervalMs + 1;
  s.snow = 2500000000;
  if (weapon === 'red') { s.equipped = 'red'; s.red = supply; }
  if (weapon === 'ice') { s.equipped = 'ice'; s.ice = supply; s.iceRecipe = true; }
  while (!s.tiers[tier].losses && s.now < C.durationDays * DAY) {
    M.settle(s, Math.min(s.nextPlayerAt, s.nextEnemyAt, C.durationDays * DAY), draws);
  }
  const row = s.tiers[tier];
  return { level: row.wins+1, wins: row.wins, losses: row.losses, now: s.now,
    shots: row.attacks, hits: row.hits, enemyAttacks: row.enemyAttacks, enemyHits: row.enemyHits, rng: saved.combat };
}
function quantile(values, p) { return [...values].sort((a, b) => a-b)[Math.floor((values.length-1)*p)]; }
function summarize(results, previous) {
  return C.snowmen.flatMap(row => W.weapons.map(weapon => {
    const samples = results.filter(r => r.tier === row.tier && r.weapon === weapon.id);
    const mean = key => samples.reduce((sum, r) => sum + r.final[key], 0) / samples.length;
    const paired = samples.slice(0, 64);
    const old = previous.summary.find(r => r.tier === row.tier && r.weapon === weapon.id);
    return { tier: row.tier, weapon: weapon.id, name: weapon.name, color: weapon.color, seeds: samples.length,
      meanLevel: mean('level'), medianLevel: quantile(samples.map(r => r.final.level), .5),
      p10Level: quantile(samples.map(r => r.final.level), .1), p90Level: quantile(samples.map(r => r.final.level), .9),
      meanMinutesToDefeat: mean('now')/60000, medianMinutesToDefeat: quantile(samples.map(r => r.final.now/60000), .5),
      p10MinutesToDefeat: quantile(samples.map(r => r.final.now/60000), .1), p90MinutesToDefeat: quantile(samples.map(r => r.final.now/60000), .9),
      meanHpLost: mean('hpLost'), meanDamageDealt: mean('usefulDamageOut'), meanCombatSweat: mean('combatSweat'),
      unlockNextFraction: samples.filter(r => r.final.wins >= 100).length/samples.length,
      censoredAt31Days: samples.filter(r => r.final.stoppedAt === null).length,
      paired64MeanLevel: paired.reduce((sum, r) => sum+r.final.level, 0)/paired.length,
      continuous31DayMeanLevel: old.meanLevel, continuous31DayMeanHpLost: old.meanHpLost };
  }));
}
function main() {
  const count = Number(process.argv[2] || 4096);
  if (!Number.isInteger(count) || count < 64 || count > 100000) throw Error('Use 64–100000 seeds.');
  const out = path.resolve(process.argv[3] || path.join(__dirname, '../../artifacts/winter-first-defeat-2026-10-29'));
  if (fs.existsSync(out)) throw Error('Preserve earlier reports; choose a new output directory.');
  fs.mkdirSync(out, { recursive: true });
  const sourceFiles = ['config/winter/studies/early-progression.json', 'services/winter/studies/early-progression.js',
    'services/winter/studies/simulation-rng.js', 'scripts/winter/weapon-comparison.js', 'scripts/winter/first-defeat-comparison.js'];
  const manifest = {};
  for (const file of sourceFiles) {
    const bytes = fs.readFileSync(path.resolve(__dirname, '../..', file)), dest = path.join(out, 'model', file);
    fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, bytes);
    manifest[file] = crypto.createHash('sha256').update(bytes).digest('hex');
  }
  const previousFile = path.resolve(__dirname, '../../artifacts/winter-weapon-comparison-2026-10-29/summary.json');
  const previous = JSON.parse(fs.readFileSync(previousFile));
  fs.copyFileSync(previousFile, path.join(out, 'continuous-reference.json'));
  const results = [];
  let replays = 0, nativeMatches = 0;
  for (const row of C.snowmen) for (const weapon of W.weapons) {
    for (let i = 0; i < count; i++) {
      const result = run(row.tier, weapon.id, 271828+i); results.push(result);
      if (i < 64) { assert.deepEqual(run(row.tier, weapon.id, result.seed), result); replays++; }
      if (i < 32) {
        const expected = native(row.tier, weapon.id, result.seed);
        for (const [key, value] of Object.entries(expected)) assert.equal(result.final[key], value, `Native mismatch: ${row.tier}/${weapon.id}/${key}`);
        nativeMatches++;
      }
    }
    process.stdout.write(`Completed S${row.tier}/${weapon.name}: ${count} first-defeat histories\n`);
  }
  const summary = summarize(results, previous);
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results)+'\n');
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ config: C, player: previous.player, weapons: W.weapons, summary }, null, 2)+'\n');
  fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify({ manifest, histories: results.length, exactReplays: replays,
    nativeFirstDefeatMatches: nativeMatches, noBalanceChange: true, noRuntimeChange: true }, null, 2)+'\n');
  process.stdout.write(JSON.stringify(summary.map(s => ({ tier: s.tier, weapon: s.name,
    firstDefeatLevel: s.meanLevel, continuousLevel: s.continuous31DayMeanLevel, minutes: s.meanMinutesToDefeat,
    unlockChance: s.unlockNextFraction })), null, 2)+'\n');
}
if (require.main === module) main();
module.exports = { run, native, summarize };
