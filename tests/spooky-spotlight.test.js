const test = require('node:test')
const assert = require('node:assert/strict')
const Sequelize = require('sequelize')
const core = require('../migrations/20261001000000-create-spooky-core')
const outbox = require('../migrations/20261001000002-create-spooky-notifications')
const { defineSpookyModels } = require('../services/spooky/models')
const { createEconomy } = require('../services/spooky/economy')
const { createNotifications } = require('../services/spooky/notifications')
const { config, pieces } = require('../services/spooky/config')
const settings = require('../config/spooky-spotlight.json')
const { latestReminderSlot } = require('../services/spooky/reminders')
const { ensureSpotlight, createSpotlight, validateSpotlight, pieceWeights } = require('../services/spooky/spotlight')
const channelId = '100000000000000001', roleId = '200000000000000001'

async function fixture(t) {
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => sequelize.close())
  await core.up(sequelize.getQueryInterface()); await outbox.up(sequelize.getQueryInterface())
  const models = defineSpookyModels(sequelize), event = { ...config, enabled: true }
  let now = new Date('2026-10-05T19:00:00Z'), fail = false
  const clock = () => now, sends = []
  const economy = createEconomy({ sequelize, models, clock }), notifications = createNotifications({ models })
  const channel = { id: channelId, guildId: 'guild', async send(payload) { sends.push(payload); if (fail) throw Error('ambiguous'); return { id: String(sends.length) } } }
  const make = (rotation = settings) => createSpotlight({ models, event, settings: rotation, economy, notifications, guildId: 'guild', clock, channelId, roleId, getChannel: async () => channel })
  const plan = (key, rotation = settings) => economy.execute({ eventId: event.eventId, guildId: 'guild', actorId: 'system', workerKey: key, operationType: 'test_plan' }, ctx => ensureSpotlight(ctx, models, event, rotation))
  return { models, event, sends, make, plan, economy, time: value => { now = new Date(value) }, fail: () => { fail = true } }
}

test('spotlight starts October 5 at noon Pacific, rotates four calendar days, ends with event', () => {
  const event = { ...config, enabled: true }
  const slot = time => latestReminderSlot(time, settings, event)
  assert.equal(slot('2026-10-05T18:59:59Z'), null)
  assert.equal(slot('2026-10-05T19:00:00Z'), '2026-10-05')
  assert.equal(slot('2026-10-09T18:59:59Z'), '2026-10-05')
  assert.equal(slot('2026-10-09T19:00:00Z'), '2026-10-09')
  assert.equal(slot('2026-10-13T19:00:00Z'), '2026-10-13')
  assert.equal(slot(config.endsAt), null)
  assert.throws(() => validateSpotlight({ ...settings, characters: ['had', 'hfm'] }), /artwork/)
  assert.throws(() => validateSpotlight({ ...settings, anchorDate: '2026-02-30' }), /anchor/)
})

test('draw weights boost only featured missing quarters by 25% relative to baseline', () => {
  for (const percent of [config.ordinaryRarity.percent, config.fate.rarityPercent]) {
    const candidates = pieces.filter(piece => piece.id !== 'had_tl')
    const base = pieceWeights(candidates, percent, null), boosted = pieceWeights(candidates, percent, 'had')
    for (let i = 0; i < base.length; i++) assert.equal(boosted[i].weight / base[i].weight, candidates[i].characterId === 'had' ? 1.25 : 1)
    assert.equal(boosted.some(item => item.piece.id === 'had_tl'), false)
    assert.deepEqual(pieceWeights(candidates.filter(piece => piece.characterId !== 'had'), percent, 'had'), pieceWeights(candidates.filter(piece => piece.characterId !== 'had'), percent, null))
  }
})

test('one announcement per slot survives restart and preserves thumbnail and Unwanted-only ping', async t => {
  const f = await fixture(t)
  await f.make().tick(); await f.make().tick()
  assert.equal(f.sends.length, 1)
  assert.equal(f.sends[0].embeds[0].title, 'Community Spotlight')
  assert.match(f.sends[0].embeds[0].description, /Hadley/)
  assert.deepEqual(f.sends[0].allowedMentions, { parse: [], users: [], roles: [roleId], repliedUser: false })
  assert.equal(f.sends[0].files[0].name, 'SPOOKY_HADLEY_BADGE.png')
  assert.match(f.sends[0].embeds[0].thumbnail.url, /SPOOKY_HADLEY_BADGE/)
  f.time('2026-10-09T19:00:00Z'); await f.make().tick()
  assert.match(f.sends[1].embeds[0].description, /Selene/)
  f.time('2026-10-13T19:00:00Z'); await f.make().tick()
  assert.match(f.sends[2].embeds[0].description, /Marq/)
  f.time('2026-10-17T19:00:00Z'); await f.make().tick()
  assert.match(f.sends[3].embeds[0].description, /Hadley/)
})

test('draw can freeze selection before announcement; appending artwork does not change active period', async t => {
  const f = await fixture(t), initial = { ...settings, characters: ['had', 'sel'] }
  f.time('2026-10-09T19:00:00Z')
  assert.equal((await f.plan('draw-first', initial)).receipt.characterId, 'sel')
  assert.equal((await f.plan('draw-expanded')).receipt.characterId, 'sel')
  await f.make().tick(); assert.equal(f.sends.length, 1)
  assert.match(f.sends[0].embeds[0].description, /Selene/)
  f.time('2026-10-13T19:00:00Z')
  assert.equal((await f.plan('next')).receipt.characterId, 'mrq')
})

test('downtime posts only current spotlight and ambiguous sends are not retried', async t => {
  const f = await fixture(t)
  f.time('2026-10-13T19:00:00Z'); f.fail()
  await assert.rejects(f.make().tick(), /ambiguous/)
  await f.make().tick()
  assert.equal(f.sends.length, 1)
  assert.match(f.sends[0].embeds[0].description, /Marq/)
  assert.equal(await f.models.Operation.count({ where: { operationType: 'spotlight_plan' } }), 1)
})

test('disabled, early and closed spotlight never announces; plan rolls back with failed root', async t => {
  const f = await fixture(t)
  f.time('2026-10-05T18:59:59Z'); await f.make().tick(); assert.equal(f.sends.length, 0)
  await f.make({ ...settings, enabled: false }).tick(); assert.equal(f.sends.length, 0)
  f.time('2026-10-05T19:00:00Z')
  await assert.rejects(f.economy.execute({ eventId: f.event.eventId, guildId: 'guild', actorId: 'system', workerKey: 'rollback', operationType: 'test' }, async ctx => {
    await ensureSpotlight(ctx, f.models, f.event); throw Error('rollback')
  }), /rollback/)
  assert.equal(await f.models.Operation.count(), 0)
  f.time(config.endsAt); await f.make().tick(); assert.equal(f.sends.length, 0)
})

test('live collection paths use spotlight weighting, keep two rolls and never award owned quarters', async t => {
  const f = await fixture(t)
  const participants = require('../services/spooky/participants').createParticipants({ models: f.models, economy: f.economy, event: f.event })
  const input = key => ({ eventId: f.event.eventId, guildId: 'guild', actorId: 'alice', interactionId: key, operationType: 'collection_test' })
  await participants.register(input('register'))
  let rolls = 0
  const collection = require('../services/spooky/collection').createCollection({ models: f.models, participants, event: f.event, random: () => { rolls++; return 0 } })
  for (const [key, draw] of [['ordinary', ctx => collection.drawQuarter(ctx, 'alice')], ['purchase', ctx => collection.drawFateQuarter(ctx, 'alice')], ['eyes', ctx => collection.creditEyes(ctx, 'alice', 5)]]) {
    const result = await f.economy.execute(input(key), draw)
    assert.equal(result.receipt.awards.length, 1)
    assert.equal(result.receipt.awards[0].duplicate, false)
    const before = rolls
    assert.equal((await f.economy.execute(input(key), draw)).replayed, true)
    assert.equal(rolls, before)
  }
  assert.equal(rolls, 6)
  assert.equal(await f.models.Operation.count({ where: { operationType: 'spotlight_plan' } }), 1)
  await f.make().tick(); assert.equal(f.sends.length, 1)
})
