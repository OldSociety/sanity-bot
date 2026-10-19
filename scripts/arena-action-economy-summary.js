const fs = require('node:fs')
const directory = 'artifacts/arena-action-economy'
const rows = JSON.parse(fs.readFileSync(`${directory}/results.json`, 'utf8'))
if (
  rows.length !== 48 ||
  rows.some((r) => r.trials !== 10000 || r.totals.ledgerChecks !== 20000)
)
  throw Error('Expected all 48 complete cohorts')
const { balance } = require('./arena-parity-engine').setup()
const { resolveCharacter } = require('../services/arena/characters')
const { kitFor } = require('../services/arena/rules')
const { isAttack } = require('../services/arena/outcomes')
const names = ['Marq', 'Hellfed Marq', 'Maxim', 'Azulis'],
  experiments = ['A', 'B', 'C']
const f = (n) => n.toFixed(2)
const table = (heads, data) =>
  [
    '| ' + heads.join(' | ') + ' |',
    '| ' + heads.map(() => '---').join(' | ') + ' |',
    ...data.map((r) => '| ' + r.join(' | ') + ' |'),
  ].join('\n')
const cells = (e) => rows.filter((r) => r.experiment === e)
const mean = (data, key) =>
  data.reduce((sum, r) => sum + r[key], 0) / data.length
const sum = (data, fn) => data.reduce((total, r) => total + fn(r), 0)
const offensive = (r, side) => {
  const kit = kitFor({ ...resolveCharacter(r[side]), isAI: side === 'enemy' })
  return ['special1', 'special2', 'special3'].reduce(
    (n, slot) =>
      n +
      (isAttack(kit[slot], slot)
        ? r.perFight[side][slot.replace('special', 's')]
        : 0),
    0
  )
}
const summaries = Object.fromEntries(
  experiments.map((e) => {
    const data = cells(e),
      mirrors = data.filter((r) => r.player === r.enemy)
    return [
      e,
      {
        win: mean(data, 'winPercent'),
        rounds: mean(data, 'averageRounds'),
        pacing: mean(data, 'pacingPercent'),
        mirrorError: sum(mirrors, (r) => Math.abs(r.winPercent - 50)) / 4,
      },
    ]
  })
)
let text =
  `# Isolated Arena action-economy experiment

Only offensive-special action economy changes. B is the priority comparison. All four Level 1 fighters and all 16 ordered matchups per version are included, with 10,000 seeded fights each: 480,000 comparison fights across 48 cohorts. A reuses the verified 160,000 current-profile tactical fights from [the basic-only critical audit](../arena-basic-critical/analysis.md); B/C add 320,000 new fights. A fresh 10,000-fight control is checked against the reused control exactly. Seed 271828, same per-fight initialization, same tactical policy and midpoint player Finisher choice. Source/config verification, control replay and deterministic samples are saved alongside [results.json](results.json).

## Treatments

| Experiment | Player offensive special | Enemy offensive special |
| --- | --- | --- |
| A — Current | Replaces basic | Basic + special |
| B — Equalized | Basic + special | Basic + special |
| C — Equalized | Replaces basic | Replaces basic |

Offensive means the existing generic direct/combo attack classification plus all Finishers. Support activation behavior is frozen: Regeneration and Stoke retain their accompanying basics; player Slayer activation still replaces its basic while enemy Slayer retains its existing basic. Thus B/C equalize offensive-special economy, not every support activation or every role mechanic. No coefficient, cost, passive, cooldown threshold, HP, Attack, healing percentage or minigame rule is tuned. No live source, bot process, database, registry, artwork or production change.

Each combined action shares its normal single attack outcome roll. B adds no second roll to direct-special turns; its added Finisher basic receives one Duality roll while the Finisher remains guaranteed. Only a basic can critical, with current immediate double damage and resource effects. A/C player direct-special matching dice remain an ordinary success. C enemy direct specials keep their standard accuracy/Block outcome; an otherwise critical outcome becomes an ordinary hit, with no basic critical resource effects. C enemy Finishers remain guaranteed and have no absent-basic attack/critical roll. Block damage, on-hit gating, Stress exhaustion, Fear income and recovery rules are unchanged. Consequent differences in critical events, Fear income, resource recovery, charge consumption and cast opportunities are effects of changing the number of basics, not independently tuned resource rules.

Slayer delivery, Opportunity consumption and hit cooldown progression occur only when an actual basic lands. Normal special on-hit effects remain eligible even when a C action has no basic. A lethal complete player action still skips the enemy response; bundled basics and specials resolve using the established enemy-style action ordering. A paid special is not refunded when its accompanying basic would have been lethal alone.

## Policy and assumptions

All treatments start at full Level 1 Health, zero Hope/Fear, six Stress (Hellfed instead starts at zero Rage). They use the same current-state survival-aware cheapest reliable lethal check and tactical fallback for both roles, including current tactical Azulis healing. Previews reflect each treatment's actual action. No future random values are inspected. This allows policy decisions to respond to changed action payloads; it measures the economy change under this fixed policy family, rather than forcing an identical action sequence. Seed streams diverge when decisions or added/removed rolls differ. Paired seeds are not identical realized combat paths, and these results do not prove optimal policies or universal human-play balance.

Inherited role differences remain: player-first initiative, player Duality versus enemy accuracy/critical resolution, player Hope versus enemy Fear income, enemy recovery-only responses, role-specific ability coefficients, support-action differences, and Finisher percentages. Hellfed enemy is the existing isolated offline adapter and has no new live AI. Mirror rates and the balanced-roster aggregate expose residual role bias. A single directional matchup rate also includes kit strength and is not a pure role-fairness measure.

## Aggregate role fairness and pacing

Equally weighted across all 16 ordered matchups (the roster is balanced on both roles):

` +
  table(
    [
      'Version',
      'Player win %',
      'Mean rounds',
      '10–20 rounds %',
      'Mirror mean absolute distance from 50 pp',
    ],
    experiments.map((e) => [
      e,
      f(summaries[e].win),
      f(summaries[e].rounds),
      f(summaries[e].pacing),
      f(summaries[e].mirrorError),
    ])
  )
const a = summaries.A,
  b = summaries.B,
  c = summaries.C
const roleCoefficients = []
for (const name of names) {
  const character = resolveCharacter(name),
    player = kitFor(character),
    enemy = kitFor({ ...character, isAI: true })
  for (const slot of ['special1', 'special2', 'special3'])
    for (const field of [
      'percent',
      'flatPercent',
      'healPercent',
      'ragePercent',
      'stressCost',
      'hopeCost',
      'hits',
      'requiredRecharge',
    ])
      if (
        JSON.stringify(player[slot][field]) !==
        JSON.stringify(enemy[slot][field])
      )
        roleCoefficients.push([
          name,
          player[slot].name,
          field,
          String(player[slot][field]),
          String(enemy[slot][field]),
        ])
}
text +=
  '\n\nExisting role-specific coefficients held fixed in every treatment (percent fields are percentages of Attack):\n\n' +
  table(['Fighter', 'Ability', 'Field', 'Player', 'Enemy'], roleCoefficients) +
  '\n\nThese are controls, not proposed changes or an attribution of the remaining gap to any one coefficient. Other role differences listed above are also held fixed.\n'
text += `\n\nB changes the aggregate player win rate by ${f(
  b.win - a.win
)} percentage points; C changes it by ${f(
  c.win - a.win
)}. Relative to the current aggregate gap to a 50% balanced-role benchmark, B changes that gap by ${f(
  ((b.win - a.win) / (50 - a.win)) * 100
)}% and C by ${f(
  ((c.win - a.win) / (50 - a.win)) * 100
)}%. These are descriptive fractions of this model's observed gap, not a universal attribution of disadvantage; an overshoot above 50% would indicate overcorrection on this aggregate. Both sides retain the other role differences listed above. Mirror error is useful alongside the aggregate because opposing kit biases can cancel in a mean.\n`
for (const e of ['B', 'A', 'C']) {
  text +=
    `\n## ${e}: player win matrix\n\nRows are player, columns enemy; Marq means Spooky Marq.\n\n` +
    table(
      ['Player', ...names],
      names.map((player) => [
        player,
        ...names.map((enemy) =>
          f(
            rows.find(
              (r) =>
                r.experiment === e && r.player === player && r.enemy === enemy
            ).winPercent
          )
        ),
      ])
    )
}
text +=
  '\n\n## Every matchup: win rate and duration\n\n' +
  table(
    [
      'Player → enemy',
      'A win %',
      'B win %',
      'B−A pp',
      'C win %',
      'C−A pp',
      'A rounds',
      'B rounds',
      'C rounds',
    ],
    names.flatMap((player) =>
      names.map((enemy) => {
        const find = (e) =>
            rows.find(
              (r) =>
                r.experiment === e && r.player === player && r.enemy === enemy
            ),
          a = find('A'),
          b = find('B'),
          c = find('C')
        return [
          `${player} → ${enemy}`,
          f(a.winPercent),
          f(b.winPercent),
          f(b.winPercent - a.winPercent),
          f(c.winPercent),
          f(c.winPercent - a.winPercent),
          f(a.averageRounds),
          f(b.averageRounds),
          f(c.averageRounds),
        ]
      })
    )
  )
text +=
  '\n\n## Basic, critical and offensive-special frequency\n\nPooled per-fight counts are averaged over the 16 cells. Per 100 rounds uses actual completed player-first rounds; lethal player actions can eliminate the response, so enemy counts per round can be below one even in A/B. Basic critical percentage uses actual basic attempts (including Blocks) as its denominator. Offensive-special count uses configuration attack types; support activations are excluded here and shown in the detailed slot table. Specials themselves never critical.\n\n' +
  table(
    [
      'Version',
      'Role',
      'Basics / fight',
      'Basics / 100 rounds',
      'Basic hit %',
      'Crits / fight',
      'Crits / 100 basics',
      'Offensive specials / fight',
      'Offensive specials / 100 rounds',
    ],
    experiments.flatMap((e) =>
      ['player', 'enemy'].map((side) => {
        const data = cells(e),
          basics = sum(data, (r) => r.perFight[side].basicAttempts),
          hits = sum(data, (r) => r.perFight[side].basicHits),
          crits = sum(data, (r) => r.perFight[side].criticalsBasic),
          rounds = sum(data, (r) => r.averageRounds),
          specials = sum(data, (r) => offensive(r, side))
        return [
          e,
          side,
          f(basics / 16),
          f((100 * basics) / rounds),
          f((100 * hits) / basics),
          f(crits / 16),
          f((100 * crits) / basics),
          f(specials / 16),
          f((100 * specials) / rounds),
        ]
      })
    )
  )
text +=
  '\n\nPooled slot activations (including support abilities):\n\n' +
  table(
    [
      'Version',
      'Role',
      'S1 / fight',
      'S2 / fight',
      'S3 / fight',
      'S2 / 100 rounds',
    ],
    experiments.flatMap((e) =>
      ['player', 'enemy'].map((side) => {
        const data = cells(e)
        return [
          e,
          side,
          ...['s1', 's2', 's3'].map((slot) =>
            f(sum(data, (r) => r.perFight[side][slot]) / 16)
          ),
          f(
            (100 * sum(data, (r) => r.perFight[side].s2)) /
              sum(data, (r) => r.averageRounds)
          ),
        ]
      })
    )
  )
text +=
  '\n\n## Every cell: basics, criticals and ability use\n\nAll values per fight, except pacing %. S1/S2 include their existing support activations; special3 is the guaranteed Finisher. Raw results also retain slot damage and Hope/Fear generation/spending. Existing telemetry assigns Slayer bonus damage to S2 delivery, so its slot damage is not purely direct-special damage. This experiment does not retune or rank character kits.\n\n' +
  table(
    [
      'Version',
      'Player → enemy',
      'Side',
      'Basics',
      'Basic Blocks',
      'Basic crits',
      'Special crits',
      'S1 uses',
      'S2 uses',
      'S3 uses',
      '10–20 rounds %',
    ],
    [...rows]
      .sort(
        (x, y) =>
          x.experiment.localeCompare(y.experiment) ||
          x.player.localeCompare(y.player) ||
          x.enemy.localeCompare(y.enemy)
      )
      .flatMap((r) =>
        ['player', 'enemy'].map((side) => {
          const s = r.perFight[side]
          return [
            r.experiment,
            `${r.player} → ${r.enemy}`,
            side,
            f(s.basicAttempts),
            f(s.blocksBasic),
            f(s.criticalsBasic),
            f(s.criticalsSpecial),
            f(s.s1),
            f(s.s2),
            f(s.s3),
            f(r.pacingPercent),
          ]
        })
      )
  )
text += `\n\nB is the best next playtest candidate for the stated alongside-basic concept and pacing priority. B and C have similar aggregate player wins (${f(
  b.win
)}% versus ${f(c.win)}%, a ${f(
  b.win - c.win
)}-point difference); this is not evidence of a decisive fairness advantage for B. C has a somewhat lower mirror error (${f(
  c.mirrorError
)} versus ${f(b.mirrorError)} points), while B is faster (${f(
  b.rounds
)} versus ${f(
  c.rounds
)} rounds) and has more fights in the 10–20-round band (${f(
  b.pacing
)}% versus ${f(
  c.pacing
)}%).\n\nAction economy accounts for a substantial part of the observed disadvantage in this model, but neither intervention establishes full role parity. In B, mirror player wins are ${names
  .map(
    (name) =>
      `${name} ${f(
        rows.find(
          (r) => r.experiment === 'B' && r.player === name && r.enemy === name
        ).winPercent
      )}%`
  )
  .join(
    ', '
  )}. In particular, Maxim remains far from 50%. Choose and freeze the economy before interpreting residual directional rates as character balance; the held-fixed role differences still need consideration. No character buff, nerf or coefficient adjustment is justified automatically by this experiment.\n`
text +=
  '\n\n## Interpretation limits and next decision\n\nCompare B against A first for the original alongside-basic concept, then C against A to distinguish adding player actions from removing enemy actions. Review mirror rates, aggregate bias and pacing together. Equalizing offense does not guarantee 50% player wins because the remaining role rules and support activations differ. Any recommendation should choose the desired action economy before a coefficient balance pass. These are offline candidates only; neither B nor C is activated.\n\nReproduce: `node scripts/arena-action-economy-report.js`, then `node scripts/arena-action-economy-summary.js`. The runner resumes complete cells, verifies the historical control source hashes, and rejects changes to its frozen model. Archive results and hashes to start over. Full verification: `verification.json`; unchanged live source/config hashes: `live-integrity.json`; regression and replay evidence are in this folder. A 10,000-fight win estimate near 50% has roughly ±1 percentage-point 95% binomial sampling uncertainty; close matchup differences should not be treated as conclusive.\n'
fs.writeFileSync(`${directory}/analysis.md`, text)
fs.writeFileSync(
  `${directory}/summary.json`,
  JSON.stringify(
    {
      summaries,
      bDelta: b.win - a.win,
      cDelta: c.win - a.win,
      bGapClosedPercent: ((b.win - a.win) / (50 - a.win)) * 100,
      cGapClosedPercent: ((c.win - a.win) / (50 - a.win)) * 100,
    },
    null,
    2
  )
)
console.log(summaries)
