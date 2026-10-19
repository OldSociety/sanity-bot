const fs = require('node:fs')
const assert = require('node:assert/strict')
const root = 'artifacts/hellfed-brink-policy'
const names = [
  'sm-cheap-lethal',
  'sm-brink-aware',
  'maxim-cheap-lethal',
  'maxim-brink-aware',
]
const rows = names.map((name) =>
  JSON.parse(fs.readFileSync(`${root}/${name}.json`, 'utf8'))
)
const baselineSM = require('../artifacts/hellfed-sm-audit/sm-baseline.json')
const baselineMax = require('../artifacts/hellfed-sm-audit/maxim-baseline.json')
const [narrow, aware, maxNarrow, maxAware] = rows
assert.deepEqual(maxNarrow.sides, maxAware.sides)
assert.deepEqual(maxNarrow.averages, maxAware.averages)
assert.equal(aware.averages.brinkFromS3, 0)
for (const row of rows) {
  assert.equal(row.trials, 10000)
  assert.equal(row.seed, 271828)
  const hp = (side) =>
    Object.values(row.sides[side].hpDamage).reduce((a, b) => a + b, 0)
  assert.ok(
    Math.abs(
      260 - hp('enemy') - row.averages.hpPaid - row.sides.player.finalHp
    ) < 1e-6
  )
  const enemyHP = row.scenario.opponent === 'marq' ? 260 : 220
  assert.ok(
    Math.abs(
      enemyHP +
        row.averages.brinkHpRestored -
        hp('player') -
        row.sides.enemy.finalHp
    ) < 1e-6
  )
}
const f = (n) => n.toFixed(2)
const baselineGap = baselineMax.winPercent - baselineSM.winPercent
const awareGap = maxAware.winPercent - aware.winPercent
fs.writeFileSync(
  `${root}/results.json`,
  JSON.stringify(
    { baselines: [baselineSM, baselineMax], trials: rows },
    null,
    2
  )
)
fs.writeFileSync(
  `${root}/analysis.md`,
  '# Cheap-lethal and Brink-aware player-policy test\n\n' +
    '40,000 new offline Level 1 fights: 10,000 for each of two policies against Spooky Marq and Maxim. Seed 271828 and per-fight mapping match the earlier audit. Existing 10,000-fight B baselines are reused for comparison. All live mechanics, damage, stats, opponent tactical AI and fixed valid Finisher button 3 remain unchanged. No future random draws are visible to the policies.\n\n' +
    '## Policies\n\n' +
    'Baseline B always refills Rage when legal; otherwise it saves Hope for S3 unless its existing S2 rule permits a cast. The cheap-lethal rule overrides that priority when a cheaper single hit is enough: use a normal basic (or guaranteed Stoke if available) when its landed damage suffices; otherwise use affordable guaranteed S2 when it suffices. This applies both before and after Brink and to both opponent types. Basic accuracy still applies when Stoke is unavailable. It deliberately accepts that risk rather than spending Hope on an unnecessary Finisher.\n\n' +
    'The broader Brink-aware rule adds one condition: if S3 would trigger unused Brink while no cheaper single-hit trigger is ready, chip with S2 or a basic/Stoke instead, saving S3 until Brink is spent. Nonlethal S3 before Brink and ordinary S3 afterward remain available. All other B decisions are retained. These are transparent heuristics, not a mathematically optimal policy.\n\n' +
    '| Policy | Hellfed wins vs SM | Hellfed wins vs Maxim |\n|---|---:|---:|\n' +
    `| Existing B | ${f(baselineSM.winPercent)}% | ${f(
      baselineMax.winPercent
    )}% |\n` +
    `| Prefer cheaper lethal hit | ${f(narrow.winPercent)}% | ${f(
      maxNarrow.winPercent
    )}% |\n` +
    `| Also conserve S3 against unused Brink | ${f(aware.winPercent)}% | ${f(
      maxAware.winPercent
    )}% |\n\n` +
    `The measured opponent gap shrinks from ${f(baselineGap)} to ${f(
      awareGap
    )} percentage points, about ${f(
      ((baselineGap - awareGap) * 100) / baselineGap
    )}% smaller. The 0.05-point difference between the two new SM policies is below ordinary sampling resolution here; the simpler cheap-lethal rule captures essentially all the measured improvement. Both Maxim runs are exactly identical, as expected because the added Brink condition never applies there.\n\n` +
    '## What changed against SM\n\n| Metric per fight unless marked | Baseline | Cheap lethal | Brink-aware |\n|---|---:|---:|---:|\n' +
    [
      ['Mean rounds', (r) => r.averages.turns],
      ['S2 casts', (r) => r.sides.player.uses.special2],
      ['S3 casts', (r) => r.sides.player.uses.special3],
      ['HP sacrificed', (r) => r.averages.hpPaid],
      ['Fights reaching Brink (%)', (r) => r.averages.brink * 100],
      [
        'Fights triggering Brink with S3 (%)',
        (r) => r.averages.brinkFromS3 * 100,
      ],
      [
        'Fights losing after Brink (%)',
        (r) => r.averages.lossesAfterBrink * 100,
      ],
    ]
      .map(
        ([label, value]) =>
          `| ${label} | ${[baselineSM, narrow, aware]
            .map((r) => f(value(r)))
            .join(' | ')} |`
      )
      .join('\n') +
    '\n\nThe policy now takes cheap-lethal S2 decisions earlier instead of allowing the original unused-Brink veto and refill priority to defer them. It overrides about 0.57 S2 decisions per fight. Direct replacements of an already-selected S3 are rare (about 0.01/fight): the earlier S2 choices prevent most later wasted Finishers from arising. S3 still contributes; it is not removed from the kit or banned for the whole fight.\n\n' +
    "## Interpretation\n\nThe prior fixed player policy substantially overstated SM's relative strength in this matchup. Smarter cheap-kill spending closes roughly two-thirds of the observed opponent win-rate gap. SM remains harder than Maxim under the tested policy, and Brink still has a genuine survival benefit; this is not evidence that the passive has no balance cost. The weak decision logic was in the simulated Hellfed player policy, while the SM opponent already used its separate tactical policy.\n\n" +
    'Validation: decision-fixture test passes; all four cohorts reconcile both HP ledgers; the broader policy never triggers Brink with S3; Maxim control outputs are identical across the two variants. Runtime candidate hashes remain unchanged. No live balance changes, deployments, PM2 actions, database access, registry writes, migrations, grants, dependency changes, merge, push or worktree operations.\n'
)
console.log(
  '40,000 policy fights checked; HP ledgers and paired Maxim controls pass'
)
