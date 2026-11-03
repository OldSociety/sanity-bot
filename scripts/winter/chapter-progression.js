const { sourceFiles: collectSources } = require('../../services/winter/studies/source-files');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  crypto = require('node:crypto');
const M = require('../../services/winter/studies/chapter-simulation'),
  H = M.HOUR;
const milestones = [
  'strength25',
  'iron',
  'clearS1',
  'clearS2',
  'purchaseS3',
  'enterS3',
  'coat',
  'reinforced',
  'iceRecipe',
  'clearS3',
  'fireUnlock',
  'purchaseS4',
  'enterS4',
  'clearS4',
  'golden',
  'yellowRecipe',
  'purchaseS5'
];
function run(seed, fire, visitHours, training = 'strength', options = {}) {
  const c = M.rules(fire);
  if (options.s3Wins !== undefined) c.experimentalS3Wins = options.s3Wins;
  const s = M.fresh(seed, c),
    interval = Math.round(visitHours * H),
    limit = c.durationDays * 24 * H,
    visits = [];
  for (let at = interval; at <= limit; at += interval) {
    M.settle(s, at, c);
    M.visit(s, interval, c, training, options);
    visits.push({
      hours: at / H,
      target: s.target,
      strength: s.strength,
      accuracy: s.accuracy,
      snow: s.snow,
      sweat: s.sweat,
      buttons: s.buttons,
      wins: Object.values(s.tiers).map((t) => t.wins),
      losses: Object.values(s.tiers).reduce((n, t) => n + t.losses, 0),
      production: M.rate(s, c),
      equipped: s.equipped
    });
    if (s.yellowRecipe && s.owned[5]) break;
  }
  return { seed, fire: fire.id, visitHours, training, state: s, visits };
}
const q = (v, p) =>
  v.length ? [...v].sort((a, b) => a - b)[Math.floor((v.length - 1) * p)] : null;
function summarize(rows) {
  const result = {
    fire: rows[0].fire,
    visitHours: rows[0].visitHours,
    training: rows[0].training,
    seeds: rows.length,
    milestones: {}
  };
  for (const name of milestones) {
    const times = rows
      .map((r) => r.state.milestones[name])
      .filter((t) => t !== undefined)
      .map((t) => t / H);
    result.milestones[name] = {
      reached: times.length,
      p10Hours: q(times, 0.1),
      medianHours: q(times, 0.5),
      p90Hours: q(times, 0.9)
    };
  }
  result.atGolden = {};
  for (const key of ['snow', 'strength', 'accuracy']) {
    const v = rows.map((r) => r.state.milestoneStates.golden?.[key]).filter((v) => v !== undefined);
    result.atGolden[key] = { median: q(v, 0.5), p10: q(v, 0.1), p90: q(v, 0.9) };
  }
  const s4 = rows
    .map((r) => r.state.milestoneStates.golden?.wins[3])
    .filter((v) => v !== undefined);
  result.atGolden.s4Wins = { median: q(s4, 0.5), p10: q(s4, 0.1), p90: q(s4, 0.9) };
  const iceImmediately = rows.filter(
    (r) => r.state.milestones.iceRecipe === r.state.milestones.purchaseS3
  ).length;
  result.iceAtS3Purchase = iceImmediately;
  return result;
}
function main() {
  const out = path.resolve(process.argv[2] || 'artifacts/winter-chapter-progression-2026-10-29');
  if (fs.existsSync(out)) throw Error('Preserve old evidence.');
  fs.mkdirSync(out, { recursive: true });
  const results = [],
    summary = [];
  for (const fire of M.defaults.experimentalFireCandidates)
    for (const visitHours of [1, 4, 12, 24]) {
      for (const training of visitHours === 4 ? ['strength', 'balanced'] : ['strength']) {
        const rows = Array.from({ length: 32 }, (_, i) =>
          run(1010001 + i, fire, visitHours, training)
        );
        assert.deepEqual(run(1010001, fire, visitHours, training), rows[0]);
        results.push(...rows);
        const sum = summarize(rows);
        summary.push(sum);
        console.log(
          JSON.stringify({
            fire: fire.id,
            visitHours,
            training,
            iron: sum.milestones.iron,
            entryS3: sum.milestones.enterS3,
            ice: sum.milestones.iceRecipe,
            entryS4: sum.milestones.enterS4,
            clearS4: sum.milestones.clearS4,
            golden: sum.milestones.golden,
            yellow: sum.milestones.yellowRecipe,
            s5: sum.milestones.purchaseS5,
            s4AtGolden: sum.atGolden.s4Wins,
            iceAtS3Purchase: sum.iceAtS3Purchase
          })
        );
      }
    }
  const manifest = {};
  for (const file of collectSources([
    'config/winter/game/balance.json',
    'services/winter/studies/chapter-simulation.js',
    'services/winter/studies/early-progression.js',
    'scripts/winter/chapter-progression.js'
  ])) {
    const bytes = fs.readFileSync(file),
      dest = path.join(out, 'model', file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, bytes);
    manifest[file] = crypto.createHash('sha256').update(bytes).digest('hex');
  }
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results));
  fs.writeFileSync(
    path.join(out, 'summary.json'),
    JSON.stringify(
      {
        manifest,
        histories: results.length,
        replays: summary.length,
        config: M.defaults,
        summary,
        assumptions:
          'Start post-tutorial Stone/STR3 with zero supplies/wallet. Scheduled visits settle losslessly before Throw restores accuracy. Spend Sweat immediately at visits, STR-only or balanced heuristic. Purchases prioritized: fixed Emporium sequence; Iron; S2/S3; Ice recipe; S4; Yellow recipe after Golden; S5. Half each visit new ordinary production budgets selected special ammo after purchases and regular reserve. S4 target chosen only after Fire unlocked; immune attempts still produce Buttons. Stop after S5 and Yellow recipe purchases, or31 days; never simulate unknown S5/Yellow combat. Fire candidates experimental; no free supplied HP/ammo or entry savings.'
      },
      null,
      2
    )
  );
}
if (require.main === module) main();
module.exports = { run, summarize, milestones };
