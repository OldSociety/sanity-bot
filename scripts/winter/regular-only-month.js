const { sourceFiles: collectSources } = require('../../services/winter/studies/source-files');
// Offline study only: no Discord, credentials, SQLite or live runtime changes.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const N = require('../../services/winter/studies/chapter-simulation');
const { passiveRate } = require('../../services/winter/studies/early-progression');
const H = 3600000,
  END = 31 * 24 * H;
const policies = [
  { id: 'instant', name: 'Automated ceiling', hours: 0, coats: false },
  { id: 'hourly', name: 'Hourly visits', hours: 1, coats: false },
  { id: 'four', name: 'Every 4 hours', hours: 4, coats: false },
  { id: 'daily', name: 'Daily visits', hours: 24, coats: false },
  { id: 'four-coats', name: 'Every 4 hours + HP coats', hours: 4, coats: true }
];
function setup(seed) {
  const c = structuredClone(N.defaults);
  c.emporium = c.emporium.slice(0, 2);
  const s = N.fresh(seed, c);
  s.equipped = 'regular';
  return { c, s };
}
function operate(s, c, policy) {
  s.penalized = false;
  while (s.strength < c.statCap && s.sweat >= s.strength + 1) N.train(s, 'strength', c);
  if (!s.iron && s.strength >= c.ironStrength && s.snow >= c.ironSnowCost) {
    s.snow -= c.ironSnowCost;
    s.ledger.ironSnow += c.ironSnowCost;
    s.iron = true;
    N.mark(s, 'iron');
  }
  // Equivalent to the actual STR25 lift then Iron purchase; the lift adds no delay/cost.
  if (policy.coats) N.emporium(s, c);
  for (const t of [2, 3, 4]) N.buyOpponent(s, t, c);
  const desired = s.owned[4] ? 4 : s.owned[3] ? 3 : s.owned[2] ? 2 : 1;
  N.select(s, desired, c);
  if (s.strength === c.statCap) N.mark(s, 'strength100');
}
function snapshot(s) {
  return {
    hour: s.now / H,
    strength: s.strength,
    sweat: s.sweat,
    snow: s.snow,
    buttons: s.buttons,
    target: s.target,
    maxHp: s.reinforced ? 150 : s.coat ? 100 : 50,
    wins: Object.values(s.tiers).map((r) => r.wins),
    losses: Object.values(s.tiers).map((r) => r.losses),
    combatSweat: s.ledger.combatSweat,
    passiveSweat: s.ledger.passiveSweat,
    stage: (s.target - 1) * 100 + Math.min(100, s.tiers[s.target].wins)
  };
}
function run(seed, policy, end = END) {
  const { c, s } = setup(seed),
    history = [snapshot(s)];
  let nextVisit = policy.hours ? policy.hours * H : Infinity,
    nextSample = H;
  while (s.now < end) {
    let at = Math.min(end, nextVisit, nextSample);
    if (!policy.hours) {
      // Exact event-time training and Throw refresh after every defeat. This
      // intentionally represents automation, not a reasonable human schedule.
      at = Math.min(at, s.nextPlayerAt, s.nextEnemyAt);
      const rate = passiveRate(s.strength, c);
      if (s.strength < c.statCap && rate > 0)
        at = Math.min(
          at,
          s.now + Math.max(1, Math.ceil(((s.strength + 1 - s.sweat) * H - s.sweatRemainder) / rate))
        );
    }
    N.settle(s, at, c);
    if (!policy.hours || at === nextVisit) {
      operate(s, c, policy);
      if (at === nextVisit) nextVisit += policy.hours * H;
    }
    if (at === nextSample || at === end) {
      N.validate(s, c);
      history.push(snapshot(s));
      if (at === nextSample) nextSample += H;
    }
  }
  N.validate(s, c);
  assert.equal(s.equipped, 'regular');
  assert.equal(s.accuracy, 0);
  assert.equal(s.iceRecipe, false);
  assert.equal(s.ledger.regularSnow, s.ledger.ammoSnow);
  for (const tier of Object.values(s.tiers)) {
    assert.equal(tier.red + tier.ice + tier.fire, 0);
    assert.equal(tier.regular, tier.attacks);
  }
  const total = (row) => row.wins.reduce((a, b) => a + b, 0);
  let wallHour = null,
    suffixLow = true;
  for (let i = history.length - 73; i >= 0; i--) {
    suffixLow &&= total(history[i + 72]) - total(history[i]) < 3;
    if (suffixLow) wallHour = history[i].hour;
  }
  const milestones = Object.fromEntries(
    Object.entries(s.milestones).map(([key, at]) => [key, at / H])
  );
  const lastWinHour = history.reduce(
    (last, row, i) => (i && total(row) > total(history[i - 1]) ? row.hour : last),
    null
  );
  return {
    seed,
    policy: policy.id,
    endHour: s.now / H,
    milestones,
    wallHour,
    lastWinHour,
    lastWeekWins: total(history.at(-1)) - total(history[Math.max(0, history.length - 169)]),
    summary: snapshot(s),
    tiers: s.tiers,
    ledger: s.ledger,
    history,
    finalHash: createHash('sha256').update(JSON.stringify(s)).digest('hex')
  };
}
function quantile(values, p) {
  const a = values.filter((v) => v !== null && v !== undefined).sort((a, b) => a - b);
  return a.length ? a[Math.floor((a.length - 1) * p)] : null;
}
function summarize(rows, policy) {
  const q = (selector) => ({
    p10: quantile(rows.map(selector), 0.1),
    median: quantile(rows.map(selector), 0.5),
    p90: quantile(rows.map(selector), 0.9)
  });
  return {
    ...policy,
    seeds: rows.length,
    strength: q((r) => r.summary.strength),
    target: q((r) => r.summary.target),
    wins: [0, 1, 2, 3].map((t) => q((r) => r.summary.wins[t])),
    lastWeekWins: q((r) => r.lastWeekWins),
    wallHour: q((r) => r.wallHour),
    wallRuns: rows.filter((r) => r.wallHour !== null).length,
    ironHour: q((r) => r.milestones.iron),
    s3Hour: q((r) => r.milestones.purchaseS3),
    s4Hour: q((r) => r.milestones.purchaseS4),
    capHour: q((r) => r.milestones.strength100),
    s3Runs: rows.filter((r) => r.milestones.purchaseS3 !== undefined).length,
    s4Runs: rows.filter((r) => r.milestones.purchaseS4 !== undefined).length,
    combatSweat: q((r) => r.ledger.combatSweat),
    passiveSweat: q((r) => r.ledger.passiveSweat),
    daily: Array.from({ length: 32 }, (_, day) => ({
      day,
      strength: q((r) => r.history[day * 24].strength),
      stage: q((r) => r.history[day * 24].stage),
      wins: [0, 1, 2, 3].map((t) => q((r) => r.history[day * 24].wins[t]))
    }))
  };
}
async function main() {
  const directory = path.resolve(__dirname, '../../artifacts/winter-regular-only-month-2026-10-30');
  fs.mkdirSync(directory, { recursive: true });
  const count = Number(process.env.WINTER_STUDY_SEEDS || 32),
    results = [],
    groups = [];
  assert(Number.isSafeInteger(count) && count > 0 && count <= 512);
  for (const policy of policies) {
    const rows = [];
    for (let i = 0; i < count; i++) rows.push(run(20261030 + i * 7919, policy));
    results.push(...rows);
    groups.push(summarize(rows, policy));
    process.stdout.write(`${policy.id}: ${count} completed\n`);
    await new Promise((resolve) => setImmediate(resolve));
  }
  const inputs = collectSources([
    'services/winter/studies/chapter-simulation.js',
    'services/winter/game/game.js',
    'services/winter/studies/early-progression.js',
    'config/winter/game/balance.json',
    'scripts/winter/regular-only-month.js'
  ]);
  const hashes = Object.fromEntries(
    inputs.map((f) => [
      f,
      createHash('sha256')
        .update(fs.readFileSync(path.resolve(__dirname, '../..', f)))
        .digest('hex')
    ])
  );
  fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify({ hashes, results }));
  const summary = {
    seedsPerPolicy: count,
    histories: results.length,
    durationDays: 31,
    assumptions: [
      'Post-Gym Stone/STR3, S1 owned, zero wallets; Chapter0 and Gym preparation time excluded.',
      'Passive Sweat on; cap100; Strength only. Shared pricing equals destination-level pricing when no other stat is trained.',
      'Regular ammunition funded from real snow production. Iron and opponent access may be purchased. No Accuracy, specialty ammo, Ice recipe, Fire or Golden purchases.',
      'Main cohorts remain50HP. Separate four-hour sensitivity may buy only100/150HP coats for10+200Buttons.',
      'Continuous retries. Defeat accuracy35% until Throw on visits; automated ceiling refreshes after every defeat.',
      'Chapter1 uses current development combat rules. S3/S4 are a design-only continuation; current live adapter ends on S3 purchase. S4 is immune to regulars.',
      'Push the highest purchased tier; not an optimal farming-target search. Auto training/refresh is an unattainable human automation ceiling.',
      'Observed effective wall: earliest hour whose every subsequent complete72h window has fewer than3 wins (<1/day), with at least72h remaining. It can include occasional lucky wins; no claim of permanent mathematical impossibility before S4.'
    ],
    hashes,
    groups
  };
  fs.writeFileSync(path.join(directory, 'summary.json'), JSON.stringify(summary, null, 2));
  process.stdout.write(
    JSON.stringify(
      groups.map((g) => ({
        policy: g.id,
        strength: g.strength,
        wins: g.wins,
        ironHour: g.ironHour,
        s3Hour: g.s3Hour,
        s4Hour: g.s4Hour,
        wallHour: g.wallHour,
        lastWeekWins: g.lastWeekWins,
        s3Runs: g.s3Runs,
        s4Runs: g.s4Runs
      })),
      null,
      2
    )
  );
}
if (require.main === module)
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
module.exports = { run, setup, operate, summarize, policies, H, END };
