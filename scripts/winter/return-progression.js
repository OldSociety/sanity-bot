// On-return candidate only. No bot, environment credentials or live DB imports.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const M = require('../../services/winter/early-progression');
const O = require('../../services/winter/offline-checkpoints');
const prior = require('./early-progression');
const settings = require('../../config/winter/return-simulation.json');
const H = M.HOUR, DAY = 24 * H;
const scenarios = [
  { id: 'five-minute-save', visitMs: 5 * 60000, redFraction: 0, training: 'strength' },
  { id: 'five-minute-red-half', visitMs: 5 * 60000, redFraction: .5, training: 'strength' },
  { id: 'five-minute-accuracy', visitMs: 5 * 60000, redFraction: .5, training: 'accuracy' },
  { id: 'hourly-save', visitMs: H, redFraction: 0, training: 'strength' },
  { id: 'hourly-red-half', visitMs: H, redFraction: .5, training: 'strength' },
  { id: 'hourly-accuracy', visitMs: H, redFraction: .5, training: 'accuracy' },
  { id: '65-minute-red-half', visitMs: 65 * 60000, redFraction: .5, training: 'strength' },
  { id: 'daily-save', visitMs: DAY, redFraction: 0, training: 'strength' },
  { id: 'daily-red-half', visitMs: DAY, redFraction: .5, training: 'strength' },
  { id: 'three-day-red-half', visitMs: 3 * DAY, redFraction: .5, training: 'strength' },
];
async function run(seed, scenario, { storage = ':memory:', limit = M.config.durationDays * DAY } = {}) {
  const metrics = {}, store = await O.open(storage, { settings, metrics });
  const id = `${scenario.id}:${seed}`, visits = [];
  let e, command = 0, previousDay = -1;
  const apply = (state, envelope) => {
    const elapsed = envelope.creditedMs - (envelope.lastPolicyCreditedMs || 0);
    prior.policy(state, { ...scenario, visitMs: elapsed });
    envelope.lastPolicyCreditedMs = envelope.creditedMs;
  };
  try {
    await store.create(id, seed);
    await store.command(id, 0, `v${command++}`, { at: 0 }, apply);
    for (let at = Math.min(scenario.visitMs, limit); ; at = Math.min(at + scenario.visitMs, limit)) {
      e = await store.command(id, at, `v${command++}`, { at }, apply);
      M.assertLedger(e.state);
      if (e.creditedMs !== at || e.discardedMs !== 0) throw Error('On-return time lost.');
      const day = Math.floor(at / DAY);
      if (day !== previousDay || e.state.coat || at === limit) {
        visits.push({ hours: at / H, strength: e.state.strength, accuracy: e.state.accuracy,
          snow: e.state.snow, sweat: e.state.sweat, buttons: e.state.buttons,
          target: e.state.target, wins: Object.values(e.state.tiers).map(t => t.wins),
          losses: Object.values(e.state.tiers).map(t => t.losses) });
        previousDay = day;
      }
      if (e.state.coat || at === limit) break;
    }
    return { scenario: scenario.id, seed, calendarEndAt: e.state.now, envelope: e, visits,
      work: { simulationCalls: metrics.simulationCalls, simulationEvents: metrics.simulationEvents, peakActive: metrics.peakActive } };
  } finally { await store.close(); }
}
function percentile(values, p = .5) {
  return values.length ? [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)] : null;
}
function summarize(runs) {
  return scenarios.map(scenario => {
    const rows = runs.filter(r => r.scenario === scenario.id), milestones = {};
    for (const name of ['firstLoss', 'strength25', 'iron', 'iceRecipe', 'clearS1', 'clearS2', 'enteredS3', 'firstButton', 'coat']) {
      const times = rows.map(r => r.envelope.state.milestones[name]).filter(t => t !== undefined).map(t => t / H);
      milestones[name] = { reached: times.length, total: rows.length, p10Hours: percentile(times, .1), medianHours: percentile(times), p90Hours: percentile(times, .9) };
    }
    return { ...scenario, seeds: rows.length, milestones,
      medianCombatSweat: percentile(rows.map(r => r.envelope.state.ledger.combatSweat)),
      medianPassiveSweat: percentile(rows.map(r => r.envelope.state.ledger.passiveSweat)),
      medianEndStrength: percentile(rows.map(r => r.envelope.state.strength)),
      medianSimulationCalls: percentile(rows.map(r => r.work.simulationCalls)),
      discardedMs: rows.reduce((sum, r) => sum + r.envelope.discardedMs, 0) };
  });
}
async function benchmark(players, storage = ':memory:') {
  const metrics = { measurePerformance: true }, store = await O.open(storage, { settings, metrics });
  const delay = monitorEventLoopDelay({ resolution: 10 });
  try {
    for (let i = 0; i < players; i++) await store.create(`p${i}`, 314159 + i);
    // Simulated restart at day 31: idle profiles stay at their saved state.
    await store.recover(31 * DAY);
    const absent = await store.read('p0');
    if (metrics.simulationCalls || absent.state.now !== 0) throw Error('Abandoned player was processed.');
    const idleSimulationCalls = metrics.simulationCalls;
    metrics.peakQueued = 0;
    const started = performance.now(), cpu = process.cpuUsage();
    delay.enable();
    const returns = await Promise.all(Array.from({ length: players }, async (_, i) => {
      const e = await store.command(`p${i}`, 31 * DAY, 'return', {});
      if (e.creditedMs !== 31 * DAY || e.discardedMs !== 0) throw Error('Long absence was capped.');
      M.assertLedger(e.state);
      return performance.now() - started;
    }));
    const elapsedMs = performance.now() - started, usage = process.cpuUsage(cpu);
    delay.disable();
    return { players, offlineDays: 31, storage: storage === ':memory:' ? 'SQLite memory' : 'SQLite WAL file',
      idleSimulationCalls, simulationCalls: metrics.simulationCalls, simulationEvents: metrics.simulationEvents,
      peakConcurrentOperations: metrics.peakActive, peakQueued: metrics.peakQueued,
      elapsedMs, cpuMs: (usage.user + usage.system) / 1000,
      medianReturnLatencyMs: percentile(returns), p90ReturnLatencyMs: percentile(returns, .9),
      lastReturnLatencyMs: Math.max(...returns), maxChunkComputeMs: metrics.maxChunkComputeMs,
      eventLoopDelayMaxMs: delay.max / 1e6,
      note: 'Local measurement, including serialized catch-up and SQLite work; not a production latency guarantee.' };
  } finally { delay.disable(); await store.close(); }
}
const sourceFiles = [
  'config/winter/early-progression.json', 'config/winter/offline-simulation.json', 'config/winter/return-simulation.json',
  'services/winter/early-progression.js', 'services/winter/offline-checkpoints.js', 'services/winter/simulation-rng.js',
  'scripts/winter/early-progression.js', 'scripts/winter/return-progression.js',
];
async function main() {
  const count = Number(process.argv[2] || 32);
  if (!Number.isSafeInteger(count) || count < 1 || count > 1000) throw Error('Use 1–1000 seeds.');
  const out = path.resolve(process.argv[3] || path.join(__dirname, '../../artifacts/winter-return-progression-2026-10-29'));
  if (fs.existsSync(out)) throw Error('Preserve existing reports; choose a new output directory.');
  fs.mkdirSync(out, { recursive: true });
  const manifest = {};
  for (const file of sourceFiles) {
    const bytes = fs.readFileSync(path.resolve(__dirname, '../..', file));
    const target = path.join(out, 'model', file);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
    manifest[file] = crypto.createHash('sha256').update(bytes).digest('hex');
  }
  const runs = [];
  for (const scenario of scenarios) {
    for (let i = 0; i < count; i++) runs.push(await run(271828 + i, scenario,
      { storage: i === 0 ? path.join(out, `${scenario.id}.winter-sim.sqlite`) : ':memory:' }));
    process.stdout.write(`Completed ${scenario.id}: ${count} seeds\n`);
  }
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(runs, null, 2) + '\n');
  const summary = summarize(runs);
  let exactReplays = 0, nativeMatches = 0;
  for (const scenario of scenarios) {
    for (const original of runs.filter(r => r.scenario === scenario.id)) {
      const replay = await run(original.seed, scenario);
      if (JSON.stringify(replay) !== JSON.stringify(original)) throw Error('On-return replay mismatch.');
      exactReplays++;
      const native = prior.run(original.seed, scenario);
      if (JSON.stringify(native.state) !== JSON.stringify(original.envelope.state)) throw Error('On-return diverged from uninterrupted native history.');
      nativeMatches++;
    }
    process.stdout.write(`Replayed and native-matched ${scenario.id}\n`);
  }
  const benchmarks = [];
  for (const n of [10, 100]) {
    benchmarks.push(await benchmark(n, n === 10 ? path.join(out, 'load-10.winter-sim.sqlite') : ':memory:'));
    process.stdout.write(`Benchmarked ${n} simultaneous 31-day returns\n`);
  }
  const oldFile = path.resolve(__dirname, '../../artifacts/winter-hourly-progression-2026-10-29/summary.json');
  const old = fs.existsSync(oldFile) ? JSON.parse(fs.readFileSync(oldFile)).summary : [];
  const comparison = summary.map(s => {
    const earlier = old.find(row => row.id === (s.id === 'five-minute-save' ? 'five-minute-control' : s.id));
    return { scenario: s.id, oldIronHours: earlier?.milestones.iron.medianHours ?? null,
      newIronHours: s.milestones.iron.medianHours, oldCoatHours: earlier?.milestones.coat.medianHours ?? null,
      newCoatHours: s.milestones.coat.medianHours, oldDiscardedHours: earlier?.medianDiscardedHours ?? null };
  });
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ config: M.config, processing: settings, summary, comparison, benchmarks }, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify({ manifest, exactReplays, nativeMatches,
    totalTrajectories: runs.length, zeroLostTime: runs.every(r => r.envelope.discardedMs === 0),
    durableRepresentatives: scenarios.length, liveDatabaseOpened: false, runtimeActivated: false }, null, 2) + '\n');
  const fmt = n => n === null ? 'not reached' : n.toFixed(2);
  const lines = ['# Winter Wars: on-return progression study', '',
    'All elapsed progress is recoverable. No recurring work for absent players, no discarded tails and no blanket startup catch-up. One shared SQLite command queue processes chunks of up to four hours and yields between chunks. This is an offline candidate, not a bot rollout.', '',
    '|Visits / policy|Iron median h|Ice recipe median h|S3 median h|Coat median h|Coat reached|',
    '|---|---:|---:|---:|---:|---:|'];
  for (const s of summary) lines.push(`|${s.id}|${fmt(s.milestones.iron.medianHours)}|${fmt(s.milestones.iceRecipe.medianHours)}|${fmt(s.milestones.enteredS3.medianHours)}|${fmt(s.milestones.coat.medianHours)}|${s.milestones.coat.reached}/${s.seeds}|`);
  lines.push('', '## Assumptions', '',
    'Times start at Stone, STR0, 50HP, zero resources/ammunition; tutorial/Stone acquisition is excluded. First Gym visit after a loss establishes STR1 and grants 5 Sweat for purchases costing 2 and 3 to reach STR3. Purchases occur after settling the entire pre-command interval with the old stats/equipment. Historical reports retain their original frozen inputs.', '',
    'Frequent visitors may upgrade sooner, but every visit frequency receives all elapsed gathering/combat/Sweat/Buttons. Target policy farms S1 until Ice, then S2 until 100 wins, then S3 until coat. These are tested policies, not an optimum. Runs stop at coat or 31 days. Medians are conditional on milestone completion. Brown/map/challengers/Golden/yellow/later tiers remain outside this early study.', '',
    'The inactivity hour is a scheduling threshold, not an income gate. This command-driven study has no continuous active-player combat worker either: active commands settle their intervals, and inactivity schedules nothing. On startup, checkpoints are available without simulating every absent player. The returning request resumes its own saved state and RNG.', '',
    '## Processing load', '',
    'Abandoned profiles generate zero simulator calls. Returning players still require their accumulated combat events; this approach defers that work rather than eliminating it. Gathering remains chronological because it funds attacks and ammunition. No expected-damage shortcut replaces combat RNG.', '',
    'Ten and 100 simultaneous returns after 31 days are measured separately. Only one queued operation runs at a time. Four-hour chunks yield to the event loop; the queue currently finishes each returning command before the next, so later users wait. CPU, total batch time, queue-inclusive return latency and maximum chunk compute time are in summary.json. Measurements are local, not a production performance guarantee.', '',
    'Full histories, resource ledgers, old/new comparisons, SQLite representatives, replay counts and frozen input hashes accompany this report. The earlier discard study is preserved. Runtime, diagnostic controls, live storage, PM2 and Arena are unchanged.');
  fs.writeFileSync(path.join(out, 'analysis.md'), lines.join('\n') + '\n');
  process.stdout.write(JSON.stringify({ comparison, benchmarks }, null, 2) + '\n');
}
if (require.main === module) main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
module.exports = { scenarios, run, summarize, benchmark };
