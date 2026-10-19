const fs = require('node:fs')
const results = JSON.parse(
  fs.readFileSync('artifacts/arena-parity/results.json')
)
const names = ['Hellfed Marq', 'Marq', 'Maxim']
const label = (name) => (name === 'Marq' ? 'Spooky Marq' : name)
const cell = (p, e) => results.find((r) => r.player === p && r.enemy === e)
const fmt = (n) => (n + 1e-9).toFixed(2)
const lines = [
  '# Arena tactical-policy parity audit — October 17, 2026',
  '',
  '90,000 offline Level 1 fights, 10,000 per ordered matchup. Base seed 271828; fight seed `(271828 + imul(trial + 1, 2654435761)) >>> 0`; LCG constants 1664525/1013904223. Each cell starts with the same streams; policies and mechanics change subsequent draw consumption. No balance tuning or live source/configuration/process/database changes.',
  '',
  '## Player win rate',
  '',
  '| Player / opponent | Hellfed Marq | Spooky Marq | Maxim |',
  '|---|---:|---:|---:|',
  ...names.map(
    (p) =>
      `| ${label(p)} | ${names
        .map((e) => `${fmt(cell(p, e).winPercent)}%`)
        .join(' | ')} |`
  ),
  '',
  'These are role-specific results. A mirror need not be 50% because the existing game gives the two roles different action economies, income, accuracy, damage coefficients and Finisher resolution. Approximate 95% binomial margins are at most ±0.98 percentage points per cell; these describe seed sampling, not model or policy uncertainty.',
  '',
  '## Cross-matchups with equal weight for both roles',
  '',
  '| Character A / B | A as player | A as opponent (100 − B player wins) | Equal-role A wins |',
  '|---|---:|---:|---:|',
]
for (let a = 0; a < 3; a++)
  for (let b = a + 1; b < 3; b++) {
    const forward = cell(names[a], names[b]).winPercent
    const reverse = 100 - cell(names[b], names[a]).winPercent
    lines.push(
      `| ${label(names[a])} / ${label(names[b])} | ${fmt(forward)}% | ${fmt(
        reverse
      )}% | ${fmt((forward + reverse) / 2)}% |`
    )
  }
lines.push(
  '',
  'Role averaging is a descriptive combination of these two matchups. It does not normalize mechanics, identify a causal coefficient effect, prove optimal play or establish a universal kit ranking.',
  '',
  '## Interpretation',
  '',
  `Spooky and Maxim mirrors produce ${fmt(
    cell('Marq', 'Marq').winPercent
  )}% and ${fmt(
    cell('Maxim', 'Maxim').winPercent
  )}% player wins. Those unequal outcomes cannot be attributed to one character facing a different character: role mechanics and their interaction with the policy are material. Hellfed instead produces ${fmt(
    cell('Hellfed Marq', 'Hellfed Marq').winPercent
  )}% player wins under the provisional enemy adapter, so there is no single universal player/AI correction factor.`,
  '',
  `Hellfed versus Maxim changes from ${fmt(
    cell('Hellfed Marq', 'Maxim').winPercent
  )}% as player to ${fmt(
    100 - cell('Maxim', 'Hellfed Marq').winPercent
  )}% as enemy; equal-role average ${fmt(
    (cell('Hellfed Marq', 'Maxim').winPercent +
      100 -
      cell('Maxim', 'Hellfed Marq').winPercent) /
      2
  )}%. A sub-50% player result alone is insufficient evidence that Hellfed needs a buff. Against Spooky, the equal-role average remains ${fmt(
    (cell('Hellfed Marq', 'Marq').winPercent +
      100 -
      cell('Marq', 'Hellfed Marq').winPercent) /
      2
  )}%, a remaining disadvantage in this model, without isolating Brink from the rest of the kit or role interactions.`,
  '',
  'Retain On the Brink and the current kit values. Keep the general survival-aware tactical rule as the offline comparison entry point. A separate coefficient/action-economy normalization experiment would be needed to isolate those mechanics causally; these retained-mechanics parity results do not identify a nerf amount. Policy quality remains a modeling limitation even when both sides share a heuristic.',
  '',
  '## Shared tactical rule',
  '',
  'Both roles enumerate every legal action using public state and damage distributions. A cloned target passes through the shared survival resolver: the immediate objective is defeat, or consuming an available survival effect. For Brink, exceeding current HP consumes the rescue rather than winning; overkill is not credited as killing the revived target. No character name appears in the selection rule. Future shield mechanics require an appropriate outcome adapter; the extension hook is fixture-tested, not an implemented shield system.',
  '',
  'If any action has at least a 50% chance of the immediate objective, choose the highest chance; among equally reliable actions minimize Hope/Fear, then Stress, then HP, then expected overkill. Thus a guaranteed S2 beats an uncertain basic even if a landed basic would kill. The 50% cutoff avoids chasing tiny unbounded Combo tails. When this rule does not apply, both roles use the existing deterministic tactical priorities, survival estimate, meaningful-buff and resource-saving checks, with the same observed-history inputs. Enemy probabilistic action selection is disabled only inside this offline adapter.',
  '',
  'This is a common heuristic, not a solved optimal policy. It differs from the previous narrow player-only rule (which accepted landed-basic lethals) and replaces the prior Hellfed B refill priority. Consequently the new cells are not a single-variable estimate of the cheap-lethal change against the historical 33.20% / 42.61% results.',
  '',
  'Two preview corrections apply offline: player S1/S2/S3 that replace basics no longer receive fabricated basic damage; Hellfed zero Stress no longer triggers the Stress-exhaustion avoidance heuristic. Guaranteed enemy Stoke previews use 100% basic accuracy. These change predictions/decisions, not live combat formulas.',
  '',
  '## Preserved role differences and Hellfed enemy assumption',
  '',
  '| Mechanic | Player | Opponent |',
  '|---|---|---|',
  '| Order / action economy | Acts first; ordinary specials replace basic and dice | Surviving enemy responds; basic accompanies special |',
  '| Accuracy / critical | Normal Duality outcomes and stored critical behavior | 85% basic hit, 5% critical on landed attack |',
  '| Income | Hope from own Duality; no dice on replacing specials | Fear from player Fear rolls plus own critical reward; no independent normal Duality |',
  '| Finisher | Chosen midpoint 45% Attack | Uniform integer 35–45% Attack |',
  '| Spooky Combo base | 8% + continuing-d4 sum | 15% + continuing-d4 sum |',
  '| Maxim Focus / Slayer | 10% / +7% × 3 hits | 12% / +11% × 3 hits |',
  '| Recovery | Existing player critical recovery | Existing critical recovery plus 8% whole-response recovery when below max Stress |',
  '',
  'Hellfed has no live enemy implementation. An isolated in-memory adapter supplies its existing 260 HP / 200 Attack kit to the enemy role: same tiered 1/2/3% HP Stoke cost, guaranteed Stoke basic, Rage cap and miss decay, S2 16+6/Rage and S3 +8/Rage. It retains enemy action economy, Fear income, accuracy/crit and 35–45% base Finisher. Stoke costs HP before adding Rage, and ordinary enemy basic misses (including the basic accompanying S2/S3) reduce existing Rage; the selected special uses Rage at activation. This is an explicit modeling choice, not verified live Hellfed-AI behavior. In particular enemy Stoke has no independent Duality roll because that mechanism does not exist in the retained enemy role. Hellfed has no Stress recovery action. S2 costs 2 and S3 costs 5 on both sides; existing critical effects, survival passives and exhaustion immunity remain.',
  '',
  '## Pacing',
  '',
  '| Player / opponent | Mean rounds | Rounds 10–20 |',
  '|---|---:|---:|',
  ...results.map(
    (r) =>
      `| ${label(r.player)} / ${label(r.enemy)} | ${fmt(
        r.averageRounds
      )} | ${fmt(r.pacingPercent)}% |`
  ),
  '',
  '## Actions, income and damage per fight',
  '',
  'Damage is raw attributed damage including overkill. HP paid is separate. S1/2/3 casts and basic damage use the existing statistics recorder; the basic accompanying Stoke is attributed to basic damage.',
  '',
  '| Matchup | Role | S1 casts | S2 casts / damage | S3 casts / damage | Basic damage | HP paid | Resource generated / spent / left |',
  '|---|---|---:|---:|---:|---:|---:|---:|'
)
for (const r of results)
  for (const side of ['player', 'enemy']) {
    const s = r.perFight[side]
    lines.push(
      `| ${label(r.player)} / ${label(r.enemy)} | ${side} | ${fmt(
        s.uses.special1
      )} | ${fmt(s.uses.special2)} / ${fmt(s.damage.special2)} | ${fmt(
        s.uses.special3
      )} / ${fmt(s.damage.special3)} | ${fmt(s.damage.basic)} | ${fmt(
        s.hpPaid
      )} | ${fmt(s.generated)} / ${fmt(s.spent)} / ${fmt(s.remaining)} |`
    )
  }
lines.push(
  '',
  '## Validation and reproduction',
  '',
  `All ${results
    .reduce((n, r) => n + r.totals.ledgerChecks, 0)
    .toLocaleString(
      'en-US'
    )} final HP and resource ledgers reconcile (including Brink restoration and independently tracked Stoke sacrifice). Rage bounds checked after every turn.`,
  '',
  'Nine focused tests pass, including the earlier cheap-lethal fixture. Eight new parity tests cover survival-aware cost choice, target immutability, reliable versus uncertain lethals, extension hook, replacement-special previews and offline Hellfed enemy rules. Forced legacy actions reproduce stock full battle states exactly for all four non-Hellfed matchups (40 seeded fights). Three 100-fight cells replay byte-identically twice. All nine prior live candidate SHA256 hashes remain unchanged; see integrity.json and replay.json.',
  '',
  'Run `node scripts/arena-parity-report.js` with `NODE_ENV=development`, then `node scripts/arena-parity-summary.js`. Single cell: `node scripts/arena-parity-report.js PLAYER_INDEX ENEMY_INDEX TRIALS` (indices Hellfed=0, Spooky=1, Maxim=2). Each matchup uses a fresh process; the adapter mutates only that process’s module instances. Raw results include decision reasons and Hellfed Finisher casts at each Rage level. Historical reports are preserved. No live activation.',
  ''
)
fs.writeFileSync('artifacts/arena-parity/analysis.md', lines.join('\n'))
