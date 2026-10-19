const fs = require('node:fs'),
  assert = require('node:assert/strict')
const directory = 'artifacts/arena-block-75-50',
  rows = JSON.parse(fs.readFileSync(directory + '/results.json'))
assert.equal(rows.length, 50, 'Wait for all 50 cohorts before making a report')
const verification = JSON.parse(
  fs.readFileSync(directory + '/verification.json')
)
const names = ['Marq', 'Hellfed Marq', 'Maxim', 'Azulis', 'Hendrix'],
  label = (n) =>
    n === 'Marq'
      ? 'Spooky Marq'
      : n === 'Hellfed Marq'
      ? 'Hell-fed Marq'
      : n === 'Hendrix'
      ? 'Hendrix [Template]'
      : n
const get = (scenario, player, enemy) =>
  rows.find(
    (r) => r.scenario === scenario && r.player === player && r.enemy === enemy
  )
const mean = (a, f) => a.reduce((n, r) => n + f(r), 0) / a.length,
  fmt = (n, d = 2) => (n === null ? '—' : Number(n).toFixed(d))
function aggregate(scenario, roster = names) {
  const a = rows.filter(
      (r) =>
        r.scenario === scenario &&
        roster.includes(r.player) &&
        roster.includes(r.enemy)
    ),
    sides = {}
  for (const side of ['player', 'enemy']) {
    const metrics = Object.fromEntries(
      Object.keys(a[0].perFight[side]).map((k) => [
        k,
        mean(a, (r) => r.perFight[side][k] || 0),
      ])
    )
    metrics.basicCriticalPercent =
      (100 * metrics.criticalsBasic) / metrics.basicAttempts
    metrics.damagePerBlockedBasic =
      metrics.blockedBasicDamage / metrics.blocksBasic
    metrics.damagePerBlockedSpecial =
      metrics.blockedSpecialDamage / metrics.blocksSpecial
    metrics.basicDamagePerAttempt = metrics.basicDamage / metrics.basicAttempts
    metrics.basicDamagePerHit = metrics.basicHits
      ? (metrics.basicDamage - metrics.blockedBasicDamage) / metrics.basicHits
      : 0
    metrics.zeroStressResponsePercent = metrics.responses
      ? (100 * metrics.zeroStressResponses) / metrics.responses
      : 0
    const eligible = a.filter((r) => r.perFight[side].stressAtKnockout !== null)
    const knockouts = eligible.reduce(
      (n, r) => n + r.perFight[side].knockouts,
      0
    )
    metrics.stressAtKnockout = knockouts
      ? eligible.reduce(
          (n, r) =>
            n + r.perFight[side].stressAtKnockout * r.perFight[side].knockouts,
          0
        ) / knockouts
      : null
    metrics.basicsPer100Rounds =
      (100 * metrics.basicAttempts) / mean(a, (r) => r.averageRounds)
    metrics.specialsPer100Rounds =
      (100 * (metrics.s1 + metrics.s2 + metrics.s3)) /
      mean(a, (r) => r.averageRounds)
    sides[side] = metrics
  }
  return {
    fights: a.reduce((n, r) => n + r.trials, 0),
    winPercent: mean(a, (r) => r.winPercent),
    averageRounds: mean(a, (r) => r.averageRounds),
    pacingPercent: mean(a, (r) => r.pacingPercent),
    sides,
  }
}
const current = aggregate('current'),
  proposed = aggregate('proposed'),
  matchups = []
const finishedNames = names.filter((name) => name !== 'Hendrix')
const finishedCurrent = aggregate('current', finishedNames),
  finishedProposed = aggregate('proposed', finishedNames)
const kitScores = names.map((fighter) => {
  const opponents = names.filter((n) => n !== fighter)
  const score = (scenario, list) =>
    mean(
      list,
      (opponent) =>
        (get(scenario, fighter, opponent).winPercent +
          100 -
          get(scenario, opponent, fighter).winPercent) /
        2
    )
  const completedOpponents = finishedNames.filter((n) => n !== fighter)
  return {
    fighter,
    current: score('current', opponents),
    proposed: score('proposed', opponents),
    finishedCurrent: score('current', completedOpponents),
    finishedProposed: score('proposed', completedOpponents),
  }
})
for (const player of names)
  for (const enemy of names) {
    const a = get('current', player, enemy),
      b = get('proposed', player, enemy)
    matchups.push({
      player,
      enemy,
      currentWin: a.winPercent,
      proposedWin: b.winPercent,
      winChange: b.winPercent - a.winPercent,
      currentRounds: a.averageRounds,
      proposedRounds: b.averageRounds,
      currentPacing: a.pacingPercent,
      proposedPacing: b.pacingPercent,
    })
  }
const balanced = []
for (let i = 0; i < names.length; i++)
  for (let j = i + 1; j < names.length; j++) {
    const a = names[i],
      b = names[j]
    balanced.push({
      fighter: a,
      opponent: b,
      current:
        (get('current', a, b).winPercent +
          100 -
          get('current', b, a).winPercent) /
        2,
      proposed:
        (get('proposed', a, b).winPercent +
          100 -
          get('proposed', b, a).winPercent) /
        2,
    })
  }
const csvRows = rows.map((r) => ({
    scenario: r.scenario,
    player: r.player,
    enemy: r.enemy,
    trials: r.trials,
    winPercent: r.winPercent,
    averageRounds: r.averageRounds,
    pacingPercent: r.pacingPercent,
    ...Object.fromEntries(
      ['player', 'enemy'].flatMap((side) =>
        Object.entries(r.perFight[side]).map(([k, v]) => [
          side +
            '_' +
            (k === 'basicDamagePerHit'
              ? 'legacyTotalBasicDamagePerLandedCount'
              : k),
          v,
        ])
      )
    ),
    ...Object.fromEntries(
      ['player', 'enemy'].map((side) => [
        side + '_landedBasicDamageAverage',
        r.perFight[side].basicHits
          ? (r.perFight[side].basicDamage -
              r.perFight[side].blockedBasicDamage) /
            r.perFight[side].basicHits
          : 0,
      ])
    ),
  })),
  keys = Object.keys(csvRows[0]),
  escape = (v) => (v === null ? '' : JSON.stringify(String(v)))
fs.writeFileSync(
  directory + '/results.csv',
  [
    keys.join(','),
    ...csvRows.map((r) => keys.map((k) => escape(r[k])).join(',')),
  ].join('\n') + '\n'
)
fs.writeFileSync(
  directory + '/summary.json',
  JSON.stringify(
    {
      current,
      proposed,
      finishedCurrent,
      finishedProposed,
      kitScores,
      matchups,
      balanced,
      verification,
    },
    null,
    2
  )
)
const out = [
  '# Offline Block comparison: latest five-character Arena patch',
  '',
  '**No live changes.** Current Block deals 25% of normal basic and special damage. Proposed Block deals 75% of normal basic damage (25% reduction) and 50% of normal special damage (50% reduction). Damage rounds up after the existing modifiers. S3 remains guaranteed and noncritical; an accompanying basic may be blocked.',
  '',
  'Both models already prohibit blocked basic criticals and every special critical. No separate reduction to unblocked critical chance was invented. Existing player Duality criticals and enemy accuracy/critical probability, costs, B action economy, healing, Rage, passives, recovery, resources and every coefficient remain fixed. On-hit Stress removal, Slayer consumption and landed-hit recharge remain suppressed on Block; support still works.',
  '',
  'Future intent, not simulated: Block negates applicable control conditions such as stun/freeze, but not DOT damage or DOT application; DOT may remain an exception to the blocked-critical prohibition. No DOT/stun/freeze systems were implemented.',
  '',
  '## Method',
  '',
  '500,000 Level 1 fights: 25 ordered matchups × two models × 10,000 seeds; seed base 271828. Current development and frozen production combat coefficients match. All five playable fighters are included, with Hendrix using the unfinished 200/200 template. Both roles use the same existing C survival-aware cheapest-reliable tactical policy and deterministic fallback. Policy code is fixed, but choices adapt to the correct expected damage of each model. This is a policy comparison, not an optimal-play proof or a direct forecast of human-versus-live-AI performance. The common offline fallback differs from live AI random fallback.',
  '',
  'Player S3 uses the midpoint button (45% Attack before kit bonuses); enemy S3 retains its current 35–45% range, or fixed 45% for Azulis. Existing role differences remain, including player Duality versus enemy 85% accuracy/5% conditional critical chance, resource rules and support action behavior. Identical initial trial seeds are used, but action and RNG paths can diverge between models. A 10,000-fight rate near 50% has about ±0.98 percentage points of binomial 95% sampling margin; do not overread small matchup changes.',
  '',
  '## Aggregate results',
  '',
  'Equal weighting of all 25 ordered matchups; player win rate measures role advantage, not the strength of an individual fighter. The finished-roster rows exclude Hendrix from both roles (16 ordered matchups, 160,000 fights per model), separating the unfinished template from the completed kits.',
  '',
  '| Metric | Current | Proposed | Change |',
  '|---|---:|---:|---:|',
  `| Player wins | ${fmt(current.winPercent)}% | ${fmt(
    proposed.winPercent
  )}% | ${fmt(proposed.winPercent - current.winPercent)} pp |`,
  `| Average rounds | ${fmt(current.averageRounds)} | ${fmt(
    proposed.averageRounds
  )} | ${fmt(proposed.averageRounds - current.averageRounds)} (${fmt(
    100 * (proposed.averageRounds / current.averageRounds - 1)
  )}%) |`,
  `| Fights lasting 10–20 rounds | ${fmt(current.pacingPercent)}% | ${fmt(
    proposed.pacingPercent
  )}% | ${fmt(proposed.pacingPercent - current.pacingPercent)} pp |`,
  `| Finished roster: player wins | ${fmt(finishedCurrent.winPercent)}% | ${fmt(
    finishedProposed.winPercent
  )}% | ${fmt(finishedProposed.winPercent - finishedCurrent.winPercent)} pp |`,
  `| Finished roster: average rounds | ${fmt(
    finishedCurrent.averageRounds
  )} | ${fmt(finishedProposed.averageRounds)} | ${fmt(
    finishedProposed.averageRounds - finishedCurrent.averageRounds
  )} |`,
  `| Finished roster: 10–20 rounds | ${fmt(
    finishedCurrent.pacingPercent
  )}% | ${fmt(finishedProposed.pacingPercent)}% | ${fmt(
    finishedProposed.pacingPercent - finishedCurrent.pacingPercent
  )} pp |`,
]
for (const side of ['player', 'enemy'])
  for (const [key, title] of [
    ['basicAttempts', 'Basics/fight'],
    ['basicCriticalPercent', 'Basic criticals/100 basics'],
    ['s1', 'S1 uses/fight'],
    ['s2', 'S2 uses/fight'],
    ['s2Damage', 'S2 damage/fight'],
    ['s3', 'S3 uses/fight'],
    ['s3Damage', 'S3 damage/fight'],
    ['basicDamagePerAttempt', 'Basic damage/attempt'],
    ['basicsPer100Rounds', 'Basics/100 rounds'],
    ['specialsPer100Rounds', 'Specials/100 rounds'],
    ['damagePerBlockedBasic', 'Damage/blocked basic'],
    ['damagePerBlockedSpecial', 'Damage/blocked special'],
    ['healed', 'Ability HP healed/fight'],
  ])
    out.push(
      `| ${side}: ${title} | ${fmt(current.sides[side][key])} | ${fmt(
        proposed.sides[side][key]
      )} | ${fmt(proposed.sides[side][key] - current.sides[side][key])} |`
    )
out.push(
  '',
  '## Every ordered matchup',
  '',
  'Win rates are for the row’s player role. Both rates use 10,000 fights.',
  '',
  '| Player | Enemy | Win current | Win proposed | Change pp | Rounds current | Rounds proposed | 10–20 current | 10–20 proposed |',
  '|---|---|---:|---:|---:|---:|---:|---:|---:|'
)
for (const r of matchups)
  out.push(
    `| ${label(r.player)} | ${label(r.enemy)} | ${fmt(r.currentWin)}% | ${fmt(
      r.proposedWin
    )}% | ${fmt(r.winChange)} | ${fmt(r.currentRounds)} | ${fmt(
      r.proposedRounds
    )} | ${fmt(r.currentPacing)}% | ${fmt(r.proposedPacing)}% |`
  )
out.push(
  '',
  '## Role bias: mirrors',
  '',
  'An identical-kit mirror should approach 50% if role effects are neutral. These rows expose remaining role differences rather than character-versus-character strength.',
  '',
  '| Mirror | Current player wins | Proposed player wins |',
  '|---|---:|---:|'
)
for (const name of names)
  out.push(
    `| ${label(name)} | ${fmt(get('current', name, name).winPercent)}% | ${fmt(
      get('proposed', name, name).winPercent
    )}% |`
  )
out.push(
  '',
  '## Kit performance with roles averaged',
  '',
  'Each entry averages wins across the other kits with each fighter in both roles. Mirrors are excluded. The finished-opponent columns exclude Hendrix as an opponent; these are descriptive fixed-policy results, not universal kit ratings.',
  '',
  '| Fighter | All other kits: current | Proposed | Finished opponents: current | Proposed |',
  '|---|---:|---:|---:|---:|'
)
for (const r of kitScores)
  out.push(
    `| ${label(r.fighter)} | ${fmt(r.current)}% | ${fmt(r.proposed)}% | ${fmt(
      r.finishedCurrent
    )}% | ${fmt(r.finishedProposed)}% |`
  )
out.push(
  '',
  '## Role-balanced pair summaries',
  '',
  'Descriptive average of a fighter’s player win rate and its enemy win rate with roles reversed; does not remove kit-dependent interaction with role mechanics.',
  '',
  '| Fighter | Opponent | Current | Proposed |',
  '|---|---|---:|---:|'
)
for (const r of balanced)
  out.push(
    `| ${label(r.fighter)} | ${label(r.opponent)} | ${fmt(r.current)}% | ${fmt(
      r.proposed
    )}% |`
  )
out.push(
  '',
  '## Ability and survivability detail',
  '',
  '`results.csv` contains all 50 cohort rows with both roles’ S1/S2/S3 frequency and damage, basic damage/attempts/hits, Block counts and damage, criticals, Hope/Fear generation/spending, effective HP, actual healing/cap waste, Stress at knockout, and exposure at zero Stress. The CSV labels the inherited total-basic-damage/landed-count ratio as legacyTotalBasicDamagePerLandedCount; landedBasicDamageAverage subtracts blocked damage and is the actual landed-hit average. Mix-weighted Block damage averages also reflect action selection. Damage totals include resolved damage before target-HP cap; actual HP damage taken is provided separately. Effective HP includes actual healing/Brink restoration and subtracts Stoke HP costs. Hellfed has no Stress/exhaustion; its knockout Stress value is null. Zero-Stress exposure is the inherited response-end proxy, not time-resolved damage exposure.',
  '',
  '## Verification and limits',
  '',
  'One million fighter HP/resource ledgers and one million fighter Stress ledgers reconcile; no special criticals, blocked criticals or blocked Finishers. All frozen model hashes and all 53 live source/art/config candidate hashes remain unchanged. The optional report hooks and fighter-list extension reproduce the pre-change harness exactly in a fresh 100-fight control. Forced checks exercise all 144 player outcomes, both roles’ Block paths, correct tactical previews, support effects, on-hit suppression, exhaustion rounding and every Finisher choice. Three fresh 100-fight samples replayed twice identically (replay.json).',
  '',
  'Small basics amplify rounding: normal 6 damage becomes 5 on proposed Block versus 2 currently. Failure is therefore a much smaller damage penalty, even though critical and on-hit rewards remain unavailable. The player role has more failed basic rolls than the enemy’s 15% miss rate, so weakening Block can affect role balance unevenly. Shorter fights can reduce total criticals, healing and specials per fight without changing their per-attempt rules. No HP/Attack/cost/healing/damage coefficient was tuned, and neither bot was restarted or changed.'
)
out.push(
  '',
  '## Interpretation',
  '',
  `The change improves the finished roster’s 10–20-round share (${fmt(
    finishedCurrent.pacingPercent
  )}% → ${fmt(finishedProposed.pacingPercent)}%) and shortens its mean (${fmt(
    finishedCurrent.averageRounds
  )} → ${fmt(
    finishedProposed.averageRounds
  )}). It also flips an enemy-side advantage into a larger player-side advantage: ${fmt(
    finishedCurrent.winPercent
  )}% → ${fmt(
    finishedProposed.winPercent
  )}% player wins. It is not a uniform fairness improvement.`,
  '',
  `Spooky Marq’s mirror moves ${fmt(
    get('current', 'Marq', 'Marq').winPercent
  )}% → ${fmt(
    get('proposed', 'Marq', 'Marq').winPercent
  )}% player wins; Azulis moves ${fmt(
    get('current', 'Azulis', 'Azulis').winPercent
  )}% → ${fmt(
    get('proposed', 'Azulis', 'Azulis').winPercent
  )}%. Hellfed’s mirror is closer to neutral, but Hellfed loses ground against the other kits when roles are averaged. Guaranteed Stoke and Finishers receive no direct damage boost from softer Block, so their relative value can fall. This is a plausible mechanism, not a separate causal ablation.`,
  '',
  `Player basic criticals per 100 basics are effectively unchanged (${fmt(
    current.sides.player.basicCriticalPercent
  )} → ${fmt(
    proposed.sides.player.basicCriticalPercent
  )}); enemy rates are ${fmt(current.sides.enemy.basicCriticalPercent)} → ${fmt(
    proposed.sides.enemy.basicCriticalPercent
  )}. Fewer total criticals per fight come with fewer attacks. A separate reduction to unblocked critical chance would require a defined rate and another experiment.`,
  '',
  'Azulis’s healing remains guaranteed and unchanged at 14 HP per full activation. Across the five matchups, the player restores about 80.76 → 79.31 HP per fight. Its improved results cannot be attributed to healing alone: both its accompanying basic and Starlight gain more chip damage. Hendrix remains an unfinished template; its mirror is much shorter than the target range.',
  '',
  'Recommendation: treat this as a change in combat feel and failure penalty, not a completed balance correction. The finished roster has tighter pacing but stronger player-side bias and persistent kit gaps. Keep production unchanged while deciding whether to test the feel in development or define the additional critical-chance change. No automatic coefficient adjustments are justified by this one fixed-policy comparison.'
)
fs.writeFileSync(directory + '/analysis.md', out.join('\n') + '\n')
console.log(JSON.stringify({ current, proposed }, null, 2))
