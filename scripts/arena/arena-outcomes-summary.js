const fs = require('node:fs')
const directory = 'artifacts/arena-outcomes'
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const rows = read(`${directory}/results.json`).sort(
  (a, b) =>
    a.policy.localeCompare(b.policy) ||
    a.player.localeCompare(b.player) ||
    a.enemy.localeCompare(b.enemy)
)
if (
  rows.length !== 30 ||
  rows.some((r) => r.trials !== 10000 || r.totals.ledgerChecks !== 20000)
)
  throw Error('Expected 30 complete cohorts with reconciled fighter ledgers')
const previous = [
  ...read('artifacts/arena-parity/results.json').map((r) => ({
    ...r,
    policy: 'C',
  })),
  ...read('artifacts/azulis/results.json'),
]
const f = (n) => (n == null ? '—' : n.toFixed(2))
const table = (headers, data) =>
  [
    '| ' + headers.join(' | ') + ' |',
    '| ' + headers.map(() => '---').join(' | ') + ' |',
    ...data.map((r) => '| ' + r.join(' | ') + ' |'),
  ].join('\n')
const label = (r) => `${r.policy}: ${r.player} → ${r.enemy}`
const names = ['Marq', 'Hellfed Marq', 'Maxim', 'Azulis']
const current = rows.filter((r) => r.policy === 'C')
const mean = (data, key) => data.reduce((n, r) => n + r[key], 0) / data.length
const oldFor = (r) =>
  previous.find(
    (p) => p.policy === r.policy && p.player === r.player && p.enemy === r.enemy
  )
const oldC = current.map(oldFor)
let text =
  `# Arena Block and immediate critical: Level 1 audit

300,000 seeded offline fights; 30 ordered matchup/policy cohorts, 10,000 each; seed 271828. All 600,000 fighter HP and Hope/Fear ledgers reconcile. No HP, Attack, cost, ability coefficient, or AI accuracy was tuned. Raw metrics for both fighters are in [results.json](results.json); frozen model hashes are in [model-source-hashes.json](model-source-hashes.json). Reproduce with \`node scripts/arena-outcomes-report.js\`, then \`node scripts/arena-outcomes-summary.js\`. The runner resumes completed cells and rejects changed source hashes; archive its results and hash file to start a fresh run.

## Main results

Across the equally weighted 16 tactical C ordered matchups, mean duration changed from ${f(
    mean(oldC, 'averageRounds')
  )} to ${f(mean(current, 'averageRounds'))} rounds (${f(
    100 * (mean(current, 'averageRounds') / mean(oldC, 'averageRounds') - 1)
  )}%). The share lasting 10–20 rounds changed from ${f(
    mean(oldC, 'pacingPercent')
  )}% to ${f(
    mean(current, 'pacingPercent')
  )}%. This is a bundled outcome revision: player offensive specials now roll Duality and generate its resources as well as receiving Block and immediate-critical resolution. Duration and win-rate changes cannot be attributed to chip damage or critical timing alone.

## Model and policy

Marq means Spooky Marq. All fighters are Level 1. Both roles use the parity harness's survival-aware cheapest reliable immediate outcome check before their usual tactical decisions. Player Finishers pick the midpoint button. Policies inspect current state and outcome distributions, never future random draws. Different choices diverge within the same seed stream. This is a prescribed policy comparison, not proof of optimal play or a globally dominant healing strategy. Sampling uncertainty for a 10,000-fight win rate is roughly ±1 percentage point near 50% (95% binomial interval); cohorts sharing seeds are not independent experiments.

- A: Azulis heals at or below 35% HP when the full 14 HP can be used, otherwise S3, S2, basic.
- B: Azulis heals whenever at least 14 HP is missing and Stress is available, otherwise the same offense order.
- C: Azulis requires a full useful heal and estimated survival improvement above 0.25 rounds; preserves the last Stress unless estimated survival is at most two rounds and healing still improves it. Uses existing tactical offense otherwise.

The common cheapest reliable lethal check precedes healing for all three policies. Both Azulis roles use the selected policy. Other fighters use C throughout. Runtime AI and the offline common policy can choose differently.

## Rules modeled

Failure is Block: ceil(25% of the resolved normal damage). A blocked basic excludes hit-only Slayer/Opportunity bonuses, preserves their charges and hit-based cooldowns, and suppresses offensive on-hit Stress removal. An ordinary landed attack deals 100%; current Critical Success deals 200% immediately, grants one Hope (enemy Fear), recovers one own Stress, and removes one opposing Stress. No critical damage is stored. Existing modifier order and final rounding remain in force. Finishers remain guaranteed, noncritical, with their existing costs, timers and coefficients.

Each direct non-Finisher player special rolls one Duality for its own attack and normal Hope/Fear, without adding a basic attack. Pure buff activations do not roll. Regeneration remains unconditional healing plus its established basic, whose outcome cannot cancel the healing. Existing guaranteed Stoke basics remain guaranteed through existing metadata; ordinary Hellfed basics can Block and decay Rage as before misses did. No new Pierce, Bleed or Poison mechanics were added. Unconditional effects are independent; effects requiring a landed hit are gated centrally.

Inherited role differences remain: enemy attacks use 85% accuracy and 5% conditional critical chance, enemies ordinarily deliver a basic alongside a special, and can recover one Stress instead of attacking with 8% probability when below full Stress. Player Duality gives Block on 50/144 outcomes and Critical Success on 12/144. Enemy Fear includes player Fear outcomes plus enemy critical income; player Hope caps at six. Azulis S2 is 22% Attack for both roles; its AI S3 is fixed 45%, other AI Finishers retain 35–45%. Existing Marq/Maxim role coefficients remain unchanged. Hellfed has no live AI: reverse-role cells use the established isolated in-memory enemy Rage adapter. Mirror win rates expose role bias and must not be interpreted as equal-role kit strength.

## Tactical C matrices

Player win percentage (row = player, column = enemy):

` +
  table(
    ['Player', ...names],
    names.map((p) => [
      p,
      ...names.map((e) =>
        f(current.find((r) => r.player === p && r.enemy === e).winPercent)
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
        f(current.find((r) => r.player === p && r.enemy === e).averageRounds)
      ),
    ])
  )
text +=
  '\n\n## Every cohort: previous → current\n\nHistorical files are preserved. Non-Azulis C baselines come from the prior parity audit; Azulis baselines come from its 21-cohort healing audit. Policies retain the same definitions, but modern outcome previews and resources necessarily change their choices. Delta is current minus previous; win delta is percentage points.\n\n' +
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
      if (!old) throw Error(`Missing baseline ${label(r)}`)
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
const forward = rows.filter((r) => r.player === 'Azulis')
text +=
  '\n\n## Healing policy comparison: Azulis player\n\n' +
  table(
    [
      'Opponent',
      'Policy',
      'Win %',
      'Rounds',
      '10–20 %',
      'S1 uses',
      'HP healed',
      'Cap waste',
      'Hope gained',
      'Hope spent',
    ],
    forward.map((r) => {
      const s = r.perFight.player
      return [
        r.enemy,
        r.policy,
        f(r.winPercent),
        f(r.averageRounds),
        f(r.pacingPercent),
        f(s.s1),
        f(s.healed),
        f(s.wasted),
        f(s.hopeGenerated),
        f(s.hopeSpent),
      ]
    })
  )
text +=
  '\n\nReverse-role Azulis win rates and durations are the complement and same duration of the relevant rows above. Equal-role descriptive averages (Azulis player win plus Azulis enemy win divided by two; this does not causally remove role bias):\n\n' +
  table(
    ['Opponent', 'A %', 'B %', 'C %'],
    names
      .filter((n) => n !== 'Azulis')
      .map((enemy) => [
        enemy,
        ...['A', 'B', 'C'].map((policy) => {
          const a = rows.find(
              (r) =>
                r.policy === policy &&
                r.player === 'Azulis' &&
                r.enemy === enemy
            ),
            b = rows.find(
              (r) =>
                r.policy === policy &&
                r.player === enemy &&
                r.enemy === 'Azulis'
            )
          return f((a.winPercent + 100 - b.winPercent) / 2)
        }),
      ])
  )
const sides = rows.flatMap((r) =>
  ['player', 'enemy'].map((side) => ({
    cell: label(r),
    side,
    ...r.perFight[side],
  }))
)
text +=
  '\n\n## Sustain and resource exposure: every fighter\n\nValues are per fight except Stress at knockout (conditional on knockout) and zero-Stress exposure percentage. For player defenders, exposure samples actual attacking enemy responses at damage-time Stress, excluding recovery-only responses. For enemy defenders, samples are player action opportunities at player-action Stress; these include buff-only activations. These role-specific samples estimate resource exposure, not elapsed wall-clock time or a uniform incoming-hit denominator. Historical enemy exhaustion was a turn-end proxy, so do not compare its percentage directly with this revision. Hellfed uses Rage and is immune to exhaustion. Effective HP = initial max HP + actual restoration (including Brink) − self-paid HP; it includes unused remaining HP in wins. Actual damage taken is also recorded in JSON. Healing and waste isolate Regeneration; critical Stress recovery does not count as healing.\n\n' +
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
      'HP damage taken',
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
      f(s.hpDamageTaken),
    ])
  )
text +=
  '\n\n## Offense: every fighter\n\nDamage columns are actual delivered combat damage, including modifiers/Block/criticals and any overkill, before clamping target HP. Basic per attempt includes blocked attacks; basic per landed hit is a diagnostic ratio of all basic damage to landed hits and includes chip in its numerator. S1 damage includes offensive special damage only; Azulis S1 has zero special damage.\n\n' +
  table(
    [
      'Cell',
      'Side',
      'S1 damage',
      'S2 uses',
      'S2 damage',
      'S3 uses',
      'S3 damage',
      'Basic total',
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
text +=
  '\n\n## Design interpretation\n\nThe following tactical C player-side values put the 14 HP heal beside delivered incoming damage per attacking enemy response (including overkill). This is a descriptive action average, not a prediction for the next attack. Hope comparisons use the same historical C cells; the new direct-special Duality income confounds any attempt to attribute increased income solely to healing.\n\n' +
  table(
    [
      'Opponent',
      'Incoming / response',
      'HP healed / fight',
      'Old Hope gained',
      'New Hope gained',
      'S2 damage / use',
      '0 Stress exposure %',
    ],
    forward
      .filter((r) => r.policy === 'C')
      .map((r) => {
        const s = r.perFight.player,
          e = r.perFight.enemy,
          old = oldFor(r).perFight.player
        return [
          r.enemy,
          f(
            (e.basicDamage + e.s1Damage + e.s2Damage + e.s3Damage) / s.responses
          ),
          f(s.healed),
          f(old.hopeGenerated),
          f(s.hopeGenerated),
          f(s.s2Damage / s.s2),
          f(s.zeroStressResponsePercent),
        ]
      })
  )
text +=
  '\n\nHighest measured Azulis player win policy per opponent: ' +
  names
    .map((enemy) => {
      const ranked = forward
        .filter((r) => r.enemy === enemy)
        .sort((a, b) => b.winPercent - a.winPercent)
      return `${enemy}: ${ranked[0].policy} (${f(
        ranked[0].winPercent
      )}%, lead ${f(ranked[0].winPercent - ranked[1].winPercent)} pp)`
    })
    .join('; ') +
  '. Small gaps near the sampling interval do not establish a robust advantage. Reverse-role and equal-role tables above are necessary before claiming a dominant strategy.\n\nThe heal is a meaningful fraction of an ordinary incoming response, but a 14 HP restoration cannot be treated as a guaranteed extra round against an imminent large special. Repeated healing raises available effective HP while spending Stress; last-Stress preservation and the existing 25% vulnerability make that expenditure consequential. All tested healing policies require the full useful heal, so cap waste should be zero; the audit does not claim partial healing is never tactically useful.\n\nStarlight retains its 42 base damage for two Hope, now subject to immediate criticals and Block. Its actual per-use contribution is shown above. Win rates alone do not isolate whether 22% is sufficient compensation for losing offensive S1; that would require a deliberate counterfactual kit comparison. Azulis remains strategically distinct through guaranteed support healing and critical Stress recovery, with uneven competitiveness across matchups and roles. The tactical mirror still exceeds 15 rounds, so pacing is improved without being uniformly at the target.\n\nNo automatic balance changes follow from this audit. Assess competitive strength across both roles and human play, with special attention to AI action economy and the changed resource income from offensive player specials. The results provide the new baseline for future deliberate tuning.\n'
const reverseSpooky = rows.filter(
  (r) => r.player === 'Marq' && r.enemy === 'Azulis'
)
text += `\nNo single healing policy dominates all tested ordered matchups. For example, Azulis AI against Spooky Marq wins ${f(
  100 - reverseSpooky.find((r) => r.policy === 'A').winPercent
)}% with conservative A versus ${f(
  100 - reverseSpooky.find((r) => r.policy === 'C').winPercent
)}% with tactical C. This contrasts with the player-side C advantage over A and reinforces the role-dependent conclusion.\n`
fs.writeFileSync(`${directory}/analysis.md`, text)
console.log(
  JSON.stringify({
    cohorts: rows.length,
    fights: rows.reduce((n, r) => n + r.trials, 0),
    fighterLedgers: rows.reduce((n, r) => n + r.totals.ledgerChecks, 0),
    oldMeanRounds: mean(oldC, 'averageRounds'),
    newMeanRounds: mean(current, 'averageRounds'),
  })
)
