const fs = require('node:fs'),
  assert = require('node:assert/strict')
const directory = 'artifacts/arena-role-asymmetry',
  rows = JSON.parse(fs.readFileSync(directory + '/results.json'))
assert.equal(rows.length, 40, 'Require all cohorts')
const average = (rs, get) => rs.reduce((n, r) => n + get(r), 0) / rs.length,
  number = (n, d = 2) => (n === null ? '—' : n.toFixed(d)),
  names = ['Marq', 'Hellfed Marq', 'Maxim', 'Azulis', 'Hendrix'],
  scenarios = ['baseline', 'enemy-first', 'matched-rolls', 'both']
function group(rs) {
  const sides = {}
  for (const side of ['player', 'enemy']) {
    const s = Object.fromEntries(
      Object.keys(rs[0].perFight[side])
        .filter((k) => typeof rs[0].perFight[side][k] === 'number')
        .map((k) => [k, average(rs, (r) => r.perFight[side][k])])
    )
    const a = Object.fromEntries(
      Object.keys(rs[0].perFight[side].audit)
        .filter((k) => !k.endsWith('Average'))
        .map((k) => [k, average(rs, (r) => r.perFight[side].audit[k])])
    )
    a.loserBasicsAverage = a.loserBasicPackets / a.losses
    a.loserSpecialsAverage = a.loserSpecialPackets / a.losses
    a.basicCriticalPercent = (100 * a.criticals) / a.basicPackets
    a.basicBlockPercent = (100 * a.blockedBasics) / a.basicPackets
    a.specialDamage = s.s1Damage + s.s2Damage + s.s3Damage
    a.actualSpecialHp = a.hpS1 + a.hpS2 + a.hpS3
    a.basicDamagePerAttempt = s.basicDamage / s.basicAttempts
    a.allAttackPackets = a.basicPackets + a.directSpecialPackets
    a.prevented = a.basicPrevented + a.specialPrevented
    sides[side] = { ...s, audit: a }
  }
  return {
    cohorts: rs.length,
    fights: rs.length * 10000,
    playerWinPercent: average(rs, (r) => r.winPercent),
    rounds: average(rs, (r) => r.averageRounds),
    pacingPercent: average(rs, (r) => r.pacingPercent),
    sides,
  }
}
const baseline = rows.filter((r) => r.scenario === 'baseline'),
  finished = baseline.filter(
    (r) => r.player !== 'Hendrix' && r.enemy !== 'Hendrix'
  ),
  mirrors = Object.fromEntries(
    names.map((name) => [
      name,
      Object.fromEntries(
        scenarios.map((s) => [
          s,
          group(
            rows.filter(
              (r) => r.scenario === s && r.player === name && r.enemy === name
            )
          ),
        ])
      ),
    ])
  ),
  factorial = Object.fromEntries(
    scenarios.map((s) => [
      s,
      group(
        rows.filter(
          (r) =>
            r.scenario === s && r.player === r.enemy && r.player !== 'Hendrix'
        )
      ),
    ])
  )
const comparisons = Object.fromEntries(
  names.map((name) => {
    const m = mirrors[name],
      b = m.baseline.playerWinPercent,
      i = m['enemy-first'].playerWinPercent,
      o = m['matched-rolls'].playerWinPercent,
      c = m.both.playerWinPercent
    return [
      name,
      {
        initiativeChange: i - b,
        matchedOutcomeChange: o - b,
        combinedChange: c - b,
        interaction: c - i - o + b,
        balancedInitiativeNativeOutcomes: (b + i) / 2,
        balancedInitiativeMatchedOutcomes: (o + c) / 2,
      },
    ]
  })
)
const summary = {
  baselineAllFive: group(baseline),
  baselineFinishedFour: group(finished),
  mirrors,
  factorialFinishedMirrors: factorial,
  comparisons,
}
const p = summary.baselineFinishedFour.sides.player,
  e = summary.baselineFinishedFour.sides.enemy,
  pRate = p.basicDamage / p.basicAttempts,
  eRate = e.basicDamage / e.basicAttempts
summary.basicGapAccounting = {
  total: p.basicDamage - e.basicDamage,
  attackCountContribution:
    ((p.basicAttempts - e.basicAttempts) * (pRate + eRate)) / 2,
  damagePerAttemptContribution:
    ((pRate - eRate) * (p.basicAttempts + e.basicAttempts)) / 2,
  playerBasicDamagePerAttempt: pRate,
  enemyBasicDamagePerAttempt: eRate,
  enemySkippedTerminalActions: e.audit.terminalSkippedActions,
  enemyRecoveryActions: e.audit.recoveryActions,
  playerNonBasicActions: summary.baselineFinishedFour.rounds - p.basicAttempts,
}
assert(
  Math.abs(
    summary.basicGapAccounting.total -
      summary.basicGapAccounting.attackCountContribution -
      summary.basicGapAccounting.damagePerAttemptContribution
  ) < 1e-9
)
fs.writeFileSync(directory + '/summary.json', JSON.stringify(summary, null, 2))
const lines = [
  '# Arena role asymmetry: fixed Block candidate',
  '',
  '400,000 new Level 1 seeded fights: 25 baseline ordered matchups plus three diagnostic conditions for each of five mirrors; 10,000 fights per cohort. Seed 271828, shared survival-aware cheapest-reliable policy. Hendrix remains an unfinished template. No live changes or character coefficient changes.',
  '',
  '## Fixed rules and experimental controls',
  '',
  'Block deals ceil(75% normal basic damage) or ceil(50% normal special damage), after existing modifiers. Finishers are unblockable. Specials never critical; blocked basics never critical. Guaranteed Stoke and guaranteed Regeneration remain unchanged. No additional unblocked critical suppression is invented.',
  '',
  'Baseline retains player-first initiative, player Duality and native enemy 85% accuracy / 5% critical chance conditional on landing. Enemy-first reverses the two sequential actor steps: the survivor chooses using updated public state. This also changes when newly generated Fear can be spent; it is a whole-initiative intervention, not merely an extra opening hit.',
  '',
  'Matched rolls changes only enemy attack outcomes to two independent uniform d12s with the existing DC12: matching dice critical, otherwise sum>=12 lands. Guaranteed Stoke still lands failed rolls. Tactical outcome previews and associated probability heuristics follow the diagnostic distribution. These enemy dice do NOT grant extra Hope/Fear: native player-Duality income and existing enemy critical income remain. Both combines these interventions. This is a diagnostic, not a proposed live rules rewrite.',
  '',
  'Every baseline cohort exactly reproduces the previous Block proposal’s wins, rounds, pacing, HP/resource ledgers, and checked damage/resource aggregates. Extra observer metadata consumes no RNG. The same trial seeds are used across conditions, but interventions change RNG consumption and subsequent decisions; outcomes are not identical roll-by-roll paired histories.',
  '',
  '## Baseline damage and opportunity accounting',
  '',
  'Finished four-character roster (16 equally weighted ordered matchups): ' +
    number(summary.baselineFinishedFour.playerWinPercent) +
    '% player wins, ' +
    number(summary.baselineFinishedFour.rounds) +
    ' rounds, ' +
    number(summary.baselineFinishedFour.pacingPercent) +
    '% within 10–20 rounds. All five including Hendrix: ' +
    number(summary.baselineAllFive.playerWinPercent) +
    '% player wins, ' +
    number(summary.baselineAllFive.rounds) +
    ' rounds.',
  '',
  '| Finished roster metric, per fight unless stated | Player | Enemy |',
  '|---|---:|---:|',
]
const metricRows = [
  ['Basic attacks delivered', (s) => s.basicAttempts],
  ['Direct special attack packets', (s) => s.audit.directSpecialPackets],
  ['All attack packets', (s) => s.audit.allAttackPackets],
  ['Basic damage (base contribution)', (s) => s.basicDamage],
  [
    'Special damage (S1+S2+S3, including Slayer bonus)',
    (s) => s.audit.specialDamage,
  ],
  ['Actual HP removed by basics', (s) => s.audit.hpBasic],
  ['Actual HP removed by specials', (s) => s.audit.actualSpecialHp],
  ['Blocked basics', (s) => s.audit.blockedBasics],
  ['Blocked direct specials', (s) => s.audit.blockedSpecials],
  ['Basic damage lost to opponent’s Block', (s) => s.audit.basicPrevented],
  ['Special damage lost to opponent’s Block', (s) => s.audit.specialPrevented],
  ['Total damage lost to opponent’s Block', (s) => s.audit.prevented],
  ['Critical basics', (s) => s.audit.criticals],
  ['Criticals per 100 basic attempts', (s) => s.audit.basicCriticalPercent],
  ['Immediate extra damage from criticals', (s) => s.audit.criticalExtra],
  ['Stress recovered by criticals', (s) => s.audit.criticalStressRecovery],
  [
    'Opponent Stress removed by criticals',
    (s) => s.audit.criticalStressRemoval,
  ],
  ['Basic damage per attempt', (s) => s.audit.basicDamagePerAttempt],
  ['S1 uses', (s) => s.s1],
  ['S1 damage', (s) => s.s1Damage],
  ['S2 uses', (s) => s.s2],
  ['S2 damage including Slayer', (s) => s.s2Damage],
  ['S3 uses', (s) => s.s3],
  ['S3 damage', (s) => s.s3Damage],
  ['Hope / Fear generated', (s) => s.hopeGenerated],
  ['Hope / Fear spent', (s) => s.hopeSpent],
  ['Recovery-only actions', (s) => s.audit.recoveryActions],
  [
    'Final action skipped after opponent KO',
    (s) => s.audit.terminalSkippedActions,
  ],
  [
    'Basics delivered before own KO (losers only)',
    (s) => s.audit.loserBasicsAverage,
  ],
  [
    'Direct specials before own KO (losers only)',
    (s) => s.audit.loserSpecialsAverage,
  ],
]
for (const [label, get] of metricRows)
  lines.push(
    `| ${label} | ${number(
      get(summary.baselineFinishedFour.sides.player),
      3
    )} | ${number(get(summary.baselineFinishedFour.sides.enemy), 3)} |`
  )
lines.push(
  '',
  'Damage totals above are potential delivered damage, including overkill; actual HP removed is separately capped. Base basic damage excludes Slayer; Slayer’s delivered bonus belongs to S2 in the existing statistics. Packet-level basic totals in JSON/CSV include Slayer and must not be added to S2 totals (that would double-count). Direct special packet counts exclude support activations and Slayer deliveries. Block prevention is damage removed from the column’s attacks, benefiting the opposite defender. It compares each actual blocked packet against its pre-Block damage with the same modifiers and rounding; it excludes hypothetical lost on-hit effects and is not a rerun with Block removed. Critical extra is immediate multiplier damage only, at the actual resolved state; it does not estimate downstream resource effects.',
  '',
  `The player basic-damage advantage is ${number(
    summary.basicGapAccounting.total
  )} per fight. An exact symmetric algebraic decomposition assigns ${number(
    summary.basicGapAccounting.attackCountContribution
  )} to attack count and ${number(
    summary.basicGapAccounting.damagePerAttemptContribution
  )} to damage per attempt. Player/enemy base basic damage per attempt is ${number(
    pRate,
    4
  )}/${number(
    eRate,
    4
  )}. Thus the observed total basic advantage comes from delivery frequency, despite slightly lower player damage per attempt. This decomposition describes observed output and is not a causal no-critical or no-initiative counterfactual.`,
  '',
  `Enemy attack opportunities lost per fight: ${number(
    e.audit.terminalSkippedActions,
    4
  )} final responses after player knockouts plus ${number(
    e.audit.recoveryActions,
    4
  )} recovery actions. Player non-basic turns: ${number(
    summary.basicGapAccounting.playerNonBasicActions,
    4
  )} (Slayer support). Their difference accounts for the basic-attempt gap. Crit-frequency and Block differences affect damage, Stress, decisions, and later fight length in addition to this turn accounting.`,
  '',
  '## Mirror controls: player win rate',
  '',
  '| Character | Baseline | Enemy first | Matched outcomes | Both | Initiative delta | Outcome delta | Interaction |',
  '|---|---:|---:|---:|---:|---:|---:|---:|'
)
for (const name of names) {
  const m = mirrors[name],
    d = comparisons[name]
  lines.push(
    `| ${name} | ${scenarios
      .map((s) => number(m[s].playerWinPercent) + '%')
      .join(' | ')} | ${number(d.initiativeChange)} pp | ${number(
      d.matchedOutcomeChange
    )} pp | ${number(d.interaction)} pp |`
  )
}
lines.push(
  '',
  'Interaction = both - enemy-first - matched-outcomes + baseline, in percentage points. The two effects must not be added as independent balance corrections. With 10,000 trials, a single near-50% win estimate has roughly ±1 percentage point binomial 95% sampling uncertainty; small differences are not conclusive.',
  '',
  '## Finished mirror aggregate',
  '',
  '| Condition | Player wins | Rounds | 10–20 rounds | Player basics | Enemy basics | Player basic damage | Enemy basic damage | Player special damage | Enemy special damage |',
  '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|'
)
for (const s of scenarios) {
  const g = factorial[s],
    p = g.sides.player,
    e = g.sides.enemy
  lines.push(
    `| ${s} | ${number(g.playerWinPercent)}% | ${number(g.rounds)} | ${number(
      g.pacingPercent
    )}% | ${number(p.basicAttempts)} | ${number(e.basicAttempts)} | ${number(
      p.basicDamage
    )} | ${number(e.basicDamage)} | ${number(p.audit.specialDamage)} | ${number(
      e.audit.specialDamage
    )} |`
  )
}
const spooky = mirrors.Marq.baseline.sides,
  spookyP = spooky.player,
  spookyE = spooky.enemy
lines.push(
  '',
  '## Spooky mirror: where the extra output comes from',
  '',
  `Player/enemy basics: ${number(spookyP.basicAttempts, 4)}/${number(
    spookyE.basicAttempts,
    4
  )} per fight, delivering ${number(spookyP.basicDamage)}/${number(
    spookyE.basicDamage
  )} base damage (${number(
    spookyP.basicDamage / spookyP.basicAttempts,
    4
  )}/${number(
    spookyE.basicDamage / spookyE.basicAttempts,
    4
  )} per attempt). Enemy recovery-only actions cost ${number(
    spookyE.audit.recoveryActions,
    4
  )} basics; final player knockouts suppress ${number(
    spookyE.audit.terminalSkippedActions,
    4
  )} more responses. Together these exactly account for the basic-count deficit.`,
  '',
  `Player/enemy S1 damage: ${number(spookyP.s1Damage)}/${number(
    spookyE.s1Damage
  )}; S2: ${number(spookyP.s2Damage)}/${number(spookyE.s2Damage)}; S3: ${number(
    spookyP.s3Damage
  )}/${number(
    spookyE.s3Damage
  )}. This separates the player Finisher advantage from enemy S1/S2 output rather than attributing the entire mirror result to Spooky's damage coefficients.`,
  '',
  `Keeping native outcome rules but mixing player-first and enemy-first games 50/50 yields an estimated ${number(
    comparisons.Marq.balancedInitiativeNativeOutcomes
  )}% player win rate. Mixing the two matched-outcome conditions yields ${number(
    comparisons.Marq.balancedInitiativeMatchedOutcomes
  )}%. These are weighted averages of measured cohorts, not additional simulations; they illustrate that first-mover advantage and residual role advantage are different questions.`
)
lines.push(
  '',
  '## Why softened Block shifts the role advantage',
  '',
  'Ordinary player basics: 50/144 = 34.722% Blocks and 12/144 = 8.333% criticals. Ordinary enemy basics: 15% Blocks and 85% × 5% = 4.25% criticals per attempt. Guaranteed Stoke lowers observed Block frequency for both roles. Blocked attacks already cannot critical, so blocked-critical frequency is zero in both models.',
  '',
  'A clean unbuffed 6-damage basic becomes 2 on old Block and 5 on proposed Block (rounding makes the actual reduction 16.67%). Expected damage per ordinary player basic rises 5.1111→6.1528 (+1.0417); enemy rises 5.655→6.105 (+0.45). That is a +0.5917 damage-per-attempt relative swing toward the player without changing any character coefficient. This arithmetic isolates damage only; it excludes resource/Stress effects, specials, passives, or initiative.',
  '',
  'Native player Hope income is 78/144 = 54.167% per Duality activation, including matching dice; Fear income is 66/144 = 45.833%, plus enemy critical rewards when an enemy attack happens. Criticals also restore/remove Stress before damage and can change exhaustion exposure. Equalizing hit chance alone does not equalize these systems.',
  '',
  'Other inherited role differences remain in every control: enemy-only 8% Stress-recovery actions replace an attack; player Maxim Slayer activation has no basic while enemy activation includes one; player simulated S3 uses button3 (45%) whereas native enemy S3 samples 35–45% (mean40%), except Azulis fixed45%; native resource timing/caps and policy reactions persist. None is silently corrected. These controls identify two major mechanisms, not a fully symmetric combat model.',
  '',
  '## All baseline matchups',
  '',
  '| Player | Enemy | Player wins | Rounds | Player basic damage | Enemy basic damage | Player special damage | Enemy special damage | P basic blocks | E basic blocks | P prevented | E prevented |',
  '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|'
)
for (const r of baseline) {
  const p = r.perFight.player,
    e = r.perFight.enemy
  lines.push(
    `| ${r.player} | ${r.enemy} | ${number(r.winPercent)}% | ${number(
      r.averageRounds
    )} | ${number(p.basicDamage)} | ${number(e.basicDamage)} | ${number(
      p.s1Damage + p.s2Damage + p.s3Damage
    )} | ${number(e.s1Damage + e.s2Damage + e.s3Damage)} | ${number(
      p.audit.blockedBasics
    )} | ${number(e.audit.blockedBasics)} | ${number(
      p.audit.basicPrevented + p.audit.specialPrevented
    )} | ${number(e.audit.basicPrevented + e.audit.specialPrevented)} |`
  )
}
lines.push(
  '',
  '## Decision',
  '',
  'Retain the fixed Block candidate offline and leave character damage untouched. The observed basic-output advantage is an attack-count advantage; initiative and attack-outcome rules produce measurable, kit-dependent win-rate effects. Spooky’s mirror falls from 58.64% to 51.61% under the combined diagnostic. This supports investigating role rules before changing his damage, while not proving his matchups are balanced.',
  '',
  'Matched outcomes jointly change accuracy, criticals, on-hit opportunities, and critical resource/Stress effects. Their win-rate delta cannot be assigned to critical frequency alone. Enemy recovery’s lost attacks are directly counted, but a no-recovery causal balance effect is not estimated here: recovery also grants useful Stress. The combined finished-mirror mean of 50.34% still hides Maxim 52.55% and Azulis 47.14%. No single global fairness correction is established by this audit.',
  '',
  '## Validation and scope',
  '',
  '400,000 fights, 800,000 HP/resource fighter ledgers in the inherited runner and 800,000 additional Stress/source-HP ledgers. Every observed Block satisfies the fixed ceil75/50 formula; no special critical, blocked critical, or blocked Finisher. Exhaustive 144 enemy dice pairs validate matched outcomes and expected-damage preview; forced lethal openings verify first-actor knockout suppression in both orders. All frozen model and 53 live candidate hashes unchanged. No PM2, DB, registry, deployment, or production actions.',
  '',
  'Machine-readable outputs: results.json (40 cohorts, all per-side metrics), results.csv (80 role rows), summary.json (finished/all-five aggregates, mirrors and factorial effects), verification.json. Historical Block comparison remains intact. Outcome matching and initiative reversal are offline diagnostics only; the retained development candidate remains offline pending a separate activation request.'
)
fs.writeFileSync(directory + '/analysis.md', lines.join('\n') + '\n')
const fields = [
  'scenario',
  'player',
  'enemy',
  'side',
  'trials',
  'winPercent',
  'averageRounds',
  'pacingPercent',
  ...Object.keys(rows[0].perFight.player).filter((k) => k !== 'audit'),
  ...Object.keys(rows[0].perFight.player.audit).map((k) => 'audit.' + k),
]
const quote = (v) => JSON.stringify(v ?? '')
const csv = [fields.join(',')]
for (const r of rows)
  for (const side of ['player', 'enemy'])
    csv.push(
      fields
        .map((k) =>
          quote(
            k.startsWith('audit.')
              ? r.perFight[side].audit[k.slice(6)]
              : k === 'side'
              ? side
              : k in r
              ? r[k]
              : r.perFight[side][k]
          )
        )
        .join(',')
    )
fs.writeFileSync(directory + '/results.csv', csv.join('\n') + '\n')
console.log(
  JSON.stringify(
    { finished: summary.baselineFinishedFour, comparisons },
    null,
    2
  )
)
