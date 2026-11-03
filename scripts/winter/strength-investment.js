const { sourceFiles: collectSources } = require('../../services/winter/studies/source-files');
// Continuous fights start after the STR1 + 5 Sweat, two-purchase Gym tutorial.
// Policies differ only in when earned Sweat is invested into STR.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const assert = require('node:assert/strict');
const M = require('../../services/winter/studies/early-progression');
const C = M.config,
  H = M.HOUR,
  DAY = 24 * H;
const policies = [
  { id: 'fixed', name: 'Stay at STR3', color: '#69749a' },
  { id: 'daily', name: 'Invest every 24h', color: '#138ca7' },
  { id: 'instant', name: 'Reinvest immediately', color: '#d65f36' }
];
const weapons = [
  { id: 'regular', name: 'Regular', base: C.regularDamage },
  { id: 'red', name: 'Spicy', base: C.redDamage },
  { id: 'ice', name: 'Ice', base: C.iceDamage }
];
function gymBaseline(c = C) {
  let strength = c.gymStartingStrength ?? 1,
    sweat = c.gymStarterSweat;
  const purchases = [];
  while (strength < (c.gymTutorialStrength ?? 3)) {
    const cost = strength + 1;
    if (sweat < cost) throw Error('Gym tutorial gift cannot fund its two levels.');
    sweat -= cost;
    strength++;
    purchases.push({ strength, cost, remainingSweat: sweat });
  }
  assert.equal(purchases.length, 2);
  return {
    entryStrength: c.gymStartingStrength ?? 1,
    gift: c.gymStarterSweat,
    purchases,
    strength,
    sweat
  };
}
function trial(tier, weaponId, policy, passive, seed, options = {}) {
  const row = C.snowmen.find((r) => r.tier === tier),
    weapon = weapons.find((w) => w.id === weaponId);
  if (!row || !weapon || !policies.some((p) => p.id === policy))
    throw Error('Invalid investment scenario.');
  let x = seed >>> 0 || 1;
  const random =
    options.random ||
    (() => {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      return (x >>> 0) / 4294967296;
    });
  let now = 0,
    nextP = C.playerIntervalMs,
    nextE = C.enemyIntervalMs,
    nextVisit = policy === 'daily' ? DAY : Infinity;
  const baseline = gymBaseline();
  let strength = baseline.strength,
    rate = passive ? M.passiveRate(strength) : 0,
    wallet = baseline.sweat * H,
    passiveUnits = 0,
    trainingSpent = 0;
  let nextTraining = Infinity,
    damage =
      weapon.id === 'regular' ? weapon.base * (1 + C.strengthPerLevel * strength) : weapon.base;
  let playerHp = C.playerHp,
    enemyHp = row.hp,
    enemyMaxHp = row.hp,
    enemyDamage = row.damage;
  let wins = 0,
    losses = 0,
    shots = 0,
    hits = 0,
    enemyAttacks = 0,
    enemyHits = 0;
  let hpLost = 0,
    damageDealt = 0,
    combatSweat = 0;
  const milestones = {},
    firstPurchases = [];
  function scheduleTraining() {
    nextTraining =
      policy === 'instant' && strength < C.statCap && rate > 0
        ? now + Math.max(0, Math.ceil(((strength + 1) * H - wallet) / rate))
        : Infinity;
  }
  function train() {
    if (policy === 'fixed') return;
    while (strength < C.statCap && wallet >= (strength + 1) * H) {
      const cost = strength + 1;
      wallet -= cost * H;
      trainingSpent += cost;
      strength++;
      if (firstPurchases.length < 12)
        firstPurchases.push({
          at: now,
          strength,
          cost,
          wins,
          combatSweat,
          passiveSweat: passiveUnits / H
        });
      if ([4, 10, 25, 50, 75, 100].includes(strength)) milestones[`strength${strength}`] = now;
    }
    rate = passive ? M.passiveRate(strength) : 0;
    damage =
      weapon.id === 'regular' ? weapon.base * (1 + C.strengthPerLevel * strength) : weapon.base;
  }
  function accrue(t) {
    const units = (t - now) * rate;
    wallet += units;
    passiveUnits += units;
    now = t;
  }
  function reset(at) {
    playerHp = C.playerHp;
    enemyMaxHp = row.hp + M.addedHp(wins);
    enemyHp = enemyMaxHp;
    enemyDamage = row.damage + Math.floor(wins / 25);
    nextE = at + C.enemyIntervalMs;
  }
  scheduleTraining();
  function advance(at) {
    if (!Number.isSafeInteger(at) || at < now) throw Error('Invalid investment timestamp.');
    while (Math.min(nextP, nextE, nextVisit, nextTraining) <= at) {
      const t = Math.min(nextP, nextE, nextVisit, nextTraining);
      accrue(t);
      // Combat first on exact timestamp ties; training applies to subsequent attacks.
      if (nextP === t) {
        nextP += C.playerIntervalMs;
        shots++;
        if (random() < C.playerAccuracy) {
          hits++;
          damageDealt += Math.min(enemyHp, damage);
          enemyHp = Math.max(0, enemyHp - damage);
          if (!enemyHp) {
            wins++;
            wallet += row.sweat * H;
            combatSweat += row.sweat;
            reset(t);
          }
        }
      }
      if (nextE === t) {
        nextE += C.enemyIntervalMs;
        enemyAttacks++;
        if (random() < C.enemyAccuracy) {
          enemyHits++;
          hpLost += Math.min(playerHp, enemyDamage);
          playerHp = Math.max(0, playerHp - enemyDamage);
          if (!playerHp) {
            losses++;
            reset(t);
          }
        }
      }
      if (policy === 'instant') {
        train();
        scheduleTraining();
      }
      if (nextVisit === t) {
        train();
        nextVisit += DAY;
      }
    }
    accrue(at);
    if (
      wallet < 0 ||
      combatSweat * H + passiveUnits - trainingSpent * H !== wallet ||
      strength > C.statCap ||
      strength < 3 ||
      shots !== Math.floor(at / C.playerIntervalMs) ||
      playerHp <= 0 ||
      enemyHp <= 0
    )
      throw Error('Investment ledger/timing failure.');
    return snapshot();
  }
  function snapshot() {
    return {
      now,
      tier,
      weapon: weaponId,
      policy,
      passive,
      strength,
      sweat: wallet / H,
      sweatWhole: Math.floor(wallet / H),
      sweatRemainder: wallet % H,
      combatSweat,
      passiveSweat: passiveUnits / H,
      trainingSpent,
      level: wins + 1,
      wins,
      losses,
      shots,
      hits,
      enemyAttacks,
      enemyHits,
      playerHp,
      enemyHp,
      enemyMaxHp,
      enemyDamage,
      nextPlayerAt: nextP,
      nextEnemyAt: nextE,
      hpLost,
      damageDealt,
      milestones: { ...milestones },
      firstPurchases: [...firstPurchases],
      rng: x >>> 0
    };
  }
  return { advance, snapshot };
}
function run(tier, weapon, policy, passive, seed) {
  const t = trial(tier, weapon, policy, passive, seed),
    timeline = [[0, 1, 3, 0, 0, 0]];
  for (let at = H; at <= C.durationDays * DAY; at += H) {
    const s = t.advance(at);
    timeline.push([at / DAY, s.level, s.strength, s.combatSweat, s.passiveSweat, s.hpLost]);
  }
  return { tier, weapon, policy, passive, seed, final: t.snapshot(), timeline };
}
function summarize(runs) {
  const groups = [];
  const q = (v, p) => [...v].sort((a, b) => a - b)[Math.floor((v.length - 1) * p)];
  for (const tier of C.snowmen.map((r) => r.tier))
    for (const w of weapons)
      for (const passive of [false, true])
        for (const policy of policies) {
          const rows = runs.filter(
            (r) =>
              r.tier === tier &&
              r.weapon === w.id &&
              r.policy === policy.id &&
              r.passive === passive
          );
          const mean = (key) => rows.reduce((sum, r) => sum + r.final[key], 0) / rows.length;
          const timeline = rows[0].timeline.map((point, i) => ({
            day: point[0],
            meanLevel: rows.reduce((sum, r) => sum + r.timeline[i][1], 0) / rows.length,
            p10Level: q(
              rows.map((r) => r.timeline[i][1]),
              0.1
            ),
            p90Level: q(
              rows.map((r) => r.timeline[i][1]),
              0.9
            ),
            meanStrength: rows.reduce((sum, r) => sum + r.timeline[i][2], 0) / rows.length,
            meanCombatSweat: rows.reduce((sum, r) => sum + r.timeline[i][3], 0) / rows.length,
            meanPassiveSweat: rows.reduce((sum, r) => sum + r.timeline[i][4], 0) / rows.length
          }));
          const str25 = rows
            .map((r) => r.final.milestones.strength25)
            .filter((t) => t !== undefined);
          groups.push({
            tier,
            weapon: w.id,
            passive,
            policy: policy.id,
            seeds: rows.length,
            meanLevel: mean('level'),
            p10Level: q(
              rows.map((r) => r.final.level),
              0.1
            ),
            p90Level: q(
              rows.map((r) => r.final.level),
              0.9
            ),
            meanStrength: mean('strength'),
            meanCombatSweat: mean('combatSweat'),
            meanPassiveSweat: mean('passiveSweat'),
            meanTrainingSpent: mean('trainingSpent'),
            meanBankedSweat: mean('sweat'),
            strength25Reached: str25.length,
            medianStrength25Hours: str25.length ? q(str25, 0.5) / H : null,
            timeline
          });
        }
  return groups;
}
function main() {
  const seeds = Number(process.argv[2] || 64);
  if (!Number.isInteger(seeds) || seeds < 8 || seeds > 1000) throw Error('Use 8–1000 seeds.');
  const out = path.resolve(
    process.argv[3] || path.join(__dirname, '../../artifacts/winter-strength-investment-2026-10-29')
  );
  if (fs.existsSync(out)) throw Error('Preserve old evidence; select a new output directory.');
  fs.mkdirSync(out, { recursive: true });
  const manifest = {};
  for (const file of collectSources([
    'config/winter/studies/early-progression.json',
    'services/winter/studies/early-progression.js',
    'scripts/winter/strength-investment.js'
  ])) {
    const bytes = fs.readFileSync(path.resolve(__dirname, '../..', file)),
      target = path.join(out, 'model', file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    manifest[file] = crypto.createHash('sha256').update(bytes).digest('hex');
  }
  const results = [];
  let replays = 0;
  for (const row of C.snowmen)
    for (const weapon of weapons)
      for (const passive of [false, true]) {
        for (const policy of policies)
          for (let i = 0; i < seeds; i++) {
            const result = run(row.tier, weapon.id, policy.id, passive, 271828 + i);
            results.push(result);
            if (i < 2) {
              assert.deepEqual(run(row.tier, weapon.id, policy.id, passive, result.seed), result);
              replays++;
            }
          }
        process.stdout.write(
          `Completed S${row.tier}/${weapon.name}/passive=${passive}: 3 policies x ${seeds} seeds\n`
        );
      }
  const summary = summarize(results);
  let specialMatches = 0;
  for (const row of C.snowmen)
    for (const w of weapons.filter((w) => w.id !== 'regular'))
      for (let i = 0; i < seeds; i++) {
        const variants = results.filter(
          (r) => r.tier === row.tier && r.weapon === w.id && r.seed === 271828 + i
        );
        const baseline = variants[0].final;
        for (const variant of variants.slice(1)) {
          for (const key of [
            'level',
            'losses',
            'shots',
            'hits',
            'enemyAttacks',
            'enemyHits',
            'rng',
            'hpLost',
            'damageDealt',
            'enemyHp',
            'playerHp'
          ])
            assert.equal(variant.final[key], baseline[key]);
          specialMatches++;
        }
      }
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results) + '\n');
  fs.writeFileSync(
    path.join(out, 'summary.json'),
    JSON.stringify(
      {
        config: C,
        gymTutorial: gymBaseline(),
        startingStrength: 3,
        startingSweat: 0,
        trainingPrice: 'destination level',
        policies,
        weapons,
        summary
      },
      null,
      2
    ) + '\n'
  );
  fs.writeFileSync(
    path.join(out, 'verification.json'),
    JSON.stringify(
      {
        manifest,
        histories: results.length,
        exactReplays: replays,
        specialWeaponMatches: specialMatches,
        sourceLedgersChecked: 'every hourly snapshot',
        noRuntimeChange: true
      },
      null,
      2
    ) + '\n'
  );
  process.stdout.write(
    JSON.stringify(
      summary.filter((s) => s.weapon === 'regular').map(({ timeline, ...s }) => s),
      null,
      2
    ) + '\n'
  );
}
if (require.main === module) main();
module.exports = { trial, run, summarize, policies, weapons, gymBaseline };
