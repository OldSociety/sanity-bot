const { simulate, seededRandom, parseStats } = require('../services/idle/combat')
const { resolveCharacter } = require('../services/arena/characters')
const allocations = ['100,0,0', '0,100,0', '0,0,100', '50,30,20', '30,40,30', '20,20,60']
function report({ trials = 1000, seed = 1701, character = resolveCharacter('marq'),
  opponent = resolveCharacter('maxim'), builds = allocations, enemyStats, level = 1 } = {}) {
  if (!Number.isInteger(trials) || trials < 1 || trials > 100000) throw new Error('Trials must be 1–100000')
  return builds.map(build => {
    const stats = parseStats(build)
    const row = { character: character.label, opponent: opponent.label, stats,
      enemyStats: enemyStats || require('../config/idle-balance.json').enemyStats, trials, seed, level,
      wins: 0, unresolved: 0, durationSeconds: 0, damageDealt: 0, hopeGenerated: 0,
      fearGenerated: 0, stressConsumed: 0, stressSpent: 0, stressLost: 0,
      hopeAbilities: 0, stressAbilities: 0, basicAttacks: 0, remainingHP: 0 }
    for (let trial = 0; trial < trials; trial++) {
      const battle = simulate({ character, opponent, stats, enemyStats, level, random: seededRandom(seed + trial) })
      const s = battle.player.summary
      row.wins += Number(battle.status === 'victory')
      row.unresolved += Number(battle.status === 'limit')
      row.durationSeconds += battle.elapsedMs / 1000
      for (const key of ['damageDealt', 'hopeGenerated', 'fearGenerated', 'stressSpent', 'stressLost', 'hopeAbilities', 'stressAbilities']) row[key] += s[key]
      row.stressConsumed += s.stressSpent + s.stressLost
      row.basicAttacks += s.basic
      row.remainingHP += battle.player.hp
    }
    row.winRate = row.wins / trials
    for (const key of ['durationSeconds', 'damageDealt', 'hopeGenerated', 'fearGenerated', 'stressConsumed', 'stressSpent', 'stressLost', 'hopeAbilities', 'stressAbilities', 'basicAttacks', 'remainingHP'])
      row[key] = Number((row[key] / trials).toFixed(4))
    return row
  })
}
if (require.main === module) {
  // node scripts/idle-balance-report.js [trials] [seed]
  console.log(JSON.stringify(report({ trials: Number(process.argv[2] || 1000), seed: Number(process.argv[3] || 1701) }), null, 2))
}
module.exports = { report, allocations }
