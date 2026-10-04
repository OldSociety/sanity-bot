const test = require('node:test')
const assert = require('node:assert/strict')
const Sequelize = require('sequelize')
const defineUser = require('../Models/User/User')
const migration = require('../migrations/20261001000000-create-spooky-core')
const { defineSpookyModels } = require('../services/spooky/models')
const { createEconomy } = require('../services/spooky/economy')
const { createParticipants } = require('../services/spooky/participants')
const { createEffects } = require('../services/spooky/effects')
const { createCollection } = require('../services/spooky/collection')
const { createTheft } = require('../services/spooky/theft')
const { createPlayful } = require('../services/spooky/playful')
const { createProgression } = require('../services/spooky/progression')
const { createActions } = require('../services/spooky/actions')
const { createFatePurchases } = require('../services/spooky/fate-purchases')
const { config } = require('../services/spooky/config')
const { memoryGuild, seededRandom, summarize } = require('../scripts/spooky-population-simulation')

test('population adapter matches a seeded actual SQLite gameplay trajectory', async t => {
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => sequelize.close())
  const User = defineUser(sequelize, Sequelize.DataTypes); await User.sync()
  await migration.up(sequelize.getQueryInterface())
  await require('../migrations/20261001000001-create-spooky-delivery').up(sequelize.getQueryInterface())
  const models = defineSpookyModels(sequelize), event = { ...config, enabled: true }
  let now = Date.parse(config.startsAt), key = 0
  const economy = createEconomy({ sequelize, models, configVersion: config.version, clock: () => new Date(now) })
  const participants = createParticipants({ models, economy, event })
  const effects = createEffects({ models, participants, event })
  const random = seededRandom(170026)
  const collection = createCollection({ models, participants, event, random })
  const members = Array.from({ length: 4 }, (_, index) => ({ userId: String(index), bot: false,
    displayName: `Player ${index}`, nickname: null, roleIds: [], canManageCurse: true,
    canManageNickname: true, canManageSweetTooth: true }))
  const delivery = { async enqueue(_ctx, id, type, values) {
    const m = members.find(m => m.userId === id)
    if (type === 'nickname') m.nickname = values.nickname
    else { m.roleIds = m.roleIds.filter(r => r !== values.roleId); if (values.present) m.roleIds.push(values.roleId) }
  } }
  const listMembers = async () => members
  const playful = createPlayful({ models, participants, effects, collection, delivery, listMembers,
    roleIds: { curse: 'curse', sweetTooth: 'sweet' }, event, random })
  const theft = createTheft({ models, participants, collection, effects, delivery, listMembers, event, random })
  const progression = createProgression({ User, models, event, isUnwanted: async () => true })
  const actions = createActions({ models, economy, participants, event, random,
    getCrownHolder: playful.crownHolder,
    handlers: progression.wrapHandlers({ ...playful.handlers, ...theft.handlers, ...require('../services/spooky/candy-events').createCandyEvents({ models, participants, effects, delivery, listMembers, event, random }).handlers }), getCurseState: effects.getCurseState })
  const fate = createFatePurchases({ User, models, economy, collection, event })
  const scope = { eventId: config.eventId, guildId: 'simulation' }
  const input = id => ({ ...scope, actorId: id, interactionId: `parity-${key++}` })
  const fast = memoryGuild(Array.from({ length: 4 }, () => ({ profile: 'regular' })),
    { bank: 20, unwanted: true }, seededRandom(170026))
  for (let id = 0; id < 4; id++) {
    await economy.execute({ ...input(String(id)), operationType: 'register' }, async ctx => {
      await participants.prepare(ctx, String(id), { register: true }); return {}
    })
    await User.create({ user_id: String(id), user_name: `Player ${id}`, bank: 20 })
    await fast.register(String(id), now)
  }
  async function buy(id) {
    while ((await User.findByPk(id)).bank >= 10) await fate.purchase(input(id))
    await fast.fate(id, now)
  }
  for (let id = 0; id < 4; id++) await buy(String(id))
  const outcomes = new Set()
  // Enough candy, curse exposure, gifts, heists, shields and draws to exercise
  // the adapter's ORM snapshot semantics and zero-sum bookkeeping.
  for (let i = 0; i < 400; i++) {
    now = Date.parse(config.startsAt) + i * 3600000
    const id = String(i % 4), action = i % 3 ? 'treat' : 'trick'
    let succeeded = true
    try {
      const result = await actions.execute({ ...input(id), action })
      outcomes.add(result.receipt.outcome)
    } catch (error) {
      if (!['NO_REVERSAL_TARGET', 'NO_CANDY_TARGET'].includes(error.code)) throw error
      succeeded = false
    }
    assert.equal(await fast.action(id, action, now), succeeded)
    const current = await models.Participant.findOne({ where: { userId: id } })
    assert.equal(fast.players.get(id).candy, current.candy, `candy parity at action ${i}`)
    await buy(id)
  }
  assert.ok(outcomes.has('great_heist') && outcomes.has('steal_or_find_eye') && outcomes.has('sweet_tooth'))
  assert.ok(outcomes.has('curse_distribute_three') || outcomes.has('curse_distribute_two'))
  const reports = fast.finish() // Also verifies whole-guild conservation.
  for (let id = 0; id < 4; id++) {
    const player = await models.Participant.findOne({ where: { userId: String(id) } })
    const simulated = fast.players.get(String(id)), report = reports[id]
    for (const field of ['candy', 'eyes', 'treatPrestige', 'trickPrestige']) assert.equal(simulated[field], player[field], field)
    assert.equal(new Date(simulated.refillAnchor).getTime(), new Date(player.refillAnchor).getTime())
    assert.equal(report.bank, (await User.findByPk(String(id))).bank)
    const inventory = await models.Inventory.findAll({ where: { participantId: player.id } })
    assert.equal(report.pieces, inventory.length)
    assert.equal(report.duplicatesRemaining, inventory.reduce((n, r) => n + r.quantity - 1, 0))
    assert.deepEqual(fast.members[id].roleIds.sort(), members[id].roleIds.sort())
    assert.equal(fast.members[id].nickname, members[id].nickname)
  }
})

test('milestone summaries count never reached separately from conditional timing', () => {
  const empty = { profile: 'casual', milestones: {} }
  const reached = { profile: 'casual', milestones: { quarter: 5.5, character: 30 } }
  const result = summarize([empty, reached]).casual
  assert.equal(result.milestones.character.probability, 0.5)
  assert.equal(result.milestones.character.never, 1)
  assert.equal(result.milestones.character.calendarDayWhenReached.median, 30)
  assert.equal(result.milestones.seven.calendarDayWhenReached.median, null)
})
