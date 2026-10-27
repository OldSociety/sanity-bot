const test = require('node:test')
const assert = require('node:assert/strict')
const { withBotTests } = require('../services/command-channels')
const { productionFixture } = require('./checkins/production-fixture')
const guildId = '1259991510410334219', botTests = '1262485722275905596'

test('shared command policy always adds the correct environment bot-tests channel', () => {
  assert.deepEqual(withBotTests(['chat'], { environment:'production',guildId }),['chat',botTests])
  assert.deepEqual(withBotTests(['chat'], { environment:'development',guildId:'684459745167671453' }),['chat','1076618367294771200'])
  assert.deepEqual(withBotTests([botTests,botTests], { environment:'production',guildId }),[botTests])
})

test('bot-tests default cannot grant a channel in another guild or environment', () => {
  assert.deepEqual(withBotTests(['chat'], { environment:'production',guildId:'684459745167671453' }),['chat'])
  assert.deepEqual(withBotTests(['chat'], { environment:'development',guildId }),['chat'])
  assert.deepEqual(withBotTests(['chat'], { environment:'test',guildId }),['chat'])
})

function fixture(t, owner = false) {
  const f=productionFixture();t.after(()=>f.store.close())
  f.config.production.guildId=guildId
  if(owner){f.setOwner('owner');f.member.roles.cache.clear()}
  return f
}

test('eligible production player can invoke /check-in in bot-tests', async t => {
  const f=fixture(t)
  await f.command({guildId,channelId:botTests})
  const record=await f.record()
  assert.equal(record.guildId,guildId);assert.equal(record.campaign,'monday')
  assert.equal(f.sent[0].destination,'dm')
  assert.deepEqual(f.edits.at(-1).components,[])
})

test('actual server owner without campaign roles can invoke and answer in production bot-tests', async t => {
  const f=fixture(t,true)
  await f.command({guildId,channelId:botTests})
  let record=await f.record();record=await f.click(record,'begin')
  record=await f.click(record,'answer-5')
  assert.equal(record.answers[1],'5')
})

test('normal command channel remains allowed and unrelated channels remain blocked', async t => {
  const f=fixture(t)
  await assert.rejects(f.command({guildId,channelId:'elsewhere'}),/1262485722275905596/)
  await f.command({guildId,channelId:'chat'})
  assert.equal((await f.store.list()).length,1)
})

test('testing channel does not bypass player roles, configured guild or normal opening windows', async t => {
  const f=fixture(t)
  f.member.roles.cache.clear()
  await assert.rejects(f.command({guildId,channelId:botTests}),/server owner or MondaysinHell/)
  f.member.roles.cache.set('monday-role',{})
  await assert.rejects(f.command({guildId:'wrong',channelId:botTests}),/Use \/check-in/)
  f.setNow(Date.parse('2026-11-09T20:00:00Z'))
  await assert.rejects(f.command({guildId,channelId:botTests}),/no open check-in/)
  assert.equal((await f.store.list()).length,0)
})
