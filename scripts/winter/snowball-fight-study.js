// Offline only. Uses the exact encounter rules and transactional store; never imported by the bot.
const fs = require('node:fs')
const path = require('node:path')
const { Sequelize } = require('sequelize')
const { createHash } = require('node:crypto')
const R = require('../../services/winter/snowball-fight/rules')
const { createStore, GameError } = require('../../services/winter/snowball-fight/store')
function seeded(initial) {
  let state = initial >>> 0
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296 }
}
function encounters(count = 5000) {
  const rng = seeded(314159)
  return R.config.characters.filter(c => c.enabled).map(character => {
    let wins = 0, rounds = 0, snowballs = 0
    for (let i = 0; i < count; i++) {
      const battle = { character, rules: R.config.combat, seed: Math.floor(rng() * 4294967296),
        hp: R.config.combat.playerHp, enemyHp: character.hp, rounds: 0, spent: 0, heals: 0, revision: 0 }
      while (!battle.outcome) R.turn(battle, 'attack')
      wins += Number(battle.outcome === 'victory'); rounds += battle.rounds; snowballs += battle.spent
    }
    const rate = wins / count
    return { character: character.id, fights: count, wins, winRate: rate, averageRounds: rounds / count,
      snowballsPerVictoryIncludingLosses: snowballs / wins,
      expectedButtonsOneAttemptPerDay: rate * R.config.combat.reward,
      expectedAttemptsToBadge: R.config.combat.badgeVictories / rate,
      minimumBadgeDays: R.config.combat.badgeVictories,
      expectedDaysOneAttemptPerDay: R.config.combat.badgeVictories / rate }
  })
}
async function economy(kind) {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  const rng = seeded(271828), days = []
  let now = Date.UTC(2026, 10, 9, 12), id = 0, capacityStops = 0, failures = 0, actions = 0
  const store = createStore({ sequelize: db, clock: () => now, random: rng, seed: () => Math.floor(rng() * 4294967296) })
  const run = async (action, extra = {}) => {
    try { actions++; return await store.execute({ guildId: 'study', userId: 'player', interactionId: `${kind}-${++id}`, action, ...extra }) }
    catch (error) { if (!(error instanceof GameError)) throw error; if (/full|space|room/.test(error.message)) capacityStops++; failures++; return null }
  }
  try {
    await run('start')
    if (kind === 'active') for (let i = 0; i < 4; i++) await run('start', { userId: `target-${i}` })
    for (let day = 0; day < 7; day++) {
      now = Date.UTC(2026, 10, 9 + day, 12)
      await run('daily')
      for (let n = 0; n < (kind === 'active' ? 12 : 2); n++) { await run('collect'); now += 60000 }
      let state = (await run('stats')).player
      // A cosmetic creates an attainable, non-power spending goal for both play styles.
      if (!state.state.snowflake && state.buttons >= 40) await run('buy', { itemId: 'snowflake' })
      const roster = R.config.characters.filter(c => c.enabled)
      for (const character of kind === 'active' ? roster : [roster[day % 3]]) {
        let fight = await run('fight', { characterId: character.id })
        if (!fight) continue
        while (!fight.battle.outcome) {
          if (fight.player.snowballs === 0) {
            await run('buy', { itemId: 'snowballs' })
            fight = await run('fight')
            if (fight.player.snowballs === 0) { await run('retreat', { battleId: fight.battle.id, revision: fight.battle.revision }); break }
          }
          fight = await run('attack', { battleId: fight.battle.id, revision: fight.battle.revision })
          if (!fight) throw Error('Study generated an invalid encounter turn')
        }
      }
      if (kind === 'active') {
        for (let n = 0; n < 20; n++) {
          state = (await run('stats')).player
          if (!state.snowballs && state.buttons >= 5) await run('buy', { itemId: 'snowballs' })
          await run('throw', { targetId: `target-${n % 4}` }); now += 10000
        }
        await run('gift', { targetId: 'target-0', amount: 1 })
      }
      await run('claim')
      state = (await run('stats')).player
      days.push({ day: day + 1, snowballs: state.snowballs, buttons: state.buttons, wins: state.state.wins,
        badges: state.state.badges, hits: state.state.hits, pvpButtons: state.state.pvpRewards,
        achievements: state.state.achievements.length, cosmeticOwned: Boolean(state.state.snowflake) })
    }
    const ledger = (await db.query(`SELECT resource,reason,SUM(delta) AS total FROM SnowFightLedger WHERE userId='player' GROUP BY resource,reason ORDER BY resource,reason`))[0]
    const marks = (await db.query('SELECT characterId,marks FROM SnowFightBadgeProgress WHERE userId=\'player\''))[0]
    const balances = (await db.query(`SELECT resource,SUM(delta) AS total FROM SnowFightLedger WHERE userId='player' GROUP BY resource`))[0]
    const final = days.at(-1)
    if (balances.find(b => b.resource === 'snowballs').total !== final.snowballs || balances.find(b => b.resource === 'buttons').total !== final.buttons) throw Error('Study ledger does not reconcile')
    return { kind, days, ledger, marks, actionsIncludingReads: actions, capacityStops, rejectedActions: failures }
  } finally { await db.close() }
}
async function main() {
  const sources = ['config/winter/snowball-fight.json', 'services/winter/snowball-fight/rules.js', 'services/winter/snowball-fight/store.js']
  const report = {
    assumptions: 'Seeded baseline attacks, no cocoa in balance runs; 5,000 fights per character. Seven-day scenarios are one reproducible sample each, not population estimates. Casual: daily, two collections and one rotating character fight/day; active: daily, twelve collections, three character fights, twenty throws across four enrolled targets and one gift/day. Both buy the cosmetic when affordable and ammunition when needed. No idle accrual. Badge marks require distinct UTC days.',
    sourceHashes: Object.fromEntries(sources.map(file => [file, createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '../..', file))).digest('hex')])),
    encounters: encounters(), economy: [await economy('casual'), await economy('active')]
  }
  const out = path.resolve(__dirname, '../../artifacts/snowball-fight')
  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, 'study.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ encounters: report.encounters, economy: report.economy.map(e => ({ kind: e.kind, final: e.days.at(-1), marks: e.marks, capacityStops: e.capacityStops, rejectedActions: e.rejectedActions })) }, null, 2))
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1 })
module.exports = { seeded, encounters, economy }
