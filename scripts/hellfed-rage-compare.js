const fs = require('node:fs')
const root = 'artifacts/hellfed-rage'
const before = require('../artifacts/hellfed-rage/balance-before-s1-roll.json')
// Freeze this historical S1-only comparison before the later critical revision.
const after = require('../artifacts/hellfed-rage/balance-before-critical-activation.json')
const f = (value) => value.toFixed(2)
const table = after
  .map((row) => {
    const old = before.find(
      (item) => item.opponent === row.opponent && item.strategy === row.strategy
    )
    if (old.seed !== row.seed || old.trials !== row.trials)
      throw Error('Comparison seed or cohort mismatch')
    return `| ${row.opponent} | ${row.strategy} | ${f(old.winPercent)} → ${f(
      row.winPercent
    )} | ${f(row.winPercent - old.winPercent)} | ${f(old.averageRounds)} → ${f(
      row.averageRounds
    )} | ${f(old.averageHpSacrificed)} → ${f(row.averageHpSacrificed)} | ${f(
      old.averageS3Uses
    )} → ${f(row.averageS3Uses)} |`
  })
  .join('\n')
fs.writeFileSync(
  `${root}/comparison.md`,
  '# Hellfed correction: same 60,000-fight comparison\n\n' +
    '10,000 fights per strategy/opponent, seed 271828, same per-fight seed assignment and policy thresholds. The corrected profile changes only Hellfed S2 cost (3 → 2 Hope), S1 sacrifice (15 HP → ceil(3% maximum HP), 8 HP at Level 1), and S1 basic/dice resolution before the Rage gain. S2/S3 damage, S3 cost, enemy kits, other fighters, and the disabled critical revision are unchanged. Adaptive survival and sacrifice accounting use the new actual cost.\n\n' +
    '| AI | Strategy | Win % before → after | Change, points | Mean rounds before → after | HP sacrificed before → after | Finishers/fight before → after |\n|---|---|---|---:|---|---|---|\n' +
    table +
    '\n\nThe lower S2 cost also benefits strategy A, so the improvement cannot be attributed to S1 alone. B now wins more often than A against Maxim by 16.28 points, while A wins more often than B against Spooky Marq by 9.39 points. The A/C gaps are 6.01 points favoring A against Marq and 8.45 points favoring C against Maxim. These gaps exceed ordinary sampling error at 10,000 fights per cohort (individual win-rate 95% margins are below one percentage point); this is not an exhaustive search over adaptive policies.\n\n' +
    'B retains its strong Rage through repeated Stoke turns and usually casts at full Rage (9,837/9,967 Finishers against Marq and 5,125/5,203 against Maxim). Adaptive full-Rage Finishers remain uncommon: 0.1553/0.0905 casts per fight. B invests 56.23/46.51 HP across 7.03/5.81 Stoke activations, versus the old 88.58/77.04 HP. It now gets basic damage and normal resource generation on those turns.\n\n' +
    'No single tested strategy dominates both matchups. Marq durations span 14.96–19.11 rounds, Maxim 11.15–13.70; pacing remains matchup/policy dependent rather than uniformly 15 rounds. B against Maxim is the shortest cohort. No damage increase or automatic rebalance was applied. See balance.md and balance.json for all requested metrics, including Rage by outcome, S2/S3 delivered damage, unspent Hope at defeat and low-HP blocks.\n'
)
