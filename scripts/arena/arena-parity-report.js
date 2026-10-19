// Offline only. Run each ordered matchup in a fresh process.
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')
const names = ['Hellfed Marq', 'Marq', 'Maxim']
function run(playerIndex, enemyIndex, trials = 10000) {
  const { combat, policy } = require('./arena-parity-engine').setup()
  const { resolveCharacter } = require('../../services/arena/characters')
  const { healthCost } = require('../../services/arena/resources')
  const { kitFor } = require('../../services/arena/rules')
  const totals = { wins: 0, rounds: 0, pacing: 0, ledgerChecks: 0 }
  const categories = ['basic', 'special1', 'special2', 'special3']
  const sides = Object.fromEntries(
    ['player', 'enemy'].map((side) => [
      side,
      {
        uses: Object.fromEntries(categories.map((k) => [k, 0])),
        damage: Object.fromEntries(categories.map((k) => [k, 0])),
        decisions: {},
        hpPaid: 0,
        generated: 0,
        spent: 0,
        remaining: 0,
        brink: 0,
        hpRestored: 0,
        vulnerability: 0,
        finisherRage: [0, 0, 0, 0],
      },
    ]),
  )
  for (let trial = 0; trial < trials; trial++) {
    // Same starting stream in all cells; branching changes subsequent draws.
    let seed = (271828 + Math.imul(trial + 1, 2654435761)) >>> 0
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 4294967296
    }
    const die = (size) => () => 1 + Math.floor(random() * size)
    const pct = () => random() * 100
    let battle = combat.newBattle(0, {
      character: resolveCharacter(names[playerIndex]),
      opponent: names[enemyIndex],
    })
    const paid = { player: 0, enemy: 0 }
    while (battle.status === 'playing') {
      if (battle.tick > 1000) throw Error('Nonterminating parity fight')
      const specialTotal = (side) =>
        ['special1', 'special2', 'special3'].reduce(
          (sum, key) => sum + battle.statistics[side].damage[key],
          0,
        )
      const decision = policy(battle.player, battle.enemy, {
        context: {
          rounds: battle.tick,
          ownSpecialDamage: specialTotal('player'),
          opponentSpecialDamage: specialTotal('enemy'),
        },
      })
      const slot = decision.slot
      const hpPaid = healthCost(
        battle.player,
        slot ? kitFor(battle.player)[slot] : null,
      )
      paid.player += hpPaid
      sides.player.decisions[decision.reason] =
        (sides.player.decisions[decision.reason] || 0) + 1
      if (slot === 'special3')
        sides.player.finisherRage[battle.player.rage || 0]++
      const next = combat.takeTurn(
        battle,
        slot === 'special3' ? { special3: true, choice: 3 } : slot || 'basic',
        die(4),
        die(12),
        pct,
        () => Math.floor(pct()),
        () => Math.floor(pct()),
        pct,
        {
          aiPolicy: 'tactical',
          rollRecovery: pct,
          rollFinisher: () => 35 + Math.floor(random() * 11),
        },
      )
      if (next === battle) throw Error('Unavailable parity action')
      if (next.enemyDecision) {
        const reason = next.enemyDecision.reason
        sides.enemy.decisions[reason] = (sides.enemy.decisions[reason] || 0) + 1
        paid.enemy += healthCost(
          battle.enemy,
          next.enemySpecial ? kitFor(battle.enemy)[next.enemySpecial] : null,
        )
        if (next.enemySpecial === 'special3')
          sides.enemy.finisherRage[battle.enemy.rage || 0]++
      }
      for (const side of ['player', 'enemy']) {
        if (
          next[side].rage !== undefined &&
          !(next[side].rage >= 0 && next[side].rage <= 3)
        )
          throw Error('Rage bounds')
      }
      battle = next
    }
    totals.wins += Number(battle.status === 'victory')
    totals.rounds += battle.tick
    totals.pacing += Number(battle.tick >= 10 && battle.tick <= 20)
    for (const [side, other] of [
      ['player', 'enemy'],
      ['enemy', 'player'],
    ]) {
      const stat = battle.statistics[side]
      const expectedHp =
        battle[side].maxHp -
        battle.statistics[other].hpDamage -
        paid[side] +
        stat.hpRestored
      if (Math.abs(expectedHp - battle[side].hp) > 1e-8)
        throw Error(`HP ledger ${side}: ${expectedHp} != ${battle[side].hp}`)
      if (stat.initial + stat.generated - stat.spent !== stat.remaining)
        throw Error('Resource ledger')
      totals.ledgerChecks++
      sides[side].hpPaid += paid[side]
      for (const category of categories) {
        sides[side].uses[category] += stat.uses[category]
        sides[side].damage[category] += stat.damage[category]
      }
      for (const field of ['generated', 'spent', 'remaining', 'hpRestored'])
        sides[side][field] += stat[field]
      sides[side].brink += stat.brinkActivations
      sides[side].vulnerability += stat.vulnerabilityDamageTaken
    }
  }
  const average = (obj) =>
    typeof obj === 'number'
      ? obj / trials
      : Array.isArray(obj)
      ? obj.map(average)
      : Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, average(v)]))
  return {
    player: names[playerIndex],
    enemy: names[enemyIndex],
    trials,
    seed: 271828,
    winPercent: (totals.wins / trials) * 100,
    averageRounds: totals.rounds / trials,
    pacingPercent: (totals.pacing / trials) * 100,
    totals,
    perFight: average(sides),
  }
}
if (require.main === module) {
  if (process.argv[2] !== undefined)
    process.stdout.write(
      JSON.stringify(
        run(
          Number(process.argv[2]),
          Number(process.argv[3]),
          Number(process.argv[4] || 10000),
        ),
      ),
    )
  else {
    fs.mkdirSync('artifacts/arena-parity', { recursive: true })
    const results = []
    for (let p = 0; p < 3; p++)
      for (let e = 0; e < 3; e++) {
        const result = JSON.parse(
          execFileSync(process.execPath, [__filename, String(p), String(e)], {
            env: { ...process.env, NODE_ENV: 'development' },
            encoding: 'utf8',
            maxBuffer: 1024 * 1024,
          }),
        )
        results.push(result)
        fs.writeFileSync(
          `artifacts/arena-parity/${p}-${e}.json`,
          JSON.stringify(result, null, 2),
        )
        console.log(
          result.player,
          'vs',
          result.enemy,
          result.winPercent,
          result.averageRounds,
        )
      }
    fs.writeFileSync(
      'artifacts/arena-parity/results.json',
      JSON.stringify(results, null, 2),
    )
  }
}
module.exports = { run }
