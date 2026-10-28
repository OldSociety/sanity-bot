// Superseded pre-handoff rule assertions are retained in artifacts/winter-iron-progression-development-2026-10-27/before/. Native replacement coverage: winter-iron.test.js.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { Sequelize } = require('sequelize')
const { createEconomy } = require('../services/winter/economy')
const { config } = require('../services/winter/battle')
const { screen } = require('../services/winter/presentation')
const { createLive, keyFor } = require('../services/winter/live')

async function fixture(t, { snow = 1000, tier = 1, random = () => 0, settings = config } = {}) {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => db.close())
  let now = 0, id = 0
  const economy = createEconomy({ dropRandom: () => .99, sequelize: db, clock: () => now, random, battleSettings: settings, allowRestart: true })
  const execute = (action = 'status', quantity, extra = {}) => economy.execute({ guildId: 'g', userId: 'p', interactionId: `battle-${++id}`, action, quantity, ...extra })
  await execute()
  await db.query('UPDATE WinterPlayers SET snow=$snow,diamonds=30,tier=$tier', { bind: { snow, tier } })
  await db.query('UPDATE WinterProgress SET dummyHp=0')
  await db.query('UPDATE WinterShopProgress SET helped=1,snowmanOwned=1,snowmanHp=0')
  await db.query('UPDATE WinterKitchen SET spicyUnlocked=1,spicy=20')
  const bought = await execute('buy-sturdy')
  const start = () => execute('battle-start', bought.battle.fightId)
  const state = async () => JSON.parse((await db.query('SELECT state FROM WinterBattles'))[0][0].state)
  const replace = async change => {
    const value = { ...await state(), ...change }
    await db.query('UPDATE WinterBattles SET state=$state', { bind: { state: JSON.stringify(value) } })
    return value
  }
  return { db, economy, execute, bought, start, state, replace, now: () => now, at: value => { now = value } }
}
const buttons = payload => payload.components.flatMap(r => r.toJSON?.().components || r.components)

















test('cold scheduler does not initialize storage and configured event guards stop scheduled work', async t => {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => db.close())
  const economy = createEconomy({ dropRandom: () => .99, sequelize: db })
  assert.deepEqual(await economy.dueBattles(), [])
  const [tables] = await db.query("SELECT name FROM sqlite_master WHERE type='table'")
  assert.equal(tables.length, 0)
  const live = createLive({ getEconomy: () => { throw Error('Must not open storage') }, render: screen, canRun: () => false })
  await live.pulse()
})
