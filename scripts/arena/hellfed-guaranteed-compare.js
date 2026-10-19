const fs = require('node:fs')
const assert = require('node:assert/strict')
const before = require('../../artifacts/hellfed-rage/balance-before-guaranteed.json')
const after = require('../../artifacts/hellfed-rage/balance.json')
const f = (value) => value.toFixed(2)
const rows = after
  .map((row) => {
    const old = before.find(
      (item) =>
        item.opponent === row.opponent && item.strategy === row.strategy,
    )
    assert.equal(row.seed, old.seed)
    assert.equal(row.trials, old.trials)
    if (row.strategy === 'A')
      for (const key of [
        'winPercent',
        'averageRounds',
        'averageS1',
        'averageHpSacrificed',
        'averageS2Uses',
        'averageS3Uses',
      ])
        assert.equal(row[key], old[key], `Never-Stoke control changed: ${key}`)
    return `| ${row.opponent} | ${row.strategy} | ${f(old.winPercent)} → ${f(
      row.winPercent,
    )} | ${f(row.winPercent - old.winPercent)} | ${f(old.averageRounds)} → ${f(
      row.averageRounds,
    )} | ${f(old.averageHpSacrificed)} → ${f(row.averageHpSacrificed)} | ${f(
      row.averageS2Uses,
    )} / ${f(row.averageS3Uses)} | ${f(row.stokeOpportunityUsePercent)} |`
  })
  .join('\n')
fs.writeFileSync(
  'artifacts/hellfed-rage/guaranteed-comparison.md',
  '# Guaranteed Stoke + tiered HP: same 60,000 fights\n\n' +
    '10,000 fights per strategy/opponent, seed 271828; same per-fight seed mapping, fixed Finisher button 3, completed critical effects and policy thresholds. Only Stoke changes: a failed basic becomes a hit while retaining the normal Duality resource/critical result; HP cost is ceil(1%/2%/3% maximum HP) for filling Rage to one/two/three. At Level 1 these are 3/6/8 HP. Guaranteed Stoke hits never lose Rage or arm enemy Opportunity. Ordinary basics can still miss and lose Rage. S2/S3 remain 2/5 Hope with unchanged damage. Adaptive survival uses the actual new cost.\n\n' +
    '| AI | Strategy | Win % before → after | Change, points | Rounds before → after | HP paid before → after | S2 / S3 casts per fight | Legal Stoke opportunities used % |\n|---|---|---|---:|---|---|---|---:|\n' +
    rows +
    '\n\nA never uses Stoke; B always uses it when legal, even before spending Hope; C uses the same conditional survival/HP rule as before and prioritizes immediate spending opportunities. These are prescribed policy comparisons rather than an optimized or learned strategy. The never-Stoke control is checked for identical wins, duration, spending and HP investment. Legal refill opportunities exclude full Rage and HP at or below the current sacrifice. balance.md/json include actual Hope spent on S2 versus S3, per-fight always/sometimes/never patterns, casts by starting Rage and upkeep after the first full meter. No automatic rebalance.\n',
)
