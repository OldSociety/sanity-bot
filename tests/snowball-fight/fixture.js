const { Sequelize } = require('sequelize')
const { createStore } = require('../../services/winter/snowball-fight/store')
const rules = require('../../services/winter/snowball-fight/rules')
async function fixture(t, options = {}) {
  const db = new Sequelize({ dialect: 'sqlite', storage: options.storage || ':memory:', logging: false })
  t.after(() => db.close())
  let now = Date.UTC(2026, 10, 9, 12), id = 0, random = 0
  const store = createStore({ sequelize: db, clock: () => now, random: () => random, seed: () => 42, ...options })
  const execute = (action, extra = {}) => store.execute({ guildId: 'g', userId: 'p', interactionId: `i-${++id}`, action, ...extra })
  await execute('start')
  const read = async (table, where = '') => (await db.query(`SELECT * FROM ${table} ${where}`))[0]
  const edit = async fn => {
    const row = (await read('SnowFightPlayers', "WHERE guildId='g' AND userId='p'"))[0]
    const p = { ...row, state: JSON.parse(row.state) }
    fn(p)
    await db.query(`UPDATE SnowFightPlayers SET snowballs=$snow,buttons=$buttons,state=$state,hits=$hits,throws=$throws,wins=$wins,badges=$badges WHERE guildId='g' AND userId='p'`,
      { bind: { snow: p.snowballs, buttons: p.buttons, state: JSON.stringify(p.state), hits: p.state.hits, throws: p.state.throws, wins: p.state.wins, badges: p.state.badges } })
  }
  const battle = async (characterId = 'hen') => {
    let result = await execute('fight', { characterId })
    while (!result.battle.outcome) {
      result = await execute('attack', { battleId: result.battle.id, revision: result.battle.revision })
    }
    return result
  }
  return { db, store, execute, read, edit, battle, at: value => { now = value }, advance: ms => { now += ms }, random: value => { random = value }, now: () => now, rules }
}
module.exports = { fixture }
