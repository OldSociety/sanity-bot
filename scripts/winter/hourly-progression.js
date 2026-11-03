const { sourceFiles: collectSources } = require('../../services/winter/studies/source-files');
// Offline simulation study. Only explicitly isolated SQLite paths are opened.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const M = require('../../services/winter/studies/early-progression');
const O = require('../../services/winter/studies/offline-checkpoints');
const prior = require('./early-progression');
const H = M.HOUR,
  DAY = 24 * H;
const scenarios = [
  {
    id: 'five-minute-control',
    visitMs: 5 * 60000,
    redFraction: 0,
    training: 'strength',
    control: true
  },
  { id: 'hourly-save', visitMs: H, redFraction: 0, training: 'strength' },
  { id: 'hourly-red-half', visitMs: H, redFraction: 0.5, training: 'strength' },
  { id: 'hourly-accuracy', visitMs: H, redFraction: 0.5, training: 'accuracy' },
  { id: '65-minute-red-half', visitMs: 65 * 60000, redFraction: 0.5, training: 'strength' },
  { id: 'daily-save', visitMs: DAY, redFraction: 0, training: 'strength' },
  { id: 'daily-red-half', visitMs: DAY, redFraction: 0.5, training: 'strength' },
  { id: 'three-day-red-half', visitMs: 3 * DAY, redFraction: 0.5, training: 'strength' },
  {
    id: 'daily-outage-red-half',
    visitMs: DAY,
    redFraction: 0.5,
    training: 'strength',
    recoverOnly: true
  }
];
async function run(
  seed,
  scenario,
  { storage = ':memory:', limit = M.config.durationDays * DAY } = {}
) {
  const store = await O.open(storage);
  const id = `${scenario.id}:${seed}`;
  let e,
    calendarEndAt = 0,
    visits = [],
    command = 0;
  const applyPolicy = (state, envelope) => {
    const creditedSinceVisit = envelope.creditedMs - (envelope.lastPolicyCreditedMs || 0);
    // Spending uses credited production, not snow from a discarded interval.
    prior.policy(state, { ...scenario, visitMs: creditedSinceVisit });
    envelope.lastPolicyCreditedMs = envelope.creditedMs;
  };
  try {
    await store.create(id, seed);
    e = await store.command(id, 0, `visit-${command++}`, { visitAt: 0 }, applyPolicy);
    let nextVisit = scenario.visitMs,
      previousDay = -1;
    while (calendarEndAt < limit && !e.state.coat) {
      const nextCapture = scenario.recoverOnly ? Infinity : e.nextCaptureAt;
      const at = Math.min(nextVisit, nextCapture, limit);
      if (at === nextVisit) {
        // A reconnect catches up before the returning command. Normal visits
        // also use the same serialized overdue-first path in store.command().
        if (scenario.recoverOnly) await store.recover(at);
        e = await store.command(id, at, `visit-${command++}`, { visitAt: at }, applyPolicy);
        nextVisit += scenario.visitMs;
      } else e = await store.capture(id, at);
      calendarEndAt = at;
      M.assertLedger(e.state);
      if (e.state.now !== e.creditedMs + e.discardedMs)
        throw Error('Credited/discarded accounting mismatch.');
      const day = Math.floor(at / DAY);
      if (day !== previousDay || e.state.coat || at === limit) {
        const s = e.state;
        visits.push({
          hours: at / H,
          processedThroughHours: s.now / H,
          creditedHours: e.creditedMs / H,
          discardedHours: e.discardedMs / H,
          strength: s.strength,
          accuracy: s.accuracy,
          sweat: s.sweat,
          snow: s.snow,
          red: s.red,
          ice: s.ice,
          target: s.target,
          buttons: s.buttons,
          wins: Object.values(s.tiers).map((t) => t.wins),
          losses: Object.values(s.tiers).map((t) => t.losses)
        });
        previousDay = day;
      }
    }
    return { seed, scenario: scenario.id, calendarEndAt, envelope: e, visits };
  } finally {
    await store.close();
  }
}
function p(values, fraction = 0.5) {
  return values.length
    ? [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)]
    : null;
}
function summarize(runs) {
  return scenarios.map((scenario) => {
    const subset = runs.filter((r) => r.scenario === scenario.id),
      milestones = {};
    for (const name of [
      'firstLoss',
      'strength25',
      'iron',
      'iceRecipe',
      'clearS1',
      'clearS2',
      'enteredS3',
      'firstButton',
      'coat'
    ]) {
      const times = subset
        .map((r) => r.envelope.state.milestones[name])
        .filter((t) => t !== undefined)
        .map((t) => t / H);
      milestones[name] = {
        reached: times.length,
        total: subset.length,
        p10Hours: p(times, 0.1),
        medianHours: p(times),
        p90Hours: p(times, 0.9)
      };
    }
    return {
      ...scenario,
      seeds: subset.length,
      milestones,
      medianCreditedHours: p(subset.map((r) => r.envelope.creditedMs / H)),
      medianDiscardedHours: p(subset.map((r) => r.envelope.discardedMs / H)),
      medianStrength: p(subset.map((r) => r.envelope.state.strength)),
      medianAccuracy: p(subset.map((r) => r.envelope.state.accuracy)),
      medianCombatSweat: p(subset.map((r) => r.envelope.state.ledger.combatSweat)),
      medianPassiveSweat: p(subset.map((r) => r.envelope.state.ledger.passiveSweat)),
      medianLosses: p(
        subset.map((r) =>
          Object.values(r.envelope.state.tiers).reduce((sum, t) => sum + t.losses, 0)
        )
      )
    };
  });
}
const modelFiles = collectSources([
  'config/winter/studies/early-progression.json',
  'config/winter/studies/offline-processing.json',
  'services/winter/studies/early-progression.js',
  'services/winter/studies/offline-checkpoints.js',
  'services/winter/studies/simulation-rng.js',
  'services/winter/studies/discovery-window.js',
  'scripts/winter/early-progression.js',
  'scripts/winter/hourly-progression.js'
]);
async function main() {
  const count = Number(process.argv[2] || 32);
  if (!Number.isSafeInteger(count) || count < 1 || count > 1000) throw Error('Use 1–1000 seeds.');
  const out = path.resolve(
    process.argv[3] || path.join(__dirname, '../../artifacts/winter-hourly-progression-2026-10-29')
  );
  if (fs.existsSync(out))
    throw Error(
      'Output directory already exists; preserve prior evidence and choose a new directory.'
    );
  fs.mkdirSync(out, { recursive: true });
  const manifest = {};
  for (const file of modelFiles) {
    const bytes = fs.readFileSync(path.resolve(__dirname, '../..', file));
    const target = path.join(out, 'model', file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    manifest[file] = crypto.createHash('sha256').update(bytes).digest('hex');
  }
  const runs = [];
  for (const scenario of scenarios) {
    const n = scenario.control ? 1 : count;
    for (let i = 0; i < n; i++) {
      runs.push(
        await run(271828 + i, scenario, {
          storage: i === 0 ? path.join(out, `${scenario.id}.winter-sim.sqlite`) : ':memory:'
        })
      );
    }
    process.stdout.write(`Completed ${scenario.id}: ${n} seeds\n`);
  }
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(runs, null, 2) + '\n');
  const summary = summarize(runs);
  const saved = runs.find((r) => r.scenario === 'hourly-red-half');
  const comparison = {
    scenario: saved.scenario,
    seed: saved.seed,
    atHours: saved.calendarEndAt / H,
    strength: saved.envelope.state.strength,
    rows: prior.farmingComparison(saved.envelope.state)
  };
  fs.writeFileSync(
    path.join(out, 'summary.json'),
    JSON.stringify({ config: M.config, processing: O.processing, summary, comparison }, null, 2) +
      '\n'
  );
  let exactReplays = 0;
  for (const scenario of scenarios) {
    for (const original of runs.filter((r) => r.scenario === scenario.id)) {
      const replay = await run(original.seed, scenario);
      if (JSON.stringify(replay) !== JSON.stringify(original))
        throw Error(`Replay mismatch: ${original.scenario}/${original.seed}`);
      exactReplays++;
    }
    process.stdout.write(`Replayed ${scenario.id}\n`);
  }
  const outages = runs.filter((r) => r.scenario === 'daily-outage-red-half');
  for (const outage of outages) {
    const normal = runs.find((r) => r.scenario === 'daily-red-half' && r.seed === outage.seed);
    if (
      JSON.stringify(outage.envelope.state) !== JSON.stringify(normal.envelope.state) ||
      JSON.stringify(outage.envelope.random) !== JSON.stringify(normal.envelope.random)
    )
      throw Error('Outage changed progress or RNG.');
  }
  fs.writeFileSync(
    path.join(out, 'verification.json'),
    JSON.stringify(
      {
        manifest,
        exactReplays,
        identicalOutagePairs: outages.length,
        ledgerChecks: 'Every capture and command; every snapshot and replay',
        durableSQLiteRepresentatives: scenarios.length,
        liveDatabaseOpened: false,
        runtimeActivated: false
      },
      null,
      2
    ) + '\n'
  );
  const fmt = (value) => (value === null ? 'not reached' : value.toFixed(2));
  const lines = [
    '# Winter Wars: hourly offline progression study',
    '',
    'Stone-start candidate, October 29, 2026. These runs implement the handoff’s hourly captures, at-most-four-hour recovery chunks and discard policy in isolated SQLite. They are not a runtime rollout or an optimal-strategy proof.',
    '',
    '|Visits / policy|Seeds|Iron median h|Ice recipe median h|S3 median h|Coat median h|Coat reached|',
    '|---|---:|---:|---:|---:|---:|---:|'
  ];
  for (const s of summary)
    lines.push(
      `|${s.id}|${s.seeds}|${fmt(s.milestones.iron.medianHours)}|${fmt(
        s.milestones.iceRecipe.medianHours
      )}|${fmt(s.milestones.enteredS3.medianHours)}|${fmt(s.milestones.coat.medianHours)}|${
        s.milestones.coat.reached
      }/${s.seeds}|`
    );
  lines.push(
    '',
    '## Processing interpretation',
    '',
    '- Each simulated visit counts as activity. Overdue complete inactive hours are recovered first; the unfinished tail is always discarded, before commands. Captures happen first on exact-hour ties.',
    '- Discarded time produces no gathering, combat, resources or RNG draws. HP/inventory stay unchanged and both remaining attack delays are shifted by the discarded duration. Captures do not shift timers or restart fights.',
    '- Player commands and captures serialize under SQLite BEGIN IMMEDIATE. Each recovery chunk commits rewards, RNG, simulation state and its journal checkpoint in one transaction. Receipts deduplicate command retries.',
    '- Hourly scheduling and reconnect-only catch-up use identical domain rules. Reconnect-only daily runs must match ordinary daily progress and saved RNG despite different chunk sizes.',
    '',
    '## Starting state and policies',
    '',
    'Every player starts with Stone, STR0, 50HP, zero snow/Sweat/diamonds/ammunition and S1 unlocked. Tutorial/Stone acquisition time is excluded. First Gym visit after a loss establishes STR1 and grants 5 Sweat for the two purchases to STR3. No developer grants, prestock, automatic purchases or crafting during absence.',
    '',
    'Training spends available Sweat on STR; the Accuracy variant starts after STR25 and chooses ACC while ACC < STR−25, otherwise STR. Iron retains STR25/material plus 1m snow. Ice recipe costs 10m snow. Prior to Iron, red-half spends at most half of credited Stone production, after a regular-ammunition reserve; after Iron savings prioritize the recipe. Once the recipe is owned, each visit crafts all affordable Ice above the reserve. This is finite visit-batch crafting, not a 2,000-Ice/day cap.',
    '',
    'Target policy farms S1 until Ice is owned, then S2 until 100 wins, then S3 until the 100-Button coat. Other target policies may perform differently. The study stops at coat or 31 elapsed days. Milestone medians are conditional on reaching the milestone; null means censored, not zero. First Button times record the actual simulated attack, while purchases occur on visits.',
    '',
    '## Findings and limits',
    '',
    'The five-minute control cannot earn any offline progress under this discard interpretation: every visit resets inactivity before the first capture. This does not model an additional active-play reward path. Hourly, 65-minute, daily and three-day visits isolate the effects of discarded tails and delayed upgrades.',
    '',
    'End-state farming comparisons use 12 independent one-hour samples per unlocked opponent with the same current stock/stats and no purchases. HP growth, losses, retries and ammunition shortages continue in those samples. Full per-tier histories and snow/Sweat/ammunition ledgers are in results.json; credited/discarded hours are recorded separately.',
    '',
    'Brown gates are verified as a persistence/one-discovery-per-window primitive in the checkpoint tests, using the provisional one-hour cooldown and distinct pieces. Brown generation/damage, map completion distributions, challengers, Golden, yellow, S5–S10, Dodge/Crit and Fire Flower/Slots are outside this early study. No claims are made about their balance.',
    '',
    'The passive curve, caps, tier stats, scaling and 100-win unlocks remain proposals. The roughly-24-hour Iron target must be assessed against these measured policy outcomes; values were not tuned to force it. Runtime, live DBs, command registration, PM2 and Arena are unchanged.'
  );
  fs.writeFileSync(path.join(out, 'analysis.md'), lines.join('\n') + '\n');
  process.stdout.write(
    JSON.stringify(
      summary.map((s) => ({
        scenario: s.id,
        ironHours: s.milestones.iron.medianHours,
        s3Hours: s.milestones.enteredS3.medianHours,
        coatHours: s.milestones.coat.medianHours,
        creditedHours: s.medianCreditedHours,
        discardedHours: s.medianDiscardedHours
      })),
      null,
      2
    ) + '\n'
  );
}
if (require.main === module)
  main().catch((error) => {
    process.stderr.write(error.stack + '\n');
    process.exitCode = 1;
  });
module.exports = { scenarios, run, summarize };
