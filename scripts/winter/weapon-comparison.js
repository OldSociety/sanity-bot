const { sourceFiles: collectSources } = require('../../services/winter/studies/source-files');
// Offline, unlimited-supply comparison. No runtime, storage or balance edits.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const M = require('../../services/winter/studies/early-progression');
const R = require('../../services/winter/studies/simulation-rng');
const C = M.config,
  H = M.HOUR,
  DAY = 24 * H;
const weapons = [
  { id: 'regular', name: 'Regular', damage: C.regularDamage, color: '#626d98' },
  { id: 'red', name: 'Spicy', damage: C.redDamage, color: '#d55d35' },
  { id: 'ice', name: 'Ice', damage: C.iceDamage, color: '#1295ad' }
];
function trial(tier, weaponId, seed, options = {}) {
  const row = C.snowmen.find((e) => e.tier === tier),
    weapon = weapons.find((w) => w.id === weaponId);
  if (!row || !weapon) throw Error('Undefined comparison tier/weapon.');
  const hp = options.hp ?? C.playerHp,
    strength = options.strength ?? 0;
  const damage =
    weapon.id === 'regular' ? weapon.damage * (1 + C.strengthPerLevel * strength) : weapon.damage;
  const playerAccuracy = C.playerAccuracy + (options.accuracy || 0) * C.accuracyPerLevel;
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
    nextPlayerAt = C.playerIntervalMs,
    nextEnemyAt = C.enemyIntervalMs;
  let playerHp = hp,
    enemyHp = row.hp,
    enemyMaxHp = row.hp,
    enemyDamage = row.damage;
  let wins = 0,
    losses = 0,
    shots = 0,
    hits = 0,
    enemyAttacks = 0,
    enemyHits = 0;
  let usefulDamageOut = 0,
    rawDamageOut = 0,
    hpLost = 0,
    rawDamageIn = 0;
  let stoppedAt = null;
  function reset(at) {
    playerHp = hp;
    enemyMaxHp = row.hp + M.addedHp(wins);
    enemyHp = enemyMaxHp;
    enemyDamage = row.damage + Math.floor(wins / 25);
    nextEnemyAt = at + C.enemyIntervalMs;
  }
  function advance(at) {
    if (!Number.isSafeInteger(at) || at < now) throw Error('Invalid comparison timestamp.');
    if (stoppedAt !== null) return snapshot();
    while (Math.min(nextPlayerAt, nextEnemyAt) <= at) {
      const t = Math.min(nextPlayerAt, nextEnemyAt);
      if (nextPlayerAt <= nextEnemyAt) {
        nextPlayerAt += C.playerIntervalMs;
        shots++;
        if (random() < playerAccuracy) {
          hits++;
          rawDamageOut += damage;
          usefulDamageOut += Math.min(enemyHp, damage);
          enemyHp = Math.max(0, enemyHp - damage);
          if (!enemyHp) {
            wins++;
            reset(t);
          }
        }
      } else {
        nextEnemyAt += C.enemyIntervalMs;
        enemyAttacks++;
        if (random() < C.enemyAccuracy) {
          enemyHits++;
          rawDamageIn += enemyDamage;
          hpLost += Math.min(playerHp, enemyDamage);
          playerHp = Math.max(0, playerHp - enemyDamage);
          if (!playerHp) {
            losses++;
            if (options.stopOnFirstLoss) {
              stoppedAt = t;
              now = t;
              return snapshot();
            }
            reset(t);
          }
        }
      }
    }
    now = at;
    return snapshot();
  }
  function snapshot() {
    return {
      now,
      tier,
      weapon: weaponId,
      wins,
      level: wins + 1,
      losses,
      shots,
      hits,
      enemyAttacks,
      enemyHits,
      playerHp,
      enemyHp,
      enemyMaxHp,
      enemyDamage,
      nextPlayerAt,
      nextEnemyAt,
      usefulDamageOut,
      rawDamageOut,
      hpLost,
      rawDamageIn,
      combatSweat: wins * row.sweat,
      rng: x >>> 0,
      ...(options.stopOnFirstLoss ? { stoppedAt } : {})
    };
  }
  return { advance, snapshot };
}
function run(tier, weapon, seed) {
  const t = trial(tier, weapon, seed),
    snapshots = [[0, 1, 0, 0, 0]];
  for (let at = H; at <= C.durationDays * DAY; at += H) {
    const s = t.advance(at);
    if (
      s.shots !== at / C.playerIntervalMs ||
      s.playerHp <= 0 ||
      s.enemyHp <= 0 ||
      s.hits > s.shots ||
      s.usefulDamageOut > s.rawDamageOut ||
      s.hpLost > s.rawDamageIn
    )
      throw Error('Comparison integrity failure.');
    snapshots.push([at / DAY, s.level, s.hpLost, s.usefulDamageOut, s.losses]);
  }
  return { tier, weapon, seed, final: t.snapshot(), snapshots };
}
function native(tier, weapon, seed, hourly = false) {
  const state = M.fresh(),
    random = R.initial(seed),
    draws = R.streams(random);
  state.target = tier;
  state.enemyHp = state.enemyMaxHp = C.snowmen.find((e) => e.tier === tier).hp;
  // Explicitly provision more than the entire event's possible ammunition.
  const provision = (C.durationDays * DAY) / C.playerIntervalMs + 1;
  state.snow = 2500000000;
  state.ledger.snowProduced = state.snow;
  if (weapon === 'red') {
    state.red = provision;
    state.equipped = 'red';
    state.ledger.redSnow = provision * C.redSnowCost;
    state.snow -= state.ledger.redSnow;
  }
  if (weapon === 'ice') {
    state.iceRecipe = true;
    state.ice = provision;
    state.equipped = 'ice';
    state.ledger.iceDiamonds = provision * C.iceDiamonds;
    state.ledger.diamondsCrafted = state.ledger.iceDiamonds;
    state.ledger.pressedSnow = state.ledger.iceDiamonds * C.diamondSnowCost;
    state.snow -= state.ledger.pressedSnow;
  }
  const points = [];
  for (
    let at = hourly ? H : C.durationDays * DAY;
    at <= C.durationDays * DAY;
    at += hourly ? H : C.durationDays * DAY
  ) {
    M.settle(state, at, draws);
    M.assertLedger(state);
    points.push([at, state.tiers[tier].wins, state.tiers[tier].losses]);
  }
  const r = state.tiers[tier];
  return {
    wins: r.wins,
    losses: r.losses,
    shots: r.attacks,
    hits: r.hits,
    enemyAttacks: r.enemyAttacks,
    enemyHits: r.enemyHits,
    playerHp: state.playerHp,
    enemyHp: state.enemyHp,
    enemyMaxHp: M.enemy(state).hp,
    nextPlayerAt: state.nextPlayerAt,
    nextEnemyAt: state.nextEnemyAt,
    rng: random.combat,
    points
  };
}
function quantile(values, p) {
  return [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)];
}
function summarize(runs) {
  const groups = [];
  for (const row of C.snowmen)
    for (const weapon of weapons) {
      const samples = runs.filter((r) => r.tier === row.tier && r.weapon === weapon.id);
      const mean = (key) => samples.reduce((s, r) => s + r.final[key], 0) / samples.length;
      const timeline = samples[0].snapshots.map((point, i) => {
        const levels = samples.map((s) => s.snapshots[i][1]);
        return {
          day: point[0],
          meanLevel: levels.reduce((a, b) => a + b, 0) / samples.length,
          p10Level: quantile(levels, 0.1),
          p90Level: quantile(levels, 0.9),
          meanHpLost: samples.reduce((s, r) => s + r.snapshots[i][2], 0) / samples.length,
          meanDamageDealt: samples.reduce((s, r) => s + r.snapshots[i][3], 0) / samples.length
        };
      });
      groups.push({
        tier: row.tier,
        weapon: weapon.id,
        name: weapon.name,
        color: weapon.color,
        seeds: samples.length,
        meanLevel: mean('level'),
        p10Level: quantile(
          samples.map((s) => s.final.level),
          0.1
        ),
        p90Level: quantile(
          samples.map((s) => s.final.level),
          0.9
        ),
        meanLosses: mean('losses'),
        meanHpLost: mean('hpLost'),
        meanDamageDealt: mean('usefulDamageOut'),
        meanRawDamageDealt: mean('rawDamageOut'),
        meanCombatSweat: mean('combatSweat'),
        meanHitFraction: mean('hits') / mean('shots'),
        timeline
      });
    }
  return groups;
}
function main() {
  const count = Number(process.argv[2] || 64);
  if (!Number.isInteger(count) || count < 8 || count > 1000)
    throw Error('Use 8–1000 seeds per cohort.');
  const out = path.resolve(
    process.argv[3] || path.join(__dirname, '../../artifacts/winter-weapon-comparison-2026-10-29')
  );
  if (fs.existsSync(out)) throw Error('Preserve previous output; choose a new directory.');
  fs.mkdirSync(out, { recursive: true });
  const files = [
    'config/winter/studies/early-progression.json',
    'services/winter/studies/early-progression.js',
    'services/winter/studies/simulation-rng.js',
    'scripts/winter/weapon-comparison.js'
  ];
  const hashes = {};
  for (const file of collectSources(files)) {
    const bytes = fs.readFileSync(path.resolve(__dirname, '../..', file));
    const dest = path.join(out, 'model', file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, bytes);
    hashes[file] = crypto.createHash('sha256').update(bytes).digest('hex');
  }
  const runs = [];
  let replayPairs = 0,
    nativePairs = 0;
  for (const row of C.snowmen)
    for (const weapon of weapons) {
      for (let i = 0; i < count; i++) {
        const result = run(row.tier, weapon.id, 271828 + i);
        runs.push(result);
        if (i < 8) {
          assert.deepEqual(run(row.tier, weapon.id, result.seed), result);
          replayPairs++;
        }
        if (i < 2) {
          const actual = native(row.tier, weapon.id, result.seed, true);
          for (const key of Object.keys(actual).filter((k) => k !== 'points'))
            assert.equal(
              result.final[key],
              actual[key],
              `Native mismatch: ${row.tier}/${weapon.id}/${key}`
            );
          for (let p = 0; p < actual.points.length; p++) {
            assert.equal(result.snapshots[p + 1][1], actual.points[p][1] + 1);
            assert.equal(result.snapshots[p + 1][4], actual.points[p][2]);
          }
          nativePairs++;
        }
      }
      process.stdout.write(
        `Completed S${row.tier}/${weapon.name}: ${count} event-month histories\n`
      );
    }
  const summary = summarize(runs);
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(runs) + '\n');
  fs.writeFileSync(
    path.join(out, 'summary.json'),
    JSON.stringify(
      {
        config: C,
        player: { strength: 0, hp: 50, accuracy: 0.7 },
        weapons,
        days: C.durationDays,
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
        hashes,
        trajectories: runs.length,
        exactReplayPairs: replayPairs,
        fullMonthNativePairs: nativePairs,
        hourlyNativeCheckpointPairs: nativePairs * C.durationDays * 24,
        unlimitedShotsPerTrajectory: (C.durationDays * DAY) / C.playerIntervalMs,
        unlimitedSupply: true,
        fixedStats: true,
        noPurchases: true,
        noRuntimeChange: true
      },
      null,
      2
    ) + '\n'
  );
  process.stdout.write(
    JSON.stringify(
      summary.map(({ tier, name, meanLevel, p10Level, p90Level }) => ({
        tier,
        name,
        meanLevel,
        p10Level,
        p90Level
      })),
      null,
      2
    ) + '\n'
  );
}
if (require.main === module) main();
module.exports = { trial, run, native, summarize, weapons };
