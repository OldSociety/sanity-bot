const fs = require('node:fs')
const assert = require('node:assert/strict')
const { scenarios } = require('./hellfed-sm-audit')
const root = 'artifacts/hellfed-sm-audit'
// Keep the historical ten-scenario audit separate from later policy trials.
const results = Object.keys(scenarios)
  .filter((name) => !scenarios[name].brinkPolicy)
  .map((name) => {
    const row = JSON.parse(fs.readFileSync(`${root}/${name}.json`, 'utf8'))
    // Retire unused exploratory counters from early diagnostic output.
    for (const group of [row.averages, row.totals]) {
      delete group.knockoutSource
      delete group.s2FearKills
    }
    fs.writeFileSync(`${root}/${name}.json`, JSON.stringify(row, null, 2))
    return row
  })
const get = (name) => results.find((row) => row.name === name)
const sm = get('sm-baseline'),
  maxim = get('maxim-baseline')
const previous = require('../artifacts/hellfed-rage/balance.json')
for (const row of [sm, maxim]) {
  const prior = previous.find(
    (item) => item.strategy === 'B' && item.opponent === row.scenario.opponent
  )
  assert.equal(row.winPercent, prior.winPercent)
  assert.equal(row.averages.turns, prior.averageRounds)
}
assert.equal(
  get('sm-brink-resolution-only').winPercent,
  sm.averages.brink * 100
)
for (const row of results) {
  const damage = (side) =>
    Object.values(row.sides[side].hpDamage).reduce((a, b) => a + b, 0)
  assert.ok(
    Math.abs(
      260 - damage('enemy') - row.averages.hpPaid - row.sides.player.finalHp
    ) < 1e-6
  )
  const enemyHp =
    row.scenario.hp || (row.scenario.opponent === 'marq' ? 260 : 220)
  assert.ok(
    Math.abs(
      enemyHp +
        row.averages.brinkHpRestored -
        damage('player') -
        row.sides.enemy.finalHp
    ) < 1e-6
  )
}
fs.writeFileSync(`${root}/results.json`, JSON.stringify(results, null, 2))
const f = (n) => n.toFixed(2)
const table = results
  .filter((row) => row.scenario.opponent === 'marq')
  .map(
    (row) =>
      `| ${row.name} | ${f(row.winPercent)}% | ${f(
        row.winPercent - sm.winPercent
      )} | ${f(row.averages.turns)} |`
  )
  .join('\n')
const totals = (row) =>
  Object.values(row.sides.enemy.damage).reduce((a, b) => a + b, 0)
const report =
  '# What gives Spooky Marq the advantage?\n\n' +
  '100,000 offline Level 1 fights: 10,000 per scenario, seed 271828 with the same per-fight seed mapping as the latest audit. Baseline is Hellfed player using B (always refill) against tactical AI, fixed valid Finisher button 3. Configuration counterfactuals are private clones in fresh child processes. No live code, balance configuration, bot process, database, registry, dependencies or remote state was changed.\n\n' +
  '## Main finding: Brink and the spending policy dominate\n\n' +
  `Baseline Hellfed wins ${f(sm.winPercent)}% against Spooky Marq and ${f(
    maxim.winPercent
  )}% against Maxim, a ${f(
    maxim.winPercent - sm.winPercent
  )}-point gap. Brink activates in ${f(
    sm.averages.brink * 100
  )}% of Marq fights. In ${f(
    sm.averages.lossesAfterBrink * 100
  )}% of all fights Hellfed delivers a lethal blow, Marq survives through Brink, and Hellfed subsequently loses.\n\n` +
  "Disabling only the lethal rescue while preserving both policies' belief in Brink yields exactly 41.42% wins. This isolates the immediate survival effect: 26.91 percentage points over baseline. Removing the passive entirely gives 58.09%, but that also changes player and AI decisions. These two counterfactuals answer different questions.\n\n" +
  `Brink restores 26 HP when triggered, but its larger effect is requiring an additional killing attack after cancelling a lethal result. ${f(
    (sm.averages.brinkFromS3 / sm.averages.brink) * 100
  )}% of triggers come from a player Finisher. The triggering hit overkills by ${f(
    sm.averages.brinkOverkill / sm.averages.brink
  )} damage on average, and Marq still takes its response after reviving. A hypothetical 138-damage Finisher at 20 remaining HP leaves Marq at 26 HP, able to respond, after Hellfed spent five Hope.\n\n` +
  '## One-change counterfactuals\n\n| Scenario | Hellfed wins | Change, percentage points | Mean rounds |\n|---|---:|---:|---:|\n' +
  table +
  "\n\nScenario key: no-brink removes the passive from both resolution and decisions; brink-resolution-only bypasses only the enemy rescue while preserving policy beliefs; 220hp keeps the kit and scales Brink restoration to 22 HP; player-combo-coefficient changes only AI Combo flat damage from 15 to the player Spooky coefficient 8; no-recovery disables only the AI 8% Stress-recovery action; spend-s2 uses S3 → S2 → S1 → basic, instead of B's S1-first/save-for-Finisher policy. Every other setting remains fixed. Effects overlap and are not additive; these are specified-policy measurements rather than universal kit ratings.\n\n" +
  '## Why the player policy favors Marq\n\n' +
  'The current B/C Hope policy saves for S3 unless S2 is lethal or Hellfed has very little HP. Its S2-lethal predicate explicitly refuses a finishing opportunity while Marq has unused Brink. Therefore it tends to let a five-Hope Finisher trigger Brink rather than spending two Hope to trigger it earlier. The AI uses a different, health-aware policy that can spend Combo immediately.\n\n' +
  `The S3 → S2 → S1 policy raises wins to ${f(
    get('sm-spend-s2').winPercent
  )}% against Marq and ${f(
    get('maxim-spend-s2').winPercent
  )}% against Maxim. Against Marq it casts ${f(
    get('sm-spend-s2').sides.player.uses.special2
  )} S2s/fight versus baseline ${f(
    sm.sides.player.uses.special2
  )}; it casts no Finishers because it spends at two Hope. This changes both spending and refill priority, so the ${f(
    get('sm-spend-s2').winPercent - sm.winPercent
  )}-point lift cannot be assigned solely to S2 frequency. It is not a proven optimal policy.\n\n` +
  'At Rage 3, S2 deals 68 damage for two Hope (34 damage/Hope); midpoint S3 deals 138 for five (27.6 damage/Hope). S2 is about 23% more resource-efficient, while S3 is more action-efficient. The current policy strongly prioritizes the latter even against a passive that can negate the killing result.\n\n' +
  '## Damage, HP and role asymmetry\n\n' +
  `SM has 260 starting HP versus Maxim\'s 220. Lowering SM to 220 (also reducing Brink restoration to 22) raises Hellfed wins from 14.51% to 28.59%. SM AI also uses 15 + continuing-d4 percentage points for Combo, versus player Spooky\'s 8 + d4. Matching the flat coefficient raises Hellfed wins to 22.03%. The existing Combo mean roll sum is 7.901235: about 22.90% Attack, or 45.8 nominal damage before rounding/accuracy/criticals.\n\n` +
  `Actual AI average damage per fight, basic / S1 / S2 / S3: SM ${Object.values(
    sm.sides.enemy.damage
  )
    .map(f)
    .join(' / ')}; Maxim ${Object.values(maxim.sides.enemy.damage)
    .map(f)
    .join(' / ')}. SM total is ${f(totals(sm))} over ${f(
    sm.averages.turns
  )} rounds (${f(
    totals(sm) / sm.averages.turns
  )} damage/round), versus Maxim ${f(totals(maxim))} over ${f(
    maxim.averages.turns
  )} (${f(
    totals(maxim) / maxim.averages.turns
  )} damage/round). Longer survival gives Marq more total actions despite lower overall damage/round. Damage includes overkill; JSON also records actual HP damage.\n\n` +
  "The enemy response includes a basic plus its chosen special; the player's S2/S3 replaces a basic. This is an existing role asymmetry shared by both AIs, not uniquely a Marq mechanic. Marq's instant Combo benefits immediately, while Maxim's Slayer takes future landed basics to deliver its bonus. Stress recovery is a much smaller contributor in this matchup: disabling it changes wins only 14.51% → 15.49%. Hellfed's recorded exhaustion damage is zero, confirming no hidden Rage/exhaustion penalty.\n\n" +
  "## Validation and limits\n\nBoth baseline win rates and durations reproduce the published audit exactly. HP ledgers reconcile for both sides in all ten cohorts, and the rescue-only counterfactual exactly matches the baseline fraction reaching a lethal hit. Existing live candidate hashes are checked separately unchanged. No full repository test run or balance rollout is required for these offline diagnostics. Evaluate Brink and the Hope-spending policy before attributing the whole result to Hellfed's damage coefficients.\n"
fs.writeFileSync(`${root}/analysis.md`, report)
console.log(
  '10 cohorts / 100,000 fights; baseline, rescue-only and all HP-ledger checks pass'
)
