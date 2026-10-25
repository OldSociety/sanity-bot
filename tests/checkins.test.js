const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createStore } = require('../services/checkins/storage/sqlite-store')
const { fixture } = require('./checkins/fixture')
const presentation = require('../services/checkins/presentation/messages')

test('standard questionnaire, receipt, review and reason decision share immutable answers', async t => {
  const f = fixture(); t.after(() => f.store.close())
  let r = await f.begin()
  r = await f.click(r, 'begin')
  for (const answer of ['5', '4', '3', 'Yes', 'No']) r = await f.click(r, `answer-${answer}`)
  r = await f.click(r, 'text', f.text('I worked on my character.'))
  r = await f.click(r, 'skip')
  r = await f.click(r, 'text', f.text(' Exact CODE '))
  assert.equal(r.status, 'PENDING'); assert.equal(r.answers[8], ' Exact CODE ')
  const receipt = f.sent.find(x => x.destination === 'dm' && x.payload.embeds)
  const review = f.sent.find(x => x.destination === 'review')
  assert.deepEqual(receipt.payload.embeds, review.payload.embeds)
  assert.equal(review.payload.components[0].components.length, 4)
  const snapshot = r.snapshot
  r = await f.click(r, 'accept-reason', f.text('Ready for the game.'))
  assert.equal(r.status, 'ACCEPTED'); assert.deepEqual(r.snapshot, snapshot)
  assert.ok(f.sent.some(x => x.destination === 'dm' && /Accepted/.test(x.payload.content)))
  assert.ok(f.edits.some(x => /Accepted/.test(x.content || '') && x.components.length === 0))
  await assert.rejects(f.click(r, 'deny'), /already been reviewed/)
})

test('absence bypasses questionnaire and code; denied absence remains submitted', async t => {
  const f = fixture(); t.after(() => f.store.close())
  let r = await f.begin('wednesday')
  r = await f.click(r, 'absence', f.text('Out of town'))
  assert.equal(r.status, 'PENDING'); assert.equal(r.type, 'ABSENCE'); assert.deepEqual(r.answers, {})
  assert.equal(r.snapshot.fields.find(x => x.name === 'Absence explanation').value, 'Out of town')
  assert.ok(f.sent.some(x => /Please also notify the other players/.test(x.payload.content || '')))
  r = await f.click(r, 'deny'); assert.equal(r.status, 'DENIED')
})

test('Yes participation skips only conditional activity question', async t => {
  const f = fixture(); t.after(() => f.store.close())
  let r = await f.begin(); r = await f.click(r, 'begin')
  for (const answer of ['1', '2', '5', 'No', 'Yes']) r = await f.click(r, `answer-${answer}`)
  assert.equal(r.question, 7); assert.equal(r.answers[6], '-')
})

test('unauthorized actors, production, wrong guild, disabled feature and changed owner are blocked', async t => {
  const f = fixture(); t.after(() => f.store.close())
  const invoke = extra => f.controller.test(f.interaction({ guildId: 'dev', channelId: 'review', options: { getString: () => 'monday' }, ...extra }))
  await assert.rejects(invoke({ user: { id: 'other' } }), /owner/)
  await assert.rejects(invoke({ guildId: 'prod' }), /development server/)
  f.setEnv('production'); await assert.rejects(invoke(), /disabled/)
  f.setEnv('development'); f.config.development.testCommandEnabled = false; await assert.rejects(invoke(), /disabled/)
  f.config.development.testCommandEnabled = true; f.setOwner('other'); await assert.rejects(invoke(), /owner/)
  assert.equal((await f.store.list()).length, 0); assert.equal(f.sent.length, 0)
})

test('duplicate command resumes one conversation; stale clicks cannot answer or review', async t => {
  const f = fixture(); t.after(() => f.store.close())
  let r = await f.begin(); await f.begin('wednesday')
  assert.equal((await f.store.list()).length, 1)
  assert.equal(f.sent.length, 1)
  const stale = `ci:${r.id}:0:begin`
  r = await f.click(r, 'begin')
  await assert.rejects(f.controller.handle(f.interaction({ customId: stale })), /prompt has changed/)
  await assert.rejects(f.click(r, 'answer-9'), /does not match/)
  assert.equal((await f.store.get(r.id)).question, 1)
  await assert.rejects(f.click(r, 'answer-5', { user: { id: 'other' } }), /not available to you/)
  await assert.rejects(f.click(r, 'answer-5', { message: { id: 'wrong' } }), /current check-in prompt/)
})

test('modal opening saves no answer; review and modal permissions are checked on submission', async t => {
  const f = fixture(); t.after(() => f.store.close())
  let r = await f.begin()
  await f.click(r, 'absence')
  assert.equal((await f.store.get(r.id)).status, 'INVITED')
  f.config.development.testCommandEnabled = false
  await assert.rejects(f.click(r, 'absence', f.text('Away')), /disabled/)
  f.config.development.testCommandEnabled = true
  r = await f.click(r, 'absence', f.text('Away'))
  await assert.rejects(f.click(r, 'accept', { channelId: 'wrong' }), /original test review/)
  await f.click(r, 'accept-reason'); assert.equal((await f.store.get(r.id)).status, 'PENDING')
  await f.click(r, 'deny')
  await assert.rejects(f.click(r, 'accept-reason', f.text('Late')), /already been reviewed/)
})

test('closed DMs fail independently; receipt failure does not prevent staff review', async t => {
  const f = fixture(); t.after(() => f.store.close())
  let r = await f.begin()
  f.setDMError(Object.assign(Error('blocked'), { code: 50007 }))
  r = await f.click(r, 'absence', f.text('Away'))
  assert.equal(r.status, 'PENDING')
  assert.ok((await f.store.deliveries(r.id)).some(x => x.kind === 'receipt' && x.status === 'failed'))
  assert.ok((await f.store.deliveries(r.id)).some(x => x.kind === 'review' && x.status === 'sent'))
})

test('restart preserves answers; interrupted sends become uncertain without duplicate delivery', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'checkins-test-'))
  let reopened
  t.after(async () => { if (reopened) await reopened.close(); fs.rmSync(directory, { recursive: true, force: true }) })
  const file = path.join(directory, 'test.sqlite')
  const f = fixture(createStore(file))
  let r = await f.begin(); r = await f.click(r, 'begin'); r = await f.click(r, 'answer-4')
  await f.store.queue(r, 'synthetic', 'user:owner', {})
  const delivery = (await f.store.pending())[0]; await f.store.claim(delivery.key)
  await f.store.close()
  reopened = createStore(file)
  await reopened.recover()
  assert.equal((await reopened.get(r.id)).answers[1], '4'); assert.equal((await reopened.get(r.id)).question, 2)
  assert.equal((await reopened.deliveries(r.id)).find(x => x.kind === 'synthetic').status, 'uncertain')
  assert.equal((await reopened.pending()).length, 0)
})

test('source replay and stale revision are atomic; failed mutations leave no deliveries', async t => {
  const store = createStore(); t.after(() => store.close())
  const r = await store.create({ owner: 'one', campaign: 'monday' }, 'source', () => ({}))
  await store.change(r.id, 0, 'answer', next => { next.answers[1] = '5' })
  await store.change(r.id, 0, 'answer', () => assert.fail('replay mutated'))
  await assert.rejects(() => store.change(r.id, 0, 'stale', () => {}), /prompt has changed/)
  await assert.rejects(() => store.change(r.id, 1, 'throws', async next => { await store.queue(next, 'bad', 'user:one', {}); throw Error('rollback') }), /rollback/)
  assert.equal((await store.deliveries(r.id)).length, 1); assert.equal((await store.get(r.id)).revision, 1)
})

test('rendering bounds long input, escapes markup, suppresses mentions, keeps raw answers', () => {
  const record = { id: 'test', name: 'Monday', owner: 'one', displayName: '*name*', submittedAt: Date.now(), startedAt: Date.now(), type: 'STANDARD', answers: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i + 1, i >= 5 ? '@everyone *text* '.repeat(40) : '5'])) }
  const embed = presentation.snapshot(record)
  assert.ok(JSON.stringify(embed).length < 6000)
  assert.deepEqual(presentation.review({ ...record, snapshot: embed }).allowedMentions, { parse: [] })
  assert.equal(record.answers[6].startsWith('@everyone'), true)
})

test('owner test command is development-only and the test environment opens no runtime storage', () => {
  const command = require('../commands/CheckIn/CheckInTest')
  assert.deepEqual(command.environments, ['development'])
  assert.equal(require('../services/command-environment').commandEnabled(command, 'production'), false)
  const old = process.env.NODE_ENV
  process.env.NODE_ENV = 'test'
  assert.equal(require('../services/checkins/runtime').enabled(), false)
  assert.throws(() => require('../services/checkins/runtime').selected(), /disabled/)
  process.env.NODE_ENV = old
})

test('check-in commands, buttons and modals bypass the activity-credit dispatcher', async t => {
  const runtime = require('../services/checkins/runtime')
  const originalTest = runtime.test, originalHandle = runtime.handle, originalCheckIn = runtime.checkIn
  t.after(() => { runtime.test = originalTest; runtime.handle = originalHandle; runtime.checkIn = originalCheckIn })
  const calls = []
  runtime.test = async () => calls.push('command')
  runtime.handle = async () => calls.push('component')
  runtime.checkIn = async () => calls.push('player-command')
  const event = require('../Events/InteractionCreate')
  await event.execute({ isChatInputCommand: () => true, commandName: 'checkin-test' })
  await event.execute({ isChatInputCommand: () => true, commandName: 'check-in' })
  await event.execute({ customId: 'ci:test:0:begin' })
  await event.execute({ customId: 'ci:test:0:absence', isModalSubmit: () => true })
  assert.deepEqual(calls, ['command', 'player-command', 'component', 'component'])
})

test('simultaneous answers commit one revision and never queue two next prompts', async t => {
  const f = fixture(); t.after(() => f.store.close())
  let r = await f.begin(); r = await f.click(r, 'begin')
  const results = await Promise.allSettled([f.click(r, 'answer-4'), f.click(r, 'answer-5')])
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1)
  assert.equal((await f.store.get(r.id)).question, 2)
  assert.equal((await f.store.deliveries(r.id)).filter(x => x.key === `${r.id}:prompt:2`).length, 1)
})

test('transport ambiguity is retained without retrying the DM', async t => {
  const f = fixture(); t.after(() => f.store.close())
  f.setDMError(Error('transport interrupted'))
  const r = await f.begin()
  assert.equal((await f.store.deliveries(r.id))[0].status, 'uncertain')
  f.setDMError(null)
  await f.controller.flush(f.interaction().client)
  assert.equal(f.sent.length, 0)
})

test('review destination cannot fall back after configuration drift or permission loss', async t => {
  const f = fixture(); t.after(() => f.store.close())
  const r = await f.begin()
  f.config.development.reviewChannelId = 'different'
  await assert.rejects(f.click(r, 'begin'), /older configuration/)
  assert.equal((await f.store.get(r.id)).status, 'INVITED')
  f.config.development.reviewChannelId = 'review'
  f.channel.permissionsFor = () => ({ has: () => false })
  await assert.rejects(f.begin(), /bot needs/)
  assert.equal((await f.store.list()).length, 1)
})
