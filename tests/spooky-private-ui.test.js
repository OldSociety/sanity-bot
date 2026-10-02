const test = require('node:test')
const assert = require('node:assert/strict')
const Sequelize = require('sequelize')
const { config } = require('../services/spooky/config')
const { eligible, claimNudge } = require('../services/spooky/private-nudges')
const { balanceFooter, withBalances } = require('../services/spooky/presentation')
const { wordingPages, previewPayload } = require('../services/spooky/wording-preview')
const { calculateRefill } = require('../services/spooky/participants')

test('shared candy clock aligns new and returning players without starter catch-up or cap surplus', () => {
  const start = Date.parse(config.startsAt), interval = config.candy.refillIntervalMs
  for (const offset of [60000, interval - 1]) {
    const refill = calculateRefill({ candy: 10, refillAnchor: start + offset, now: start + interval, event: config })
    assert.equal(refill.candy, 11); assert.equal(refill.refillAnchor.getTime(), start + interval)
  }
  const full = calculateRefill({ candy: 80, refillAnchor: start, now: start + interval * 10 + 60000 })
  assert.equal(calculateRefill({ candy: 79, refillAnchor: full.refillAnchor, now: start + interval * 11 - 1 }).candy, 79)
  assert.equal(calculateRefill({ candy: 79, refillAnchor: full.refillAnchor, now: start + interval * 11 }).candy, 80)
})

test('every reward embed has balances, no embed timestamp, and zero candy gets shared refill countdown', () => {
  const event = { ...config, enabled: true }, now = Date.parse(config.startsAt) + 60000
  assert.match(balanceFooter({ candy: 0, eyes: 2 }, now, event).text, /Candy refill in: 17 minutes/)
  assert.doesNotMatch(balanceFooter({ candy: 1, eyes: 2 }, now, event).text, /refill/)
  const payload = withBalances({ embeds: [{ timestamp: '2026-10-01T07:00:00Z' }, {}] }, { candy: 0, eyes: 3 }, now, event)
  assert.ok(payload.embeds.every(embed => !embed.timestamp && embed.footer.text.includes('🧿 3')))
})

test('private nudge eligibility excludes unregistered/inactive/recent callers, but full buckets need no recent play', () => {
  const event = { ...config, enabled: true }, now = new Date(Date.parse(config.startsAt) + 10 * 3600000)
  const player = { registeredAt: config.startsAt, candy: 50, refillAnchor: now, lastActive: new Date(now - 2 * 3600000) }
  assert.equal(eligible(player, now, event), 'stash')
  assert.equal(eligible({ ...player, registeredAt: null }, now, event), false)
  assert.equal(eligible({ ...player, lastActive: now }, now, event), false)
  assert.equal(eligible({ ...player, lastActive: new Date(now - 25 * 3600000) }, now, event), false)
  assert.equal(eligible({ ...player, candy: 80, lastActive: null }, now, event), 'bucket')
})

test('private stash reminder cooldown persists for 48 hours and concurrent claims cannot nag twice', async t => {
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => sequelize.close())
  await require('../migrations/20261001000000-create-spooky-core').up(sequelize.getQueryInterface())
  const models = require('../services/spooky/models').defineSpookyModels(sequelize)
  const event = { ...config, enabled: true }; let now = new Date(Date.parse(config.startsAt) + 2 * 3600000)
  const economy = require('../services/spooky/economy').createEconomy({ sequelize, models, clock: () => now, configVersion: event.version })
  const input = { eventId: event.eventId, guildId: 'guild', actorId: 'alice' }
  const player = await models.Participant.create({ eventId: event.eventId, guildId: 'guild', userId: 'alice',
    registeredAt: config.startsAt, lastActive: config.startsAt, refillAnchor: now, candy: 50 })
  const claim = () => claimNudge({ economy, models, input, event, now })
  assert.equal((await Promise.all([claim(), claim()])).filter(Boolean).length, 1)
  now = new Date(now.getTime() + 47 * 3600000)
  await player.update({ refillAnchor: now, lastActive: new Date(now - 2 * 3600000) })
  assert.equal(await claim(), false)
  now = new Date(now.getTime() + 3600000); await player.update({ refillAnchor: now })
  assert.equal(await claim(), 'stash')
  assert.equal(await models.Ledger.count({ where: { resource: 'private_candy_nudge:stash' } }), 2)
})

test('wording gallery uses real renderer, contains all eight standard gifts and constrains every page', () => {
  const pages = wordingPages()
  assert.equal(pages.filter(page => page.label === 'treat • standard_gift' && !page.payload.embeds[0].title.includes('Sweet Thoughts')).length, 8)
  assert.ok(pages.some(page => page.payload.embeds[0].title.includes('Sticky Fingers')))
  for (let i = 0; i < pages.length; i++) {
    const payload = previewPayload(pages, i)
    assert.equal(payload.embeds.length, 1); assert.ok(payload.embeds[0].description.length <= 4096)
    assert.deepEqual(payload.allowedMentions.users, []); assert.equal(payload.components[0].components.length, 2)
  }
})

test('preview buttons acknowledge before fresh authorization and end cleanly on permission loss', async () => {
  const handlers = new Map(), edits = [], order = []; let stopped = false, options
  const collector = { on: (name, fn) => handlers.set(name, fn), stop: () => { stopped = true; handlers.get('end')() } }
  const interaction = { user: { id: 'admin' }, editReply: async payload => edits.push(payload),
    fetchReply: async () => ({ createMessageComponentCollector: value => { options = value; return collector } }) }
  let permitted = true
  await require('../services/spooky/wording-preview').showPreview(interaction, async () => {
    order.push('authorize'); if (!permitted) throw new Error('permission lost')
  })
  assert.equal(options.filter({ user: { id: 'other' }, customId: 'spooky-wording:next' }), false)
  const button = { customId: 'spooky-wording:next', deferUpdate: async () => order.push('ack') }
  await handlers.get('collect')(button)
  assert.deepEqual(order, ['ack', 'authorize']); assert.match(edits.at(-1).content, /preview 2\//)
  permitted = false; await handlers.get('collect')(button)
  assert.equal(stopped, true); assert.deepEqual(edits.at(-1).components, [])
})
