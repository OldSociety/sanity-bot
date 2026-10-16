// Offline only: no Discord, database, economy, or environment imports.
const { newBattle, advance } = require('../services/arena/combat')
function simulate({ trials = 1000, seed = 1792 } = {}) {
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const die = sides => () => 1 + Math.floor(random() * sides)
  const d4 = die(4), d12 = die(12), percentile = () => Math.floor(random() * 100)
  const rows = []
  for (const level of [1, 5, 20]) for (const policy of ['combo-first', 'hope-first', 'idle', ...(level >= 20 ? ['power-first'] : [])]) {
    const turns = []; let wins = 0, attempts = 0, misses = 0, criticals = 0
    for (let trial = 0; trial < trials; trial++) {
      let battle = newBattle(0, { level, mode: policy === 'idle' ? 'idle' : 'active' })
      while (battle.status === 'playing' && battle.tick < 10000) {
        const hope = level >= 5 && battle.marq.hope > 0
        const combo = battle.marq.stress > 0
        const action = policy === 'idle' ? 'continue'
          : policy === 'power-first' && battle.marq.hope >= 2 ? 'third'
            : policy === 'hope-first' && hope ? 'hope' : combo ? 'combo' : hope ? 'hope' : 'continue'
        battle = advance(battle, action, d4, d12, percentile, percentile, percentile)
        attempts += Number(battle.enemyOutcome !== null)
        misses += Number(battle.enemyOutcome === 'miss')
        criticals += Number(battle.enemyOutcome === 'critical')
      }
      if (battle.status === 'playing') throw Error('Simulation did not terminate')
      turns.push(battle.tick); wins += Number(battle.status === 'victory')
    }
    turns.sort((a, b) => a - b)
    rows.push({ level, policy, trials, meanTurns: Number((turns.reduce((sum, n) => sum + n, 0) / trials).toFixed(1)),
      median: turns[Math.floor(trials / 2)], p10: turns[Math.floor(trials * 0.1)], p90: turns[Math.floor(trials * 0.9)],
      winPercent: Number((wins * 100 / trials).toFixed(1)), attempts, misses, criticals })
  }
  return rows
}
if (require.main === module) console.table(simulate())
module.exports = { simulate }
