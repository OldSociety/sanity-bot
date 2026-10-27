const test = require('node:test')
const assert = require('node:assert/strict')
const { productionFixture } = require('./checkins/production-fixture')
const { fixture } = require('./checkins/fixture')
const calendar = require('../services/checkins/scheduling/calendar')
const { roster, createScheduler } = require('../services/checkins/scheduling/scheduler')
const config = require('../config/checkins/checkins.json')

test('confirmed opening anchors, last-day slots and DST use Pacific calendar dates', () => {
  const wed = calendar.occurrence(config, 'wednesday', Date.parse('2026-10-28T19:00:00Z'))
  assert.equal(wed.openDate, '2026-10-28'); assert.equal(wed.lastDate, '2026-11-01')
  assert.equal(new Date(wed.reminderAt).toISOString(), '2026-11-01T20:00:00.000Z')
  assert.equal(new Date(wed.closesAt).toISOString(), '2026-11-02T08:00:00.000Z')
  const monday = calendar.occurrence(config, 'monday', Date.parse('2026-11-02T20:00:00Z'))
  assert.equal(monday.openDate, '2026-11-02'); assert.equal(monday.lastDate, '2026-11-06')
  assert.equal(new Date(monday.reminderAt).toISOString(), '2026-11-06T20:00:00.000Z')
  assert.equal(calendar.occurrence(config, 'monday', monday.opensAt - 1), null)
  assert.ok(calendar.occurrence(config, 'monday', monday.closesAt - 1))
  assert.equal(calendar.occurrence(config, 'monday', monday.closesAt), null)
})

test('fortnightly cadence and holiday skip/resume preserve anchors', () => {
  assert.equal(calendar.occurrence(config, 'monday', Date.parse('2026-11-09T20:00:00Z')), null)
  assert.equal(calendar.occurrence(config, 'monday', Date.parse('2026-11-16T20:00:00Z')).openDate, '2026-11-16')
  assert.equal(calendar.occurrence(config, 'monday', Date.parse('2026-12-14T20:00:00Z')), null)
  assert.equal(calendar.occurrence(config, 'wednesday', Date.parse('2026-12-23T20:00:00Z')), null)
  assert.equal(calendar.occurrence(config, 'wednesday', Date.parse('2027-01-06T20:00:00Z')).openDate, '2027-01-06')
  assert.equal(calendar.occurrence(config, 'monday', Date.parse('2027-01-11T20:00:00Z')).openDate, '2027-01-11')
})

test('production command requires exact guild/channel and fresh campaign role for ordinary members', async t => {
  const f = productionFixture(); t.after(() => f.store.close())
  await assert.rejects(f.command({ channelId: 'wrong' }), /Use \/check-in/)
  await assert.rejects(f.command({ guildId: 'wrong' }), /Use \/check-in/)
  f.member.roles.cache.clear()
  await assert.rejects(f.command(), /server owner or MondaysinHell/)
  assert.equal((await f.store.list()).length, 0)
  f.member.roles.cache.set('monday-role', {})
  await f.command()
  const r = await f.record()
  assert.equal(r.isTest, false); assert.equal(r.reviewChannelId, 'review'); assert.equal(r.occurrenceKey, 'monday:2026-11-02')
  assert.equal(f.edits.at(-1).components.length, 0)
})

test('member cannot choose the other campaign and a dual-role member must select one', async t => {
  const f = productionFixture(); t.after(() => f.store.close())
  await assert.rejects(f.command({ options: { getString: () => 'wednesday' } }), /Choose a campaign/)
  f.member.roles.cache.set('wednesday-role', {})
  await assert.rejects(f.command({ options: { getString: () => null } }), /Choose a campaign/)
})

test('development bypass needs the owner, not nonexistent production roles; channel response has no choices', async t => {
  const f = fixture(); t.after(() => f.store.close())
  await f.begin()
  assert.deepEqual(f.edits.at(-1).components, [])
  assert.equal(f.sent.filter(x => x.destination === 'dm')[0].payload.components[0].components.length, 2)
  const r = (await f.store.list())[0]
  await f.click(r, 'begin')
  assert.deepEqual(f.messages.get(f.sent[0].id).payload.components, [])
})

test('every consumed DM prompt loses its controls, including modal answers and final submission', async t => {
  const f = fixture(); t.after(() => f.store.close())
  let r = await f.begin()
  r = await f.click(r, 'begin')
  for (const answer of ['5','5','5','Yes','Yes']) r = await f.click(r, `answer-${answer}`)
  r = await f.click(r, 'text', f.text('Feedback'))
  r = await f.click(r, 'text', f.text('Code'))
  assert.equal(r.status, 'PENDING')
  for (const delivery of await f.store.deliveries(r.id)) {
    if (['invite','prompt'].includes(delivery.kind)) assert.deepEqual(f.messages.get(delivery.message).payload.components, [])
    if (delivery.kind === 'prompt-clear') assert.equal(delivery.status, 'sent')
  }
})

test('scheduler sends one opening DM and one last-day DM only for unfinished eligible recipients', async t => {
  const f = productionFixture(); t.after(() => f.store.close())
  await f.scheduler.tick(f.client); await f.controller.flush(f.client)
  await f.scheduler.tick(f.client); await f.controller.flush(f.client)
  assert.equal(f.sent.length, 1); assert.deepEqual(f.sent[0].payload.components, [])
  assert.match(f.sent[0].payload.content, /Use the \/check-in command in #chat-in-hell/)
  f.setNow(Date.parse('2026-11-06T20:00:00Z'))
  await f.scheduler.tick(f.client); await f.controller.flush(f.client)
  await f.scheduler.tick(f.client); await f.controller.flush(f.client)
  assert.equal(f.sent.length, 2)
})

test('completed absence, pending and denied records all suppress the final-day reminder', async t => {
  for (const decision of [null, 'deny']) {
    const f = productionFixture(); t.after(() => f.store.close())
    await f.scheduler.tick(f.client); await f.controller.flush(f.client)
    await f.command(); let r = await f.record()
    r = await f.click(r, 'absence', f.text('Away'))
    if (decision) r = await f.click(r, decision, { guildId: 'prod', user: { id: 'reviewer', username: 'Reviewer' } })
    assert.equal(r.status, decision ? 'DENIED' : 'PENDING')
    const count = f.sent.length
    f.setNow(Date.parse('2026-11-06T20:00:00Z'))
    await f.scheduler.tick(f.client); await f.controller.flush(f.client)
    assert.equal(f.sent.length, count)
    const review = f.sent.find(x => x.destination === 'review')
    assert.ok(review); assert.match(review.payload.embeds[0].title, /^CHECK-IN/)
  }
})

test('revoked campaign role blocks subsequent answers and queued reminder delivery', async t => {
  const f = productionFixture(); t.after(() => f.store.close())
  await f.scheduler.tick(f.client)
  f.member.roles.cache.clear()
  await f.controller.flush(f.client)
  assert.equal(f.sent.length, 0)
  f.member.roles.cache.set('monday-role', {})
  await f.command(); const r = await f.record()
  f.member.roles.cache.clear()
  await assert.rejects(f.click(r, 'begin'), /server owner or MondaysinHell/)
  assert.equal((await f.store.get(r.id)).status, 'INVITED')
})

test('production review is separate from player roles and cannot be performed by the submitting owner', async t => {
  const f = productionFixture(); t.after(() => f.store.close())
  await f.command(); let r = await f.record()
  r = await f.click(r, 'absence', f.text('Away'))
  await assert.rejects(f.click(r, 'accept', { guildId: 'prod' }), /not authorized to review/)
  await assert.rejects(f.click(r, 'accept', { guildId: 'prod', user: { id: 'stranger' } }), /not authorized to review/)
  f.member.roles.cache.clear()
  r = await f.click(r, 'accept', { guildId: 'prod', user: { id: 'reviewer', username: 'Reviewer' } })
  assert.equal(r.status, 'ACCEPTED')
})

test('deadline expires unfinished forms, removes their controls and never sends historical catch-up', async t => {
  const f = productionFixture(); t.after(() => f.store.close())
  f.config.schedule.backupDelayHours = 0
  await f.command(); let r = await f.record()
  f.setNow(Date.parse('2026-11-07T08:00:00Z'))
  await assert.rejects(f.click(r, 'begin'), /window has closed/)
  await f.scheduler.tick(f.client); await f.controller.flush(f.client)
  r = await f.store.get(r.id); assert.equal(r.status, 'EXPIRED')
  assert.deepEqual(f.messages.get(f.sent[0].id).payload.components, [])
  const count = f.sent.length
  await f.scheduler.tick(f.client); assert.equal(f.sent.length, count)
})

test('final-day startup sends only current reminder and old opening queues cannot send after submission', async t => {
  const f = productionFixture(); t.after(() => f.store.close())
  await f.scheduler.tick(f.client)
  f.setNow(Date.parse('2026-11-06T20:00:00Z'))
  await f.scheduler.tick(f.client); await f.controller.flush(f.client)
  assert.equal(f.sent.length, 1)
  const recipients = await f.store.recipients('monday:2026-11-02')
  const status = await f.store.deliveries(recipients[0].id)
  assert.equal(status.find(x => x.kind === 'opening').status, 'cancelled')
  assert.equal(status.find(x => x.kind === 'last-day').status, 'sent')
})

test('scheduler disabled/development mode creates no roster requests or queued records', async t => {
  const f = productionFixture(); t.after(() => f.store.close())
  f.guild.members.list = async () => assert.fail('disabled scheduler fetched roster')
  f.config.production.scheduledEnabled = false
  await f.scheduler.tick(f.client)
  f.config.production.scheduledEnabled = true
  await createScheduler({ store: f.store, config: () => f.config, environment: () => 'development' }).tick(f.client)
  assert.equal((await f.store.pending()).length, 0)
})

test('roster pagination is complete and rejects repeat pages before enrollment', async () => {
  const page = new Map(Array.from({ length: 1000 }, (_, i) => [String(i), { id: String(i) }]))
  let count = 0
  const guild = { members: { list: async () => ++count === 1 ? page : new Map([['1000', { id: '1000' }]]) } }
  assert.equal((await roster(guild)).length, 1001)
  await assert.rejects(roster({ members: { list: async () => page } }), /Repeated/)
})

test('production command cannot start outside its campaign window; duplicate invocation preserves submission', async t => {
  const f = productionFixture(); t.after(() => f.store.close())
  f.setNow(Date.parse('2026-11-09T20:00:00Z'))
  await assert.rejects(f.command(), /no open check-in/)
  f.setNow(Date.parse('2026-11-02T20:00:00Z'))
  await f.command(); let r = await f.record()
  r = await f.click(r, 'absence', f.text('Away'))
  const count = f.sent.length
  await f.command()
  assert.equal((await f.store.list()).length, 1); assert.equal(f.sent.length, count)
  assert.match(f.edits.at(-1).content, /already submitted/)
})

test('startup reconciliation removes controls left by the earlier implementation without duplicating prompts', async t => {
  const f = fixture(); t.after(() => f.store.close())
  const r = await f.begin()
  await f.store.change(r.id, 0, 'legacy-answer', next => { next.status = 'PENDING'; next.submittedAt = 1800000000000 })
  await f.store.cleanupPrompts(); await f.controller.flush(f.client)
  assert.deepEqual(f.messages.get(f.sent[0].id).payload.components, [])
  await f.store.cleanupPrompts(); await f.controller.flush(f.client)
  assert.equal(f.sent.length, 1)
  assert.equal((await f.store.deliveries(r.id)).filter(d => d.kind === 'prompt-clear').length, 1)
})

test('legacy duplicate channel controls are removed without advancing the DM form', async t => {
  const f = fixture(); t.after(() => f.store.close())
  const r = await f.begin()
  const updates = []
  await f.controller.handle(f.interaction({ customId: `ci:${r.id}:0:begin`, guildId: 'dev', channelId: 'review',
    message: { interaction: { user: { id: 'owner' }, commandName: 'checkin-test' } },
    update: async payload => updates.push(payload), followUp: async payload => updates.push(payload) }))
  assert.deepEqual(updates[0].components, [])
  assert.equal((await f.store.get(r.id)).status, 'INVITED')
})

test('a check-in submitted while a reminder awaits REST prevents that reminder from sending', async t => {
  const f = productionFixture(); t.after(() => f.store.close())
  await f.scheduler.tick(f.client)
  let release, signal
  const paused = new Promise(resolve => { release = resolve })
  const reached = new Promise(resolve => { signal = resolve })
  const fetch = f.client.users.fetch
  f.client.users.fetch = async id => { signal(); await paused; return fetch(id) }
  const flushing = f.controller.flush(f.client)
  await reached
  const r = await f.store.create({ owner: 'owner', campaign: 'monday', occurrenceKey: 'monday:2026-11-02', isTest: false }, 'direct-submission', () => ({}))
  await f.store.change(r.id, 0, 'completed-before-send', next => { next.status = 'PENDING'; next.submittedAt = f.now })
  release(); await flushing
  assert.equal(f.sent.length, 0)
})

test('production review copy still delivers after a submitted player leaves the guild', async t => {
  const f = productionFixture(); t.after(() => f.store.close())
  await f.command(); const r = await f.record()
  const change = f.store.change
  f.store.change = async (...args) => {
    const result = await change(...args)
    f.guild.members.fetch = async () => { throw Error('Unknown Member') }
    return result
  }
  const completed = await f.click(r, 'absence', f.text('Away'))
  assert.equal(completed.status, 'PENDING')
  assert.ok(f.sent.some(x => x.destination === 'review'))
})
