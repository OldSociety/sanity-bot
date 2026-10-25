const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { productionFixture } = require('./checkins/production-fixture')
const { createStore } = require('../services/checkins/storage/sqlite-store')
const calendar = require('../services/checkins/scheduling/calendar')
const config = require('../config/checkins/checkins.json')
const time = value => Date.parse(value)
async function run(f, at) { f.setNow(time(at)); await f.scheduler.tick(f.client); await f.controller.flush(f.client) }

test('backup slots are exactly 24 hours after both original slots, including the Wednesday DST occurrence', () => {
  for (const [campaign, date] of [['monday','2026-11-02T20:00:00Z'],['wednesday','2026-10-28T19:00:00Z']]) {
    const value = calendar.reminderOccurrence(config, campaign, time(date))
    assert.equal(value.openingBackupAt - value.opensAt, 86400000)
    assert.equal(value.lastDayBackupAt - value.reminderAt, 86400000)
    assert.equal(calendar.reminderSlot(value, value.openingBackupAt - 1), null)
    assert.deepEqual(calendar.reminderSlot(value, value.openingBackupAt), { kind: 'opening', backup: true })
    assert.equal(calendar.reminderSlot(value, value.lastDayBackupAt - 1), null)
    assert.deepEqual(calendar.reminderSlot(value, value.lastDayBackupAt), { kind: 'last-day', backup: true })
    assert.equal(calendar.reminderOccurrence(config, campaign, value.lastDayBackupEndsAt), null)
  }
})

test('Monday outage is caught on Tuesday at noon, not before 24 hours, and only once', async t => {
  const f = productionFixture(); t.after(() => f.store.close())
  await run(f, '2026-11-03T19:59:59Z'); assert.equal(f.sent.length, 0)
  await run(f, '2026-11-03T20:00:00Z'); assert.equal(f.sent.length, 1)
  await run(f, '2026-11-03T23:00:00Z'); assert.equal(f.sent.length, 1)
  assert.equal((await f.store.deliveries('notice:monday:2026-11-02:owner'))[0].key, 'notice:monday:2026-11-02:owner:opening:backup')
})

test('a successful Monday opening suppresses its Tuesday backup', async t => {
  const f = productionFixture(); t.after(() => f.store.close())
  await run(f, '2026-11-02T20:00:00Z'); assert.equal(f.sent.length, 1)
  await run(f, '2026-11-03T20:00:00Z'); assert.equal(f.sent.length, 1)
  assert.equal((await f.store.deliveries('notice:monday:2026-11-02:owner')).some(d => d.key.endsWith(':backup')), false)
})

test('Friday outage sends Saturday backup and extends only that recipient through Saturday night', async t => {
  const f = productionFixture(); t.after(() => f.store.close())
  await run(f, '2026-11-07T20:00:00Z')
  assert.equal(f.sent.length, 1); assert.match(f.sent[0].payload.content, /extended through tonight/)
  const recipient = await f.store.recipient('owner','monday:2026-11-02')
  assert.equal(recipient.extendedClosesAt, time('2026-11-08T08:00:00Z'))
  await f.command(); let r = await f.record()
  assert.equal(r.closesAt, recipient.extendedClosesAt); assert.equal(r.lateReminderExtension, true)
  r = await f.click(r, 'absence', f.text('Away'))
  assert.equal(r.status, 'PENDING'); assert.ok(r.snapshot.fields.some(x => x.name === 'Extended check-in deadline'))
})

test('a delivered Friday reminder neither repeats Saturday nor extends its original deadline', async t => {
  const f = productionFixture(); t.after(() => f.store.close())
  await run(f, '2026-11-06T20:00:00Z')
  await f.command(); const r = await f.record(), count = f.sent.length
  await run(f, '2026-11-07T20:00:00Z')
  assert.equal(f.sent.length, count)
  assert.equal((await f.store.recipient('owner','monday:2026-11-02')).extendedClosesAt, undefined)
  assert.equal((await f.store.get(r.id)).status, 'EXPIRED')
  await assert.rejects(f.command(), /no open check-in/)
})

test('an unfinished draft is held during Saturday morning and resumes with its saved answers at backup time', async t => {
  const f = productionFixture(); t.after(() => f.store.close())
  await f.command(); let r = await f.record(); r = await f.click(r,'begin'); r = await f.click(r,'answer-4')
  await run(f, '2026-11-07T16:00:00Z')
  assert.equal((await f.store.get(r.id)).status, 'IN_PROGRESS')
  await assert.rejects(f.click(r,'answer-5'), /window has closed/)
  await run(f, '2026-11-07T20:00:00Z')
  r = await f.click(r,'answer-5')
  assert.equal(r.answers[1], '4'); assert.equal(r.answers[2], '5')
  assert.equal(r.closesAt, time('2026-11-08T08:00:00Z'))
})

test('an already expired draft can be restored without losing answers; /check-in reissues one current prompt', async t => {
  const f = productionFixture(); t.after(() => f.store.close())
  await f.command(); let r = await f.record(); r = await f.click(r,'begin'); r = await f.click(r,'answer-4')
  await f.store.expire(time('2026-11-07T08:00:00Z'))
  assert.equal((await f.store.get(r.id)).status, 'EXPIRED')
  await run(f, '2026-11-07T20:00:00Z')
  await f.command(); r = await f.record()
  assert.equal(r.status,'IN_PROGRESS'); assert.equal(r.question,2); assert.equal(r.answers[1],'4')
  assert.equal(r.needsResumePrompt, undefined)
  r = await f.click(r,'answer-5'); assert.equal(r.answers[2],'5')
})

test('an expired invitation is restored with new revision-bound DM choices', async t => {
  const f = productionFixture(); t.after(() => f.store.close())
  await f.command(); let r = await f.record()
  await f.store.expire(time('2026-11-07T08:00:00Z'))
  await run(f,'2026-11-07T20:00:00Z'); await f.command(); r = await f.record()
  assert.equal(r.status,'INVITED'); assert.equal(r.revision,1)
  r = await f.click(r,'begin'); assert.equal(r.status,'IN_PROGRESS')
})

test('backup extension closes exactly after Saturday 11:59 p.m. and does not replay Sunday', async t => {
  const f = productionFixture(); t.after(() => f.store.close())
  await run(f,'2026-11-07T20:00:00Z'); await f.command(); const r = await f.record()
  f.setNow(time('2026-11-08T07:59:59Z')); await f.command()
  await run(f,'2026-11-08T08:00:00Z')
  assert.equal((await f.store.get(r.id)).status,'EXPIRED')
  await assert.rejects(f.command(), /no open check-in/)
  assert.equal(f.sent.filter(x=>/original reminder was missed/.test(x.payload.content||'')).length,1)
})

test('Wednesday opening falls back Thursday and Sunday reminder falls back Monday', async t => {
  const f = productionFixture(); t.after(() => f.store.close())
  f.member.roles.cache.clear(); f.member.roles.cache.set('wednesday-role',{})
  await run(f,'2026-10-29T19:00:00Z'); assert.equal(f.sent.length,1)
  await run(f,'2026-11-02T20:00:00Z'); assert.equal(f.sent.length,2)
  assert.equal((await f.store.recipient('owner','wednesday:2026-10-28')).extendedClosesAt,time('2026-11-03T08:00:00Z'))
  await f.command({ options:{getString:()=> 'wednesday'} }); assert.equal((await f.record()).lateReminderExtension,true)
})

test('completed standard/absence submissions suppress backups and receive no extension', async t => {
  const f = productionFixture(); t.after(() => f.store.close())
  await f.command(); let r = await f.record(); r = await f.click(r,'absence',f.text('Away'))
  const count = f.sent.length
  await run(f,'2026-11-07T20:00:00Z')
  assert.equal(f.sent.length,count); assert.equal((await f.store.get(r.id)).lateReminderExtension,undefined)
})

test('only definitely unsent originals can retry: uncertain/sending/sent outcomes suppress backup', async t => {
  for (const status of ['sent','sending','uncertain','failed']) {
    const f = productionFixture(); t.after(()=>f.store.close())
    f.setNow(time('2026-11-06T20:00:00Z')); await f.scheduler.tick(f.client)
    const d = (await f.store.pending())[0]; await f.store.claim(d.key)
    if (status !== 'sending') await f.store.finish(d.key,status,status==='sent'?'original':null,'synthetic')
    await run(f,'2026-11-07T20:00:00Z')
    assert.equal(f.sent.length,status==='failed'?1:0,status)
    assert.equal(Boolean((await f.store.recipient('owner','monday:2026-11-02')).extendedClosesAt),status==='failed',status)
  }
})

test('a queued unsent Friday original is cancelled and replaced by one Saturday backup', async t => {
  const f = productionFixture(); t.after(()=>f.store.close())
  f.setNow(time('2026-11-06T20:00:00Z')); await f.scheduler.tick(f.client)
  await run(f,'2026-11-07T20:00:00Z')
  const deliveries = await f.store.deliveries('notice:monday:2026-11-02:owner')
  assert.equal(deliveries.find(d=>d.key.endsWith(':last-day:')).status,'cancelled')
  assert.equal(deliveries.find(d=>d.key.endsWith(':last-day:backup')).status,'sent')
  assert.equal(f.sent.length,1)
})

test('backup requires current role eligibility and does not extend a departed player', async t => {
  const f = productionFixture(); t.after(()=>f.store.close())
  f.setNow(time('2026-11-06T20:00:00Z')); await f.scheduler.tick(f.client)
  f.member.roles.cache.clear()
  await run(f,'2026-11-07T20:00:00Z')
  assert.equal(f.sent.length,0)
  assert.equal((await f.store.recipient('owner','monday:2026-11-02')).extendedClosesAt,undefined)
})

test('delivery success and deadline extensions are tracked separately for each player in the same occurrence', async t => {
  const f=productionFixture();t.after(()=>f.store.close())
  let failing=true
  const otherUser={ id:'other',bot:false,send:async payload=>{
    if(failing)throw Object.assign(Error('closed DM'),{code:50007})
    const message={id:'other-backup',payload,destination:'other-dm'};f.sent.push(message);return message
  }}
  const otherMember={id:'other',user:otherUser,roles:{cache:new Map([['monday-role',{}]])}}
  f.guild.members.list=async()=>new Map([['owner',f.member],['other',otherMember]])
  const fetchMember=f.guild.members.fetch,fetchUser=f.client.users.fetch
  f.guild.members.fetch=async options=>options.user==='other'?otherMember:fetchMember(options)
  f.client.users.fetch=async id=>id==='other'?otherUser:fetchUser(id)
  await run(f,'2026-11-06T20:00:00Z');assert.equal(f.sent.length,1)
  failing=false;await run(f,'2026-11-07T20:00:00Z')
  assert.equal(f.sent.length,2);assert.equal(f.sent[1].destination,'other-dm')
  assert.equal((await f.store.recipient('owner','monday:2026-11-02')).extendedClosesAt,undefined)
  assert.equal((await f.store.recipient('other','monday:2026-11-02')).extendedClosesAt,time('2026-11-08T08:00:00Z'))
})

test('sent-backup receipts survive process restart and prevent a second backup', async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'checkin-backup-'))
  let current=createStore(path.join(dir,'test.sqlite'))
  t.after(async()=>{await current.close();fs.rmSync(dir,{recursive:true,force:true})})
  let f=productionFixture(current)
  await run(f,'2026-11-07T20:00:00Z'); assert.equal(f.sent.length,1)
  await current.close(); current=createStore(path.join(dir,'test.sqlite'));await current.recover()
  f=productionFixture(current);await run(f,'2026-11-07T21:00:00Z')
  assert.equal(f.sent.length,0)
  assert.equal((await current.recipient('owner','monday:2026-11-02')).extendedClosesAt,time('2026-11-08T08:00:00Z'))
})

test('fallback does not resurrect skipped holiday occurrences or stale weeks', async t => {
  const f=productionFixture();t.after(()=>f.store.close())
  await run(f,'2026-12-19T20:00:00Z');assert.equal(f.sent.length,0)
  await run(f,'2026-11-09T20:00:00Z');assert.equal(f.sent.length,0)
})
