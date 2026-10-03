const test = require('node:test'), assert = require('node:assert/strict'), Sequelize = require('sequelize')
const { config } = require('../services/spooky/config')
const { reserveRecipientMentions, selectionRoll } = require('../services/spooky/mentions')
const { actionMessages } = require('../services/spooky/presentation')
const recipient = '200000000000000002', hour = 3600000
async function fixture(t) {
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => sequelize.close())
  await require('../migrations/20261001000000-create-spooky-core').up(sequelize.getQueryInterface())
  await require('../migrations/20261001000002-create-spooky-notifications').up(sequelize.getQueryInterface())
  const models = require('../services/spooky/models').defineSpookyModels(sequelize)
  let now = new Date(config.startsAt)
  const economy = require('../services/spooky/economy').createEconomy({ sequelize, models, configVersion: config.version, clock: () => now })
  const notifications = require('../services/spooky/notifications').createNotifications({ models, clock: () => now }), sent = []
  const scope = { eventId: config.eventId, guildId: 'guild' }
  const run = (id, { registered = false, guildId = 'guild', actorId = 'alice', fail = false, sample = 0 } = {}) => economy.execute({ ...scope, guildId, actorId, interactionId: id,
    operationType: id.includes('trick') ? 'spooky_trick' : 'spooky_treat' }, async ctx => {
    const registeredIds = new Set(registered ? [recipient] : [])
    const mentions = await reserveRecipientMentions({ models, ctx, actorId, userIds: [recipient,recipient,actorId], registeredIds, settings: config.recipientMentions,
      random: () => sample, names: { [recipient]: 'Bob' } })
    const messages = actionMessages({ action: 'treat', outcome: 'standard_gift', result: { gifts: [{ userId: recipient, candy: 1 }] } },
      { actorId, members: [{ userId: actorId, displayName: actorId }, { userId: recipient, displayName: 'Bob' }], registeredIds, mentionIds: new Set(mentions.allowed) })
    if (mentions.allowed.length) messages[0].payload._spookyMentions = mentions.reservation
    await notifications.enqueue(ctx, 'channel', messages)
    if (fail) throw Error('finalization failed')
    return { mentions: mentions.allowed, payload: messages[0].payload }
  })
  const channel = { id: 'channel', send: async payload => { sent.push(payload); return { id: 'message-'+sent.length } } }
  return { models, economy, notifications, run, channel, sent, scope, hours: value => { now = new Date(Date.parse(config.startsAt)+value*hour) } }
}
test('unregistered recipient gets one embed reference per rolling 72h across simultaneous actors, never self-pings', async t => {
  const f = await fixture(t)
  const results = await Promise.all(['alice','carol','dave'].map(actorId => f.run('action-'+actorId, { actorId })))
  assert.equal(results.filter(result => result.receipt.mentions.includes(recipient)).length, 1)
  assert.equal(await f.models.Ledger.count({ where: { resource: 'recipient_mention' } }), 1)
  assert.equal(await f.models.Participant.count(), 0)
  for (const result of results) await f.notifications.deliver(result.operationId, f.channel)
  assert.ok(f.sent.every(payload => payload.content === undefined && payload.allowedMentions.users.length === 0 && !('_spookyMentions' in payload)))
  assert.ok(f.sent[0].embeds[0].description.includes(`<@${recipient}>`))
  assert.ok(!f.sent[1].embeds[0].description.includes(`<@${recipient}>`))
  f.hours(71.99); assert.deepEqual((await f.run('still-capped')).receipt.mentions, [])
  f.hours(72); assert.deepEqual((await f.run('window-expired')).receipt.mentions, [recipient])
})
test('registered mentions are spaced 18h with four combined slots per 72h; guilds are separate', async t => {
  const f = await fixture(t)
  for (let i=0;i<4;i++) {
    f.hours(i*18)
    assert.deepEqual((await f.run(`${i%2 ? 'trick' : 'treat'}-${i}`, { registered: true })).receipt.mentions, [recipient])
    f.hours(i*18+1)
    assert.deepEqual((await f.run('too-soon-'+i, { registered: true })).receipt.mentions, [])
  }
  f.hours(71.99); assert.deepEqual((await f.run('cap', { registered: true })).receipt.mentions, [])
  assert.deepEqual((await f.run('foreign', { guildId: 'other' })).receipt.mentions, [recipient])
  f.hours(72); assert.deepEqual((await f.run('rolling-reset', { registered: true })).receipt.mentions, [recipient])
})
test('cosmetic chance may skip eligible actions without spending allowance; replay cannot reroll', async t => {
  const f = await fixture(t)
  assert.deepEqual((await f.run('miss', { sample: 0.2 })).receipt.mentions, [])
  assert.equal(await f.models.Ledger.count(), 0)
  const hit = await f.run('hit', { sample: 0.199 }), replay = await f.run('hit', { sample: 0.9 })
  assert.equal(replay.replayed, true); assert.deepEqual(replay.receipt, hit.receipt)
  assert.equal(await f.models.Ledger.count(), 1)
  assert.equal(selectionRoll({ operationId: 'discord:one', userId: recipient }), selectionRoll({ operationId: 'discord:one', userId: recipient }))
  const rolls = Array.from({ length: 100 }, (_,i) => selectionRoll({ operationId: 'discord:'+i, userId: recipient }))
  assert.ok(rolls.some(value => value<0.2) && rolls.some(value => value>=0.2))
})
test('reservation rolls back with failed action; replay delivers once without adding a slot', async t => {
  const f = await fixture(t)
  await assert.rejects(() => f.run('retry', { fail: true }), /finalization failed/)
  assert.equal(await f.models.Ledger.count(), 0); assert.equal(await f.models.Notification.count(), 0)
  const first = await f.run('retry'), replay = await f.run('retry', { registered: true })
  await f.notifications.deliver(first.operationId, f.channel); await f.notifications.deliver(replay.operationId, f.channel)
  assert.equal(f.sent.length, 1); assert.equal(await f.models.Ledger.count(), 1)
})
test('registration and midnight never reset earlier reservations, including the previous daily policy', async t => {
  const f = await fixture(t)
  await f.economy.execute({ ...f.scope, actorId: 'alice', interactionId: 'legacy', operationType: 'spooky_treat' }, async ctx => {
    await ctx.record({ userId: recipient, resource: 'recipient_mention', delta: 0, metadata: { pacificDate: '2026-10-01' } }); return {}
  })
  f.hours(1); assert.deepEqual((await f.run('registered-too-soon', { registered: true })).receipt.mentions, [])
  f.hours(18); assert.deepEqual((await f.run('registered-later', { registered: true })).receipt.mentions, [recipient])
  f.hours(24); assert.deepEqual((await f.run('midnight', { registered: true })).receipt.mentions, [])
  assert.deepEqual((await f.run('unregistered')).receipt.mentions, [])
})
test('expired messages and admin resend copies use names; old top-level tag lines are stripped', async t => {
  const f = await fixture(t), first = await f.run('original')
  const copy = await f.economy.execute({ ...f.scope, actorId: 'admin', interactionId: 'copy', operationType: 'admin_queue_resolution' }, async ctx => {
    await f.notifications.enqueue(ctx, 'channel', [{ public: true, payload: first.receipt.payload }]); return {}
  })
  await f.notifications.deliver(copy.operationId, f.channel)
  assert.ok(!f.sent[0].embeds[0].description.includes(`<@${recipient}>`))
  f.hours(72); await f.notifications.deliver(first.operationId, f.channel)
  assert.ok(!f.sent[1].embeds[0].description.includes(`<@${recipient}>`))
  const prepared = require('../services/spooky/token-art').preparePayload({ ...first.receipt.payload, content: `<@${recipient}>` }, { operationId: first.operationId, ordinal: 0 })
  assert.equal(prepared.content, undefined); assert.deepEqual(prepared.allowedMentions.users, [])
})
test('uncertain delivery cannot release its reserved reference or automatically repeat it', async t => {
  const f = await fixture(t), first = await f.run('uncertain'); let sends = 0
  const failing = { id: 'channel', send: async () => { sends++; throw Error('network ambiguous') } }
  await assert.rejects(() => f.notifications.deliver(first.operationId, failing), /network ambiguous/)
  await assert.rejects(() => f.notifications.deliver(first.operationId, failing), /inspection/)
  assert.equal(sends, 1); assert.deepEqual((await f.run('next')).receipt.mentions, [])
})
