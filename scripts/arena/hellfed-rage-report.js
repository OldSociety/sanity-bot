// Pure combat simulation. No Discord, database, preferences or live state access.
const { newBattle, takeTurn } = require('../../services/arena/combat')
const { resolveCharacter } = require('../../services/arena/characters')
const { canUse, balance, kitFor } = require('../../services/arena/rules')
const { healthCost } = require('../../services/arena/resources')
const { specialDamage } = require('../../services/arena/damage')
const { preview } = require('../../services/arena/tactics')

function choose(battle, strategy) {
  const p = battle.player,
    e = battle.enemy
  const ready = (slot) => canUse(p, slot)
  // All cohorts share Hope spending: finisher first; S2 for a lethal hit or
  // low survival, otherwise save. Strategies differ only in building Rage.
  const incoming = preview(e, p).expected
  const s2 =
    ready('special2') &&
    specialDamage(p, 'special2').damage >= e.hp &&
    !(e.passive === 'on-the-brink' && !e.brinkUsed)
  const spend = ready('special3')
    ? 'special3'
    : ready('special2') && (s2 || p.hp <= incoming * 4)
    ? 'special2'
    : null
  if (strategy === 'B' && ready('special1')) return 'special1'
  if (spend) return spend
  if (
    strategy === 'C' &&
    ready('special1') &&
    p.hp > p.maxHp * 0.55 &&
    p.hp - healthCost(p, kitFor(p).special1) > incoming * 6 &&
    p.hope < 3 &&
    e.hp > specialDamage(p, 'special2').damage
  )
    return 'special1'
  return 'basic'
}
function simulate({ trials = 10000, seed = 271828 } = {}) {
  if (process.env.NODE_ENV !== 'development')
    throw Error('Run with NODE_ENV=development')
  const rows = []
  for (const opponent of ['marq', 'maxim'])
    for (const strategy of ['A', 'B', 'C']) {
      const sums = {
        wins: 0,
        rounds: 0,
        inRange: 0,
        s1: 0,
        s1Opportunities: 0,
        s1ByStartingRage: [0, 0, 0],
        refillsAfterReachingFull: 0,
        s1WhileS2Affordable: 0,
        s1WhileS3Affordable: 0,
        refillPatterns: { always: 0, sometimes: 0, never: 0 },
        hpSacrificed: 0,
        s2Uses: 0,
        s3Uses: 0,
        s2Damage: 0,
        s3Damage: 0,
        victoryRage: 0,
        defeatRage: 0,
        deathsWithHope: 0,
        hopeAtDeath: 0,
        lowHpDisabledTurns: 0,
        lowHpDisabledFights: 0,
        finishersByRage: [0, 0, 0, 0],
        finisherDamageByRage: [0, 0, 0, 0],
        misses: 0,
        rageLost: 0,
      }
      for (let trial = 0; trial < trials; trial++) {
        let state =
          (seed +
            Math.imul(trial + 1, 2654435761) +
            (opponent === 'maxim' ? 1000003 : 0)) >>>
          0
        const random = () => {
          state = (Math.imul(state, 1664525) + 1013904223) >>> 0
          return state / 4294967296
        }
        const die = (sides) => () => 1 + Math.floor(random() * sides)
        const pct = () => random() * 100,
          integer = () => Math.floor(pct())
        let b = newBattle(0, {
            character: resolveCharacter('Hellfed Marq'),
            opponent,
          }),
          lowHp = false,
          reachedFull = false,
          legalStokeTurns = 0,
          stokes = 0
        while (b.status === 'playing') {
          if (b.tick >= 1000) throw Error('Nonterminating fight')
          if (
            b.player.hp <= healthCost(b.player, kitFor(b.player).special1) &&
            b.player.rage < 3
          ) {
            sums.lowHpDisabledTurns++
            lowHp = true
          }
          const slot = choose(b, strategy)
          if (canUse(b.player, 'special1')) {
            sums.s1Opportunities++
            legalStokeTurns++
          }
          const next = takeTurn(
            b,
            slot === 'special3' ? { special3: true, choice: 3 } : slot,
            die(4),
            die(12),
            pct,
            integer,
            integer,
            pct,
            {
              aiPolicy: 'tactical',
              rollRecovery: pct,
              rollFinisher: () => 35 + Math.floor(random() * 11),
            },
          )
          if (next === b) throw Error('Unavailable action')
          if (slot === 'special1') {
            sums.s1++
            stokes++
            sums.s1ByStartingRage[b.player.rage]++
            sums.refillsAfterReachingFull += Number(reachedFull)
            sums.s1WhileS2Affordable += Number(canUse(b.player, 'special2'))
            sums.s1WhileS3Affordable += Number(canUse(b.player, 'special3'))
            sums.hpSacrificed += healthCost(b.player, kitFor(b.player).special1)
          }
          reachedFull ||= next.player.rage === 3
          if (
            next.history
              .slice(b.history.length)
              .some((e) => e.kind === 'roll' && !e.success)
          )
            sums.misses++
          sums.rageLost += Number(
            next.history
              .slice(b.history.length)
              .some((event) => event.kind === 'rageMiss'),
          )
          if (slot === 'special3') {
            sums.finishersByRage[b.player.rage]++
            sums.finisherDamageByRage[b.player.rage] += next.special3Damage
          }
          b = next
        }
        sums.rounds += b.tick
        sums.refillPatterns[
          stokes === 0
            ? 'never'
            : stokes === legalStokeTurns
            ? 'always'
            : 'sometimes'
        ]++
        sums.inRange += Number(b.tick >= 10 && b.tick <= 20)
        const win = b.status === 'victory'
        sums.wins += Number(win)
        sums[win ? 'victoryRage' : 'defeatRage'] += b.player.rage
        if (!win) {
          sums.deathsWithHope += Number(b.player.hope > 0)
          sums.hopeAtDeath += b.player.hope
        }
        sums.lowHpDisabledFights += Number(lowHp)
        for (const n of [2, 3]) {
          sums[`s${n}Uses`] += b.statistics.player.uses[`special${n}`]
          sums[`s${n}Damage`] += b.statistics.player.damage[`special${n}`]
        }
      }
      const defeats = trials - sums.wins
      rows.push({
        ruleset: 'hellfed-guaranteed-stoke-tiered-hp-v4',
        opponent,
        strategy,
        trials,
        seed,
        winPercent: (sums.wins * 100) / trials,
        averageRounds: sums.rounds / trials,
        rounds10to20Percent: (sums.inRange * 100) / trials,
        averageRageVictory: sums.wins ? sums.victoryRage / sums.wins : null,
        averageRageDefeat: defeats ? sums.defeatRage / defeats : null,
        averageS1: sums.s1 / trials,
        averageHpSacrificed: sums.hpSacrificed / trials,
        averageS2Uses: sums.s2Uses / trials,
        averageS3Uses: sums.s3Uses / trials,
        averageS2Damage: sums.s2Damage / trials,
        averageS3Damage: sums.s3Damage / trials,
        averageHopeSpentS2: (sums.s2Uses * 2) / trials,
        averageHopeSpentS3: (sums.s3Uses * 5) / trials,
        s2ShareOfHopeSpentPercent:
          sums.s2Uses + sums.s3Uses > 0
            ? (sums.s2Uses * 2 * 100) / (sums.s2Uses * 2 + sums.s3Uses * 5)
            : 0,
        stokeOpportunityUsePercent: sums.s1Opportunities
          ? (sums.s1 * 100) / sums.s1Opportunities
          : 0,
        averageRefillsAfterReachingFull: sums.refillsAfterReachingFull / trials,
        refillPatternFightPercent: Object.fromEntries(
          Object.entries(sums.refillPatterns).map(([key, value]) => [
            key,
            (value * 100) / trials,
          ]),
        ),
        deathWithUnspentHopePercent: defeats
          ? (sums.deathsWithHope * 100) / defeats
          : null,
        averageHopeAtDeath: defeats ? sums.hopeAtDeath / defeats : null,
        lowHpDisabledFightPercent: (sums.lowHpDisabledFights * 100) / trials,
        averageLowHpDisabledTurns: sums.lowHpDisabledTurns / trials,
        averageRageLost: sums.rageLost / trials,
        ...{ totals: sums },
      })
    }
  return rows
}
function markdown(rows) {
  const f = (n) => (n === null ? '—' : n.toFixed(2))
  const comparisons = ['marq', 'maxim']
    .map((opponent) => {
      const cohort = rows.filter((row) => row.opponent === opponent)
      const a = cohort.find((row) => row.strategy === 'A')
      const b = cohort.find((row) => row.strategy === 'B')
      const c = cohort.find((row) => row.strategy === 'C')
      const leading = [...cohort].sort((x, y) => y.winPercent - x.winPercent)[0]
      return `Against ${opponent}, ${
        leading.strategy
      } has the highest measured win rate (${f(
        leading.winPercent,
      )}%). A minus B is ${f(
        a.winPercent - b.winPercent,
      )} percentage points; A minus C is ${f(
        a.winPercent - c.winPercent,
      )}. B sacrifices ${f(b.averageHpSacrificed)} HP across ${f(
        b.averageS1,
      )} Stoke turns, casting ${f(b.averageS3Uses)} Finishers versus A's ${f(
        a.averageS3Uses,
      )}. C casts ${f(
        c.totals.finishersByRage[3] / c.trials,
      )} full-Rage Finishers per fight.`
    })
    .join('\n\n')
  return (
    '# Hellfed Marq Rage prototype — Level 1\n\n' +
    `${rows[0].trials} fights per strategy and opponent; ${rows.reduce(
      (s, r) => s + r.trials,
      0,
    )} total. Seed ${
      rows[0].seed
    }; independent deterministic seed per fight, reused across strategy cohorts. Actual player-first engine; development 2/5 opponents with tactical AI; Hellfed costs 2/5. S1 costs ceil(1% / 2% / 3% max HP) to gain the next Rage bar, keeps the Duality roll but guarantees the basic hit, then gains Rage. Critical effects revision: ${Boolean(
      balance.criticalEffects,
    )}. Criticals grant their side one usable resource (player Hope / enemy Fear), restore up to one own Stress, and remove up to one opponent Stress; Hellfed remains Stress-immune. Enemy critical Fear is credited after action selection. Starting Hope 0, Rage 0; 260 HP / 200 Attack. No automatic tuning.\n\n` +
    'A avoids Stoke. B uses Stoke whenever legal until Rage 3, including rebuilding after misses, before spending Hope. C builds only above 55% HP, with more than six expected basic-response turns after sacrifice, Hope below 3 and no immediate spending opportunity. All share Hope policy: S3 first; S2 when lethal or HP is at most four expected enemy-basic hits, otherwise save. C takes these damage opportunities before Stoke. Thresholds are provisional heuristics, not optimized.\n\n' +
    'Valid Finisher button 3 always gives base 45% + 8 points per Rage. No latency/timeouts modeled. Actual timeout remains base 30% plus Rage bonus; valid button range 35–55%, with 30% at timeout, matching the current engine. Enemy actions retain their independent accuracy, tactical decisions, Fear spending and 8% Stress recovery; S1 now generates Hope/Fear through its normal basic roll. Rounds count one player action plus a surviving enemy response. Damage includes overkill.\n\n' +
    '| AI | Strategy | Win % | Rounds | 10–20 % | Rage win / loss | S1 | HP paid | S2 uses / damage | S3 uses / damage | Deaths holding Hope % | Low-HP blocked fights % |\n|---|---|---:|---:|---:|---|---:|---:|---|---|---:|---:|\n' +
    rows
      .map(
        (r) =>
          `| ${r.opponent} | ${r.strategy} | ${f(r.winPercent)} | ${f(
            r.averageRounds,
          )} | ${f(r.rounds10to20Percent)} | ${f(r.averageRageVictory)} / ${f(
            r.averageRageDefeat,
          )} | ${f(r.averageS1)} | ${f(r.averageHpSacrificed)} | ${f(
            r.averageS2Uses,
          )} / ${f(r.averageS2Damage)} | ${f(r.averageS3Uses)} / ${f(
            r.averageS3Damage,
          )} | ${f(r.deathWithUnspentHopePercent)} | ${f(
            r.lowHpDisabledFightPercent,
          )} |`,
      )
      .join('\n') +
    '\n\nFinisher counts by Rage 0 / 1 / 2 / 3 (10,000 fights per row):\n\n' +
    rows
      .map(
        (r) =>
          `- ${r.opponent} ${r.strategy}: ${r.totals.finishersByRage.join(
            ' / ',
          )}`,
      )
      .join('\n') +
    '\n\n## Hope spending and Rage refilling\n\n| AI | Strategy | S1 use / legal opportunities % | Refills after first full Rage / fight | Hope spent S2 / S3 per fight | S2 share of Hope spending % | Always / sometimes / never refill fights % |\n|---|---|---:|---:|---|---:|---|\n' +
    rows
      .map(
        (r) =>
          `| ${r.opponent} | ${r.strategy} | ${f(
            r.stokeOpportunityUsePercent,
          )} | ${f(r.averageRefillsAfterReachingFull)} | ${f(
            r.averageHopeSpentS2,
          )} / ${f(r.averageHopeSpentS3)} | ${f(
            r.s2ShareOfHopeSpentPercent,
          )} | ${['always', 'sometimes', 'never']
            .map((key) => f(r.refillPatternFightPercent[key]))
            .join(' / ')} |`,
      )
      .join('\n') +
    '\n\nThe refill choices are prescribed policies, not learned behavior: A never Stokes, B Stokes at every legal opportunity, C does so conditionally. A fight counts as always only if every legal S1 decision uses S1; sometimes if some do; never if none do. Refills after first full Rage count S1 activations after reaching Rage 3 earlier in the fight, separating upkeep from the initial build. Raw data also counts S1 choices while S2/S3 are affordable and S1 activations at each starting Rage.\n\nJSON includes raw counts, damage by Finisher Rage, average Hope at death, low-HP disabled turns and Rage lost. Low-HP blocks count decision boundaries with HP at most the current sacrifice and Rage <3, regardless of chosen strategy; death-with-Hope percentage uses defeats as denominator. Failed Duality rolls are counted separately from actual missed basics: a guaranteed S1 hit never loses Rage. Adaptive thresholds and all other policy rules are unchanged; its survival check uses the new actual sacrifice.\n' +
    '\n## Interpretation\n\n' +
    comparisons +
    '\n\nThese are comparisons of the specified policies, not an exhaustive strategy search. Hope at death includes amounts below S2 affordability. All provisional damage values remain unchanged.\n'
  )
}
if (require.main === module) {
  const fs = require('node:fs'),
    root = 'artifacts/hellfed-rage'
  const rows = simulate()
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(`${root}/balance.json`, JSON.stringify(rows, null, 2))
  fs.writeFileSync(`${root}/balance.md`, markdown(rows))
  console.table(
    rows.map(
      ({ opponent, strategy, winPercent, averageRounds, averageS1 }) => ({
        opponent,
        strategy,
        winPercent,
        averageRounds,
        averageS1,
      }),
    ),
  )
}
module.exports = { choose, simulate, markdown }
