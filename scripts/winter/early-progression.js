// Offline only. Uses the candidate domain engine, never the bot or live storage.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const M = require('../../services/winter/early-progression');
const C = M.config, HOUR = M.HOUR, DAY = 24 * HOUR;
function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
function streams(seed) { return { combat: rng(seed), buttons: rng((seed ^ 0x9e3779b9) >>> 0) }; }
const scenarios = [
  { id: 'frequent-save', visitMs: 5 * 60000, redFraction: 0, training: 'strength' },
  { id: 'frequent-red-half', visitMs: 5 * 60000, redFraction: 0.5, training: 'strength' },
  { id: 'frequent-accuracy', visitMs: 5 * 60000, redFraction: 0.5, training: 'accuracy' },
  { id: 'daily-save', visitMs: DAY, redFraction: 0, training: 'strength' },
  { id: 'daily-red-half', visitMs: DAY, redFraction: 0.5, training: 'strength' },
  { id: 'three-day-red-half', visitMs: 3 * DAY, redFraction: 0.5, training: 'strength' },
];
function policy(s, scenario) {
  M.purchase(s, 'visit');
  while (s.strength < C.statCap || scenario.training === 'accuracy' && s.accuracy < C.statCap) {
    const skill = scenario.training === 'accuracy' && s.strength >= 25 && s.accuracy < s.strength - 25 ? 'accuracy' : 'strength';
    if (!M.purchase(s, skill)) break;
  }
  M.purchase(s, 'lift');
  M.purchase(s, 'iron');
  if (s.iron) M.purchase(s, 'ice-recipe');
  // Pre-Iron red policy spends at most half of fresh Stone production each
  // visit, after reserving enough regular ammunition until the next visit.
  // After Iron all savings go to the recipe; no automatic crafting in absence.
  const regularReserve = Math.ceil(scenario.visitMs / C.playerIntervalMs) * C.regularSnowCost;
  if (!s.iron && scenario.redFraction) {
    const budget = Math.min(Math.max(0, s.snow - regularReserve), scenario.visitMs / 1000 * C.stoneRate * scenario.redFraction);
    const quantity = Math.floor(budget / C.redSnowCost);
    if (quantity) M.purchase(s, 'red', quantity);
  }
  if (s.iceRecipe) {
    const affordable = Math.floor(Math.max(0, s.snow - regularReserve) / (C.iceDiamonds * C.diamondSnowCost));
    if (affordable) {
      M.purchase(s, 'diamonds', affordable * C.iceDiamonds);
      M.purchase(s, 'ice', affordable);
    }
  }
  M.equip(s, s.iceRecipe ? 'ice' : s.red ? 'red' : 'regular');
  // Explicit unlock-first policy, not an optimal farming claim. Keep farming
  // S1 for Sweat until Ice is owned; then attempt S2 continuously until S3.
  M.select(s, s.tiers[2].wins >= 100 ? 3 : s.iceRecipe && M.unlocked(s, 2) ? 2 : 1);
  M.purchase(s, 'coat');
}
function run(seed, scenario, limit = C.durationDays * DAY) {
  const s = M.fresh(), random = streams(seed), visits = [];
  policy(s, scenario);
  let previousDay = -1;
  for (let at = Math.min(scenario.visitMs, limit); ; at = Math.min(at + scenario.visitMs, limit)) {
    const result = M.settle(s, at, random);
    if (!result.complete) throw Error('Offline candidate exceeded event budget.');
    M.assertLedger(s);
    policy(s, scenario);
    M.assertLedger(s);
    const day = Math.floor(at / DAY);
    if (day !== previousDay || s.coat || at === limit) {
      visits.push({ hours: at / HOUR, strength: s.strength, accuracy: s.accuracy,
        sweat: s.sweat, snow: s.snow, red: s.red, ice: s.ice, target: s.target,
        wins: Object.values(s.tiers).map(t => t.wins), losses: Object.values(s.tiers).map(t => t.losses), buttons: s.buttons });
      previousDay = day;
    }
    if (s.coat || at === limit) break;
  }
  return { seed, scenario: scenario.id, state: s, visits };
}
function percentile(values, p) {
  return values.length ? [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)] : null;
}
function summarize(runs) {
  return scenarios.map(scenario => {
    const subset = runs.filter(r => r.scenario === scenario.id);
    const milestones = {};
    for (const name of ['firstLoss', 'strength25', 'iron', 'iceRecipe', 'clearS1', 'clearS2', 'enteredS3', 'firstButton', 'coat']) {
      const hours = subset.map(r => r.state.milestones[name]).filter(v => v !== undefined).map(v => v / HOUR);
      milestones[name] = { reached: hours.length, total: subset.length,
        p10Hours: percentile(hours, .1), medianHours: percentile(hours, .5), p90Hours: percentile(hours, .9) };
    }
    return { scenario: scenario.id, ...scenario, milestones,
      medianEndStrength: percentile(subset.map(r => r.state.strength), .5),
      medianEndSnow: percentile(subset.map(r => r.state.snow), .5),
      medianCombatSweat: percentile(subset.map(r => r.state.ledger.combatSweat), .5),
      medianPassiveSweat: percentile(subset.map(r => r.state.ledger.passiveSweat), .5),
      medianLosses: percentile(subset.map(r => Object.values(r.state.tiers).reduce((sum, t) => sum + t.losses, 0)), .5) };
  });
}
// Compare every unlocked target at the same saved milestone. Sampled forward
// histories include increasing enemy difficulty, retries and finite ammunition.
function farmingComparison(saved, seed = 314159) {
  const rows = [];
  for (const row of C.snowmen) {
    if (!M.unlocked(saved, row.tier)) continue;
    let wins = 0, losses = 0, attacks = 0, ammo = 0, snow = 0;
    const samples = 12;
    for (let i = 0; i < samples; i++) {
      const s = structuredClone(saved);
      M.select(s, row.tier);
      const before = structuredClone(s.tiers[row.tier]), beforeSnow = s.snow;
      M.settle(s, s.now + HOUR, streams(seed + i));
      M.assertLedger(s);
      const after = s.tiers[row.tier];
      wins += after.wins - before.wins;
      losses += after.losses - before.losses;
      attacks += after.attacks - before.attacks;
      ammo += after.ice + after.red - before.ice - before.red;
      snow += s.snow - beforeSnow;
    }
    rows.push({ tier: row.tier, winsPerHour: wins / samples, lossesPerHour: losses / samples,
      sweatPerHour: wins * row.sweat / samples, winFraction: wins + losses ? wins / (wins + losses) : null,
      attacksPerHour: attacks / samples, specialConsumedPerHour: ammo / samples,
      netSnowPerHour: snow / samples });
  }
  return rows;
}
function main() {
  const count = Number(process.argv[2] || 32);
  if (!Number.isSafeInteger(count) || count < 1 || count > 1000) throw Error('Seed count must be between 1 and 1000.');
  const out = path.resolve(__dirname, '../../artifacts/winter-early-progression-2026-10-29');
  if (fs.existsSync(path.join(out, 'results.json'))) throw Error('Report already exists; preserve it or choose a new output directory in the script.');
  const runs = [];
  for (const scenario of scenarios) {
    for (let i = 0; i < count; i++) runs.push(run(271828 + i, scenario));
    process.stdout.write(`Completed ${scenario.id}: ${count} seeds\n`);
  }
  const summary = summarize(runs);
  const files = ['config/winter/early-progression.json', 'services/winter/early-progression.js', 'scripts/winter/early-progression.js'];
  const hashes = Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '../..', file))).digest('hex')]));
  const replay = runs.every(r => {
    const result = run(r.seed, scenarios.find(s => s.id === r.scenario));
    if (JSON.stringify(result) !== JSON.stringify(r)) throw Error('Replay mismatch.');
    return true;
  });
  const representative = runs.find(r => r.scenario === 'frequent-red-half') || runs[0];
  const comparison = { scenario: representative.scenario, seed: representative.seed,
    atHours: representative.state.now / HOUR, strength: representative.state.strength,
    ammo: { red: representative.state.red, ice: representative.state.ice },
    rows: farmingComparison(representative.state) };
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(runs, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ config: C, seedsPerScenario: count, summary, comparison }, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify({ hashes, exactReplays: replay ? runs.length : 0,
    ledgerChecks: 'Every visit before and after purchases, every replay and farming sample',
    liveStorageOpened: false, runtimeImportsChanged: false }, null, 2) + '\n');
  const lines = ['# Winter early progression candidate', '',
    'All times start at Stone with zero snow, Sweat, diamonds, ammunition and STR. Tutorial and Stone acquisition time are excluded. First Gym visit after a loss establishes STR1 and grants 5 Sweat; training purchases of 2 and 3 Sweat reach STR3. No developer grants or prestock.', '',
    'Candidate rules only; runtime remains unchanged. No target timings were fitted. Passive curve, enemy stats/scaling, caps and unlocks remain provisional. No training/crafting/purchases during absence. Player events win timestamp ties. Defeats retry immediately without resetting the player attack grid.', '',
    '|Scenario|Iron median h|Ice recipe median h|S3 median h|Coat median h|Coat reached|',
    '|---|---:|---:|---:|---:|---:|'];
  const fmt = value => value === null ? '—' : value.toFixed(2);
  for (const s of summary) lines.push(`|${s.scenario}|${fmt(s.milestones.iron.medianHours)}|${fmt(s.milestones.iceRecipe.medianHours)}|${fmt(s.milestones.enteredS3.medianHours)}|${fmt(s.milestones.coat.medianHours)}|${s.milestones.coat.reached}/${count}|`);
  lines.push('', 'Medians describe only seeds reaching that milestone. Unreached milestones are censored at 31 days, not treated as zero. Finite Ice batches consume all affordable snow above a regular-ammunition reserve at each visit; this is deliberately different from a 2,000-Ice/day spending cap. Accuracy policy starts after STR25 and buys ACC while ACC < STR−25, otherwise STR. These are comparison policies, not optimal strategies.', '',
    'Unlock-first target policy farms S1 until Ice is owned, then S2 until 100 wins, then S3 until coat. End-state farming comparisons use 12 independent one-hour samples per unlocked target with the same current stats, stock and production and no purchases. They report sustained rewards rather than stopping on first defeat.', '',
    'This candidate excludes brown maps, yellow, Golden, challengers, Dodge/Crit and legacy Fire Flower/Slots. It does not verify SQLite exactly-once settlement or live UI. Pure settlement, timestamp, resource and replay checks are separate from future runtime integration.');
  fs.writeFileSync(path.join(out, 'analysis.md'), lines.join('\n') + '\n');
  process.stdout.write(JSON.stringify(summary.map(s => ({ scenario: s.scenario,
    iron: s.milestones.iron, s3: s.milestones.enteredS3, coat: s.milestones.coat })), null, 2) + '\n');
}
if (require.main === module) main();
module.exports = { rng, streams, scenarios, policy, run, summarize, farmingComparison };
