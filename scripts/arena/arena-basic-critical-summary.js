const fs = require('node:fs')
const directory = 'artifacts/arena-basic-critical'
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const rows = read(`${directory}/results.json`).sort(
  (a, b) =>
    a.policy.localeCompare(b.policy) ||
    a.player.localeCompare(b.player) ||
    a.enemy.localeCompare(b.enemy)
)
const previous = read('artifacts/arena-outcomes/results.json')
if (
  rows.length !== 30 ||
  rows.some((r) => r.trials !== 10000 || r.totals.ledgerChecks !== 20000)
)
  throw Error('Expected 30 complete cohorts')
const f = (n) => (n == null ? '—' : n.toFixed(2))
const table = (headers, data) =>
  [
    '| ' + headers.join(' | ') + ' |',
    '| ' + headers.map(() => '---').join(' | ') + ' |',
    ...data.map((r) => '| ' + r.join(' | ') + ' |'),
  ].join('\n')
const names = ['Marq', 'Hellfed Marq', 'Maxim', 'Azulis']
const label = (r) => `${r.policy}: ${r.player} → ${r.enemy}`
const oldFor = (r) =>
  previous.find(
    (p) => p.policy === r.policy && p.player === r.player && p.enemy === r.enemy
  )
const tactical = rows.filter((r) => r.policy === 'C')
const mean = (data, key) => data.reduce((n, r) => n + r[key], 0) / data.length
const sides = rows.flatMap((r) =>
  ['player', 'enemy'].map((side) => ({
    cell: label(r),
    side,
    ...r.perFight[side],
  }))
)
let text =
  `# Arena: basic-only critical balance refresh

300,000 Level 1 seeded fights: 30 ordered matchup/policy cohorts, 10,000 each; seed 271828. All 600,000 fighter HP and Hope/Fear ledgers reconcile. Full metrics: [results.json](results.json). Source hashes: [model-source-hashes.json](model-source-hashes.json). The previous [Block/immediate-critical report](../arena-outcomes/analysis.md) and raw results are preserved.

## Rule correction

Only basic attacks can critical, for both roles. A player direct special still rolls its normal Duality and Hope/Fear, but matching dice resolve as an ordinary success: no damage multiplier, critical Stress recovery or critical Stress removal. Its own landed-hit effects remain eligible. An enemy basic can critical alongside a special: only that basic doubles and grants its normal critical resources; special damage remains normal. Basic critical Stress removal can still cause the existing exhaustion modifier on subsequent damage in the same response. That is ordinary vulnerability, not a special critical multiplier. Finishers remain guaranteed and noncritical. Regeneration and Stoke retain their accompanying basic, which can critical; the support effect itself cannot. No critical bonus is stored.

All Block, costs, healing, hit-effect gates, modifiers, rounding, AI accuracy, recovery, character coefficients and action economy remain unchanged. Special critical telemetry is zero throughout the refresh. This correction deliberately changes the tactical outcome previews so the policy no longer expects a special to critical.

## Method

Reproduce with \`node scripts/arena-outcomes-report.js basic-critical\`, then \`node scripts/arena-basic-critical-summary.js\`. The runner resumes completed cells and rejects source-hash changes; archive its new results/hash files to rerun. Same common survival-aware cheapest reliable lethal check, current-state information, midpoint player Finishers, seeded per-fight RNG, and existing tactical fallback as the prior report. No future RNG is inspected. Decisions may change when previews change; this is not a forced-action causal experiment or an optimal-policy proof. A 10,000-fight win estimate near 50% has an approximately ±1 percentage-point 95% sampling interval.

Azulis policies: A heals with a full useful 14 HP at or below 35% Health; B heals whenever a full 14 HP is missing; C requires a full useful heal and estimated survival gain above 0.25 rounds, preserving the last Stress unless near knockout and healing improves survival. The common lethal check precedes all healing. Both Azulis roles use the cell's policy. Other fighters use the same tactical policy throughout. Hellfed enemy remains an isolated offline adapter, not a new live AI. Existing player/enemy action economy, AI coefficients, Fear income, 85% accuracy/5% conditional basic critical chance, 8% recovery responses and Finisher percentages remain as documented in the prior report.

## Overall pacing

Across the equally weighted 16 C ordered matchups, previous → basic-only critical mean rounds: ${f(
    mean(tactical.map(oldFor), 'averageRounds')
  )} → ${f(mean(tactical, 'averageRounds'))}. Fights lasting 10–20 rounds: ${f(
    mean(tactical.map(oldFor), 'pacingPercent')
  )}% → ${f(mean(tactical, 'pacingPercent'))}%. No balance numbers were tuned.

## Tactical C matrices

Player win percentages (rows player, columns enemy; Marq = Spooky Marq):

` +
  table(
    ['Player', ...names],
    names.map((p) => [
      p,
      ...names.map((e) =>
        f(tactical.find((r) => r.player === p && r.enemy === e).winPercent)
      ),
    ])
  )
text +=
  '\n\nMean rounds:\n\n' +
  table(
    ['Player', ...names],
    names.map((p) => [
      p,
      ...names.map((e) =>
        f(tactical.find((r) => r.player === p && r.enemy === e).averageRounds)
      ),
    ])
  )
text +=
  '\n\n## Every cohort: special-critical baseline → basic-only critical\n\nWin delta is percentage points. Previous cells use the identical policies and seed, but their tactical decisions can differ.\n\n' +
  table(
    [
      'Cell',
      'Old win %',
      'New win %',
      'Δ pp',
      'Old rounds',
      'New rounds',
      '10–20 %',
    ],
    rows.map((r) => {
      const old = oldFor(r)
      return [
        label(r),
        f(old.winPercent),
        f(r.winPercent),
        f(r.winPercent - old.winPercent),
        f(old.averageRounds),
        f(r.averageRounds),
        f(r.pacingPercent),
      ]
    })
  )
text +=
  '\n\n## Sustain and resource management: both fighters\n\nAll values per fight except Stress at KO (conditional on knockout) and exposure percentage. Player exposure samples actual attacking enemy responses at damage-time Stress, excluding recovery-only responses; enemy exposure samples opposing player action opportunities, including buff-only activations. These are role-specific resource-exposure samples, not a uniform per-hit denominator or wall-clock time. Hellfed has no Stress exhaustion. Effective HP = max HP + actual restoration (including Brink) − self-paid HP; it includes unused Health in wins. Regeneration cap waste = theoretical healing − actual healing.\n\n' +
  table(
    [
      'Cell',
      'Side',
      'S1 uses',
      'HP healed',
      'Cap waste',
      'Stress at KO',
      '0 Stress samples',
      'Exposure %',
      'Effective HP',
      'Hope/Fear gained',
      'Hope/Fear spent',
    ],
    sides.map((s) => [
      s.cell,
      s.side,
      f(s.s1),
      f(s.healed),
      f(s.wasted),
      f(s.stressAtKnockout),
      f(s.zeroStressResponses),
      f(s.zeroStressResponsePercent),
      f(s.effectiveHp),
      f(s.hopeGenerated),
      f(s.hopeSpent),
    ])
  )
text +=
  '\n\n## Offense: both fighters\n\nDamage includes existing modifiers, Block and any overkill before clamping target HP. Basic / attempt includes chip damage. S1 damage is direct special damage only; Regeneration contributes zero. Every special-critical counter must remain zero.\n\n' +
  table(
    [
      'Cell',
      'Side',
      'S1 damage',
      'S2 uses',
      'S2 damage',
      'S3 uses',
      'S3 damage',
      'Basic damage',
      'Basic / attempt',
      'Basic Blocks',
      'Special Blocks',
      'Basic crits',
      'Special crits',
    ],
    sides.map((s) => [
      s.cell,
      s.side,
      f(s.s1Damage),
      f(s.s2),
      f(s.s2Damage),
      f(s.s3),
      f(s.s3Damage),
      f(s.basicDamage),
      f(s.basicDamagePerAttempt),
      f(s.blocksBasic),
      f(s.blocksSpecial),
      f(s.criticalsBasic),
      f(s.criticalsSpecial),
    ])
  )
const forward = rows.filter((r) => r.player === 'Azulis')
text +=
  '\n\n## Healing strategy and design\n\nAzulis as player:\n\n' +
  table(
    [
      'Opponent',
      'Policy',
      'Win %',
      'Rounds',
      '10–20 %',
      'HP healed',
      'S2 damage / use',
    ],
    forward.map((r) => [
      r.enemy,
      r.policy,
      f(r.winPercent),
      f(r.averageRounds),
      f(r.pacingPercent),
      f(r.perFight.player.healed),
      f(r.perFight.player.s2Damage / r.perFight.player.s2),
    ])
  )
text +=
  '\n\nHighest measured policy per ordered Azulis case:\n\n' +
  table(
    ['Azulis role', 'Opponent', 'Best policy', 'Win %', 'Lead pp'],
    [
      ...names.map((enemy) => ({
        side: 'player',
        opponent: enemy,
        group: forward
          .filter((r) => r.enemy === enemy)
          .map((r) => ({ policy: r.policy, win: r.winPercent })),
      })),
      ...names
        .filter((n) => n !== 'Azulis')
        .map((player) => ({
          side: 'enemy',
          opponent: player,
          group: rows
            .filter((r) => r.player === player && r.enemy === 'Azulis')
            .map((r) => ({ policy: r.policy, win: 100 - r.winPercent })),
        })),
    ].map(({ side, opponent, group }) => {
      group.sort((a, b) => b.win - a.win)
      return [
        side,
        opponent,
        group[0].policy,
        f(group[0].win),
        f(group[0].win - group[1].win),
      ]
    })
  )
text +=
  '\n\nThese are prescribed policy rankings, not a global dominance proof; small gaps need cautious interpretation, and mirrors retain role bias. Guaranteed healing still adds survivability while spending Stress, but it does not prevent a large immediate incoming special from exceeding 14 HP. Starlight retains its 42 base damage for two Hope, now with no special critical multiplier. See its actual contribution and pacing above before considering deliberate tuning. No automatic HP, Attack, healing or damage-coefficient adjustments were made.\n'
fs.writeFileSync(`${directory}/analysis.md`, text)
console.log({
  fights: 300000,
  ledgers: 600000,
  oldMeanRounds: mean(tactical.map(oldFor), 'averageRounds'),
  newMeanRounds: mean(tactical, 'averageRounds'),
})
