const fs = require('node:fs')
const before = require('../artifacts/hellfed-rage/balance-before-critical-activation.json')
// Historical critical-only output, before the later guaranteed-Stoke trial.
const after = require('../artifacts/hellfed-rage/balance-before-guaranteed.json')
const f = (value) => value.toFixed(2)
const rows = after
  .map((row) => {
    const old = before.find(
      (item) => item.opponent === row.opponent && item.strategy === row.strategy
    )
    if (old.seed !== row.seed || old.trials !== row.trials)
      throw Error('Seed or cohort mismatch')
    return `| ${row.opponent} | ${row.strategy} | ${f(old.winPercent)} → ${f(
      row.winPercent
    )} | ${f(row.winPercent - old.winPercent)} | ${f(old.averageRounds)} → ${f(
      row.averageRounds
    )} |`
  })
  .join('\n')
fs.writeFileSync(
  'artifacts/hellfed-rage/critical-comparison.md',
  '# Completed symmetric critical rules: same 60,000 fights\n\n' +
    'Enemy Hope means Fear, its usable resource. Enemy critical basics now grant one Fear after action selection, restore up to one own Stress after costs, and remove up to one opponent Stress before damage. The player retains its existing critical-success package, granting one Hope rather than an additional second point. Hellfed remains Stress-immune with no Rage loss from enemy criticals. The AI time-to-Finisher estimate includes the added expected critical Fear income; no probability or damage coefficients were tuned.\n\n' +
    'Both runs use seed 271828, 10,000 fights per matchup/policy, the corrected normal-roll 3%-HP Stoke, S2/S3 costs 2/5, and the same A/B/C policies. Production is excluded from this critical revision.\n\n' +
    '| AI | Strategy | Win % before → after | Change, points | Mean rounds before → after |\n|---|---|---|---:|---|\n' +
    rows +
    '\n\nCurrent complete metrics are in balance.md and balance.json. This comparison supersedes the pre-critical results for the live development kit. The earlier S1-only comparison.md remains historical. No automatic balance changes were made.\n'
)
