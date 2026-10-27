const test = require('node:test')
const assert = require('node:assert/strict')
const { productionFixture } = require('./checkins/production-fixture')

function ownerFixture(t) {
  const f = productionFixture()
  t.after(() => f.store.close())
  f.setOwner('owner')
  f.member.roles.cache.clear()
  return f
}

test('actual production server owner can start and complete a standard check-in without either campaign role', async t => {
  const f = ownerFixture(t)
  await f.command(); let r = await f.record()
  assert.equal(r.isTest,false);assert.equal(r.campaign,'monday')
  r = await f.click(r,'begin')
  for (const answer of ['5','4','3','Yes','Yes']) r = await f.click(r,`answer-${answer}`)
  r = await f.click(r,'skip')
  r = await f.click(r,'text',f.text('owner-code'))
  assert.equal(r.status,'PENDING')
  assert.equal(r.answers[8],'owner-code')
  assert.ok(f.sent.some(x=>x.destination==='review'))
})

test('roleless owner can select Wednesday and submit Absence in its open window', async t => {
  const f=ownerFixture(t)
  f.setNow(Date.parse('2026-10-28T19:00:00Z'))
  await f.command({options:{getString:()=> 'wednesday'}})
  let r=await f.record();r=await f.click(r,'absence',f.text('Away'))
  assert.equal(r.campaign,'wednesday');assert.equal(r.status,'PENDING');assert.equal(r.type,'ABSENCE')
})

test('owner exception preserves required channel, guild, campaign choice and scheduled window', async t => {
  const f=ownerFixture(t)
  await assert.rejects(f.command({channelId:'wrong'}),/Use \/check-in/)
  await assert.rejects(f.command({guildId:'wrong'}),/Use \/check-in/)
  await assert.rejects(f.command({options:{getString:()=>null}}),/Choose the campaign/)
  await assert.rejects(f.command({options:{getString:()=> 'unknown'}}),/Choose the campaign/)
  f.setNow(Date.parse('2026-11-09T20:00:00Z'))
  await assert.rejects(f.command(),/no open check-in/)
  assert.equal((await f.store.list()).length,0)
})

test('configured bot admin and ordinary administrators gain no owner exception without current ownership or a player role', async t => {
  const f=productionFixture();t.after(()=>f.store.close())
  f.member.roles.cache.clear()
  f.member.permissions={has:()=>true}
  await assert.rejects(f.command(),/server owner or MondaysinHell/)
  assert.equal((await f.store.list()).length,0)
})

test('ownership is fetched fresh and a former roleless owner cannot continue a saved form', async t => {
  const f=ownerFixture(t),requests=[]
  f.client.guilds.fetch=async options=>{requests.push(options);return f.guild}
  await f.command();const r=await f.record()
  f.setOwner('new-owner')
  await assert.rejects(f.click(r,'begin'),/server owner or MondaysinHell/)
  assert.ok(requests.length>=2)
  assert.ok(requests.every(options=>options.guild==='prod'&&options.force===true))
})

test('server ownership alone does not enroll the owner for campaign reminder DMs', async t => {
  const f=ownerFixture(t)
  await f.scheduler.tick(f.client);await f.controller.flush(f.client)
  assert.equal((await f.store.recipients('monday:2026-11-02')).length,0)
  assert.equal(f.sent.length,0)
})

test('owner losing a campaign role is still excluded from a previously queued role-targeted reminder', async t => {
  const f=ownerFixture(t)
  f.member.roles.cache.set('monday-role',{})
  await f.scheduler.tick(f.client)
  f.member.roles.cache.clear()
  await f.controller.flush(f.client)
  assert.equal(f.sent.length,0)
})

test('owner command exception does not change the production self-review policy', async t => {
  const f=ownerFixture(t)
  f.config.production.reviewerUserIds.push('owner')
  await f.command();let r=await f.record();r=await f.click(r,'absence',f.text('Away'))
  await assert.rejects(f.click(r,'accept',{guildId:'prod'}),/not authorized to review/)
})
