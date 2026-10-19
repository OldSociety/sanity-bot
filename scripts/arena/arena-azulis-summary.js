const fs = require('node:fs')
const rows = JSON.parse(
  fs.readFileSync('artifacts/azulis/results.json', 'utf8')
)
if (rows.length !== 21 || rows.some((r) => r.trials !== 10000))
  throw Error('Expected 21 complete 10,000-fight cohorts')
rows.sort(
  (a, b) =>
    a.policy.localeCompare(b.policy) ||
    a.player.localeCompare(b.player) ||
    a.enemy.localeCompare(b.enemy)
)
// Rage has no Stress resource and can never suffer exhaustion vulnerability.
// Normalize this reporting-only field for cohorts completed before this label
// was distinguished; fight outcomes, damage and resource ledgers are untouched.
for (const row of rows)
  for (const side of ['player', 'enemy'])
    if (row[side] === 'Hellfed Marq') {
      row.perFight[side].zeroStressResponses = 0
      row.perFight[side].zeroStressResponsePercent = 0
      row.perFight[side].stressAtKnockout = null
    }
fs.writeFileSync('artifacts/azulis/results.json', JSON.stringify(rows, null, 2))
const f = (n) => (n === null ? '—' : n.toFixed(2))
const table = (headers, data) =>
  [
    '| ' + headers.join(' | ') + ' |',
    '| ' + headers.map(() => '---').join(' | ') + ' |',
    ...data.map((r) => '| ' + r.join(' | ') + ' |'),
  ].join('\n')
const label = (r) => `${r.policy}: ${r.player} → ${r.enemy}`
const forward = rows
  .filter((r) => r.player === 'Azulis')
  .sort(
    (a, b) => a.enemy.localeCompare(b.enemy) || a.policy.localeCompare(b.policy)
  )
let text =
  `# Classic Azulis: Level 1 sustain audit\n\n210,000 offline fights; seed 271828; 10,000 per ordered matchup and healing policy. No coefficients were tuned. All ${rows
    .reduce((n, r) => n + r.totals.ledgerChecks, 0)
    .toLocaleString(
      'en-US'
    )} fighter HP and Hope/Fear ledgers reconcile. Raw metrics: [results.json](results.json). Reproduce with \`node scripts/arena-azulis-report.js\`; delete or archive that results file first to rerun all cells (the runner resumes complete cells).\n\nAzulis: 230 HP, 190 Attack, six Stress, no passive. Regeneration spends one Stress for up to 14 HP, with the normal Duality/basic/critical sequence. Heal resolves on the player action before a surviving enemy response; it cannot rescue an already defeated fighter. S2 is 22% Attack (42 before modifiers), two Hope; S3 costs five Hope, timeout 30%, picks 35–55%, with the requested four-second choice window. AI Falling Star is fixed at 45%.\n\n## Policies and model\n\nAll fighters use the existing parity harness's common survival-aware, cheapest reliable immediate outcome check (including consuming Brink); no future random values are inspected. That check precedes healing in A/B/C. Other kits retain its common deterministic tactical fallback. This is a prescribed policy comparison, not an optimal-policy proof. Player Finishers consistently pick midpoint button 3. All cells restart the same seed stream; different decisions change subsequent random draws.\n\n- A, conservative: heal only at or below 35% HP and when at least 14 HP is missing, otherwise spend an available S3, then S2, then basic.\n- B, aggressive: heal whenever at least 14 HP is missing and Stress is available, otherwise the same offense order.\n- C, tactical: use the extended survival estimate, require a full useful heal and an estimated survival gain above 0.25 rounds; preserve the last Stress unless estimated survival is at most two rounds and healing still improves it. Otherwise use S3, S2, or basic.\n\nBoth roles use the same Azulis healing policy in each cell. Runtime Azulis AI uses C with the existing tactical lethal checks. Offline common reliable-outcome prioritization can differ from runtime AI choices. The mechanics are the current development mechanics; policy selection is modeled.\n\nInherited role differences are retained: players roll independent Duality dice and cap Hope at six, S2/S3 replace their basic, and critical success stores a doubled future basic. Enemies receive player-roll Fear plus their critical income; they have 85% basic accuracy / 5% critical chance, an ordinary basic alongside specials, and an 8% chance of recovering one Stress instead of responding below full Stress. Enemy S2 shares basic accuracy and critical scaling; its base coefficient remains 22%, identical to the player. Healing itself is unconditional once legally activated and never multiplied by accuracy, criticals, or vulnerability. Standard critical Stress recovery/removal remains separate from healing. Azulis AI S3 is guaranteed, noncritical, fixed 45% as requested; other AI Finishers retain their existing 35–45% roll. Existing Marq/Maxim role coefficients are unchanged. Hellfed still has no live AI: the existing isolated parity adapter supplies its enemy Rage/HP kit, with ordinary enemy action economy and no independent enemy Duality roll.\n\n## Azulis as player\n\n` +
  table(
    ['Opponent', 'Policy', 'Win %', 'Mean rounds', '10–20 rounds %'],
    forward.map((r) => [
      r.enemy,
      r.policy,
      f(r.winPercent),
      f(r.averageRounds),
      f(r.pacingPercent),
    ])
  ) +
  '\n\n## Reversed roles\n\n' +
  table(
    [
      'Player → Azulis AI',
      'Policy',
      'Azulis win %',
      'Mean rounds',
      '10–20 rounds %',
    ],
    rows
      .filter((r) => r.player !== 'Azulis')
      .map((r) => [
        r.player,
        r.policy,
        f(100 - r.winPercent),
        f(r.averageRounds),
        f(r.pacingPercent),
      ])
  ) +
  '\n\nEqual-role descriptive win rate against each opponent (average of Azulis player and enemy win percentages; this does not causally remove role bias):\n\n' +
  table(
    ['Opponent', 'A %', 'B %', 'C %'],
    ['Marq', 'Hellfed Marq', 'Maxim'].map((enemy) => [
      enemy,
      ...['A', 'B', 'C'].map((p) => {
        const a = rows.find(
            (r) => r.policy === p && r.player === 'Azulis' && r.enemy === enemy
          ),
          b = rows.find((r) => r.policy === p && r.player === enemy)
        return f((a.winPercent + 100 - b.winPercent) / 2)
      }),
    ])
  )
const sides = rows.flatMap((r) =>
  ['player', 'enemy'].map((side) => ({
    label: label(r),
    side,
    ...r.perFight[side],
  }))
)
text +=
  '\n\n## Sustain and exhaustion: both fighters\n\nAll numeric entries are per fight, except Stress at knockout (conditional on actually reaching zero HP), and exhaustion sample percentage. Zero-Stress samples count completed turns that include an opposing attack and end with zero Stress. For player defenders this is also the Stress used by the enemy attack, so the primary Azulis-as-player cells measure actual incoming attack exposure. For enemy defenders it is a turn-end proxy: their response can change Stress after the player attack, so reverse-role exhaustion values must not be interpreted as exact per-hit vulnerability. Recovery-only responses are excluded from the player exposure denominator. Hellfed has no Stress and is immune to exhaustion. Effective HP = initial max HP + all actual restoration (including Brink for Marq) − self-paid HP (Hellfed). It is available survivability, including unused remaining HP in wins; actual HP damage taken is also recorded in JSON. Healing columns isolate Regeneration. Cap waste is theoretical heal minus actual restoration. No policy deliberately heals for a partial amount.\n\n' +
  table(
    [
      'Cell',
      'Side',
      'S1 uses',
      'HP healed',
      'Cap waste',
      'Stress at KO',
      'Zero-Stress turn samples',
      'Sample %',
      'Effective HP',
    ],
    sides.map((r) => [
      r.label,
      r.side,
      ...[
        's1',
        'healed',
        'wasted',
        'stressAtKnockout',
        'zeroStressResponses',
        'zeroStressResponsePercent',
        'effectiveHp',
      ].map((k) => f(r[k])),
    ])
  )
text +=
  '\n\n## Offense and resource economy: both fighters\n\nDamage is raw delivered damage before overkill clipping, with existing vulnerability/critical modifiers. S2 buff damage for Maxim is attributed to S2 delivery, per the existing harness. Basic damage excludes S2 buff contribution. Hope/Fear generation and spending use each role’s native resource.\n\n' +
  table(
    [
      'Cell',
      'Side',
      'S2 uses',
      'S2 damage',
      'S3 uses',
      'S3 damage',
      'Basic damage/fight',
      'Basic damage/attempt',
      'Basic damage/hit',
      'Hope/Fear gained',
      'Hope/Fear spent',
    ],
    sides.map((r) => [
      r.label,
      r.side,
      ...[
        's2',
        's2Damage',
        's3',
        's3Damage',
        'basicDamage',
        'basicDamagePerAttempt',
        'basicDamagePerHit',
        'hopeGenerated',
        'hopeSpent',
      ].map((k) => f(r[k])),
    ])
  )
text += '\n\n## Interpretation\n\n'
for (const enemy of ['Marq', 'Hellfed Marq', 'Maxim', 'Azulis']) {
  const rs = forward
    .filter((r) => r.enemy === enemy)
    .sort((a, b) => b.winPercent - a.winPercent)
  text += `Against ${enemy} in the player role, ${rs
    .map(
      (r) =>
        `${r.policy}: ${f(r.winPercent)}% wins / ${f(r.averageRounds)} rounds`
    )
    .join('; ')}. The highest measured player rate is ${
    rs[0].policy
  }; comparisons below roughly one percentage point should be treated cautiously at this sample size.\n\n`
}
for (const p of ['A', 'B', 'C']) {
  const rs = forward.filter((r) => r.policy === p),
    avg = (k) => rs.reduce((n, r) => n + r.perFight.player[k], 0) / rs.length
  text += `Policy ${p}, equally weighted across four player matchups: ${f(
    avg('s1')
  )} heals restore ${f(avg('healed'))} HP; ${f(
    avg('hopeGenerated')
  )} Hope generated and ${f(avg('hopeSpent'))} spent; effective HP ${f(
    avg('effectiveHp')
  )}.\n\n`
}
text +=
  'A 14-HP heal should be judged against both incoming basics and special bursts, rather than only its percentage of maximum HP. Zero-Stress exposure and conditional Stress at knockout show whether reserving Stress matters. S2 offers 21 unmodified damage per Hope versus midpoint S3’s 17.2, but uses more player actions and forgoes basic Hope generation, so it cannot be ranked by damage per Hope alone. Healing S1 retains a normal basic and a Hope/Fear roll, unlike S2/S3. This audit compares complete policies and does not isolate a causal no-heal counterfactual. The same-policy mirror is affected by role asymmetry and is not a fair-coin calibration. No stat or coefficient changes follow automatically from these results.\n'
text +=
  '\n\n## Design verdict\n\nMarq means Spooky Marq throughout this report. Tactical C is the strongest measured player policy against all three fixed nonmirror opponents: 32.67% versus Spooky Marq, 49.05% versus Hellfed, and 30.35% versus Maxim. It improves on A by 2.34, 6.92 and 2.81 percentage points, respectively. This is a consistent advantage among these three prescribed player policies, not proof of a globally dominant or optimal strategy. In the reversed Spooky matchup, conservative Azulis AI wins 57.38% versus tactical 56.47%, a small 0.91-point difference. A mirror in which both fighters change policy cannot establish policy superiority from the player win percentage.\n\nHealing is strategically significant: C restores 70.51–81.65 actual HP per player fight, raising available effective HP from 230 to 300.51–311.65. Its 14-HP activation is roughly one average attacking enemy response against Spooky (15.72 actual HP damage) or Hellfed (15.99), but less than one against Maxim (22.97). These means include misses, specials and clipped killing damage, and exclude enemy recovery responses; individual Finisher bursts remain much larger than one heal. All cap waste is zero because the tested policies require a full useful heal; partial healing remains legal and is covered by automated tests.\n\nStress exhaustion provides a real restraint. Against Spooky, B heals 80.58 HP instead of A’s 57.90, but exhaustion exposure rises from 12.95% to 53.15% of enemy attacks and its win rate falls 4.89 points. C restores 70.51 HP there while limiting exposure to 20.37%. Across the four player cells, B restores the most HP but generates 7.67 Hope versus A’s 7.80 and C’s 7.93: more healing alone does not create a stronger Hope engine. C spends 7.37 Hope on average, versus 6.87 under A. These are whole-policy comparisons, not an isolated causal estimate of adding S1.\n\nStarlight supplies most special offense under C: 2.41–3.88 uses and 105.22–173.62 damage per fight against the three other fighters. Falling Star is rarely chosen under this efficient lethal/spend policy (0.02–0.13 uses); that does not make it unavailable. The 42-damage S2 supports the sustain plan and near parity against Hellfed, but the player-role win rates do not establish full compensation against Spooky or Maxim. Descriptive equal-role C rates are 44.57%, 47.47% and 47.66% against Spooky, Hellfed and Maxim; they are not causal normalization for inherited role differences.\n\nPacing is the main unresolved design cost. C averages 13.99 rounds versus Maxim, 17.01 versus Hellfed, 19.55 versus Spooky and 22.30 in the mirror. Only 29.28% of tactical mirrors end in 10–20 rounds, versus 92.55% against Maxim and 92.96% against Hellfed. The heal creates a distinct, finite sustain tradeoff without endless fights, but does not achieve a roughly 15-round target across all matchups. No HP, Attack, healing percentage, damage coefficients or existing fighter mechanics were changed in response to these results.\n'
// The dated design verdict records this exact dataset. Fail rather than attach
// those conclusions to a future ruleset or changed simulation output.
if (
  require('node:crypto')
    .createHash('sha256')
    .update(JSON.stringify(rows))
    .digest('hex') !==
  'b63d86e0520c1c02b3def0a8261926b44cbfb43d132cf3e47faf922d205c62cb'
)
  throw Error(
    'Dataset changed: review and update the dated design verdict before publishing it'
  )
fs.writeFileSync('artifacts/azulis/analysis.md', text)
console.log(
  table(
    ['Opponent', 'Policy', 'Win %', 'Rounds'],
    forward.map((r) => [r.enemy, r.policy, f(r.winPercent), f(r.averageRounds)])
  )
)
