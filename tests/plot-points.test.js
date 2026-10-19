const test = require('node:test'), assert = require('node:assert/strict')
const { Sequelize } = require('sequelize')
const plots = require('../services/plot-points')
const { config } = require('../services/spooky/config')
const { selectAction, createActions } = require('../services/spooky/actions')
const { createEconomy } = require('../services/spooky/economy')
async function fixture(t) {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  t.after(() => db.close())
  await require('../migrations/20261001000000-create-spooky-core').up(db.getQueryInterface())
  await require('../migrations/plot-points').up(db.getQueryInterface())
  const models = require('../services/spooky/models').defineSpookyModels(db)
  const service = plots.createPlotPoints({ sequelize: db })
  const event = { ...config, enabled: true, plotPointsEnabled: true }
  const economy = createEconomy({ sequelize: db, models, clock: () => new Date('2026-10-06T20:00:00Z') })
  const input = id => ({ eventId: event.eventId, guildId: 'guild', actorId: 'alice', interactionId: id, operationType: 'spooky_treat' })
  return { db, models, service, economy, event, input }
}
test('cumulative story uses successive bars and preserves points after the last known threshold', () => {
  for (const [total, level, xp, required] of [[0,1,0,10000],[9999,1,9999,10000],[10000,2,0,15000],[24999,2,14999,15000],[25000,3,0,25000],[50000,4,0,null],[50001,4,1,null]]) {
    assert.deepEqual(plots.progression(total), { total, level, xp, required, fraction: required ? xp / required : 1 })
  }
  assert.throws(() => plots.progression(-1))
})
test('Plot odds are exactly ten percent for both actions, curses and repeated spells; Eye odds survive', () => {
  for (const action of ['trick','treat']) for (const cursed of [false,true]) for (const previousOutcome of [null,'reverse_nickname','temporary_immunity']) {
    const event = { ...config, plotPointsEnabled: true }, counts = {}
    for (let i=0;i<10000;i++) {
      const result = selectAction({ action, cursed, previousOutcome, crownHolderId: action === 'trick' ? 'bob' : null, actorId: 'alice', event, random: () => (i+.5)/10000 })
      counts[result.outcome] = (counts[result.outcome] || 0) + 1
    }
    assert.equal(counts.plot_point,1000)
    assert.equal(counts[action === 'trick' ? 'steal_or_find_eye' : 'find_eye'], cursed ? 900 : 1000)
    if (cursed) assert.equal(action === 'trick' ? counts.curse_distribute_two : (counts.curse_spread || 0)+(counts.curse_distribute_three || 0),1000)
    if (!cursed && action === 'treat' && !previousOutcome) assert.equal(counts.standard_gift,2000)
  }
})
test('concurrent replay grants one point; level-two entitlement is shared and isolated by guild', async t => {
  const f = await fixture(t)
  await f.service.models.Guild.create({ guildId:'guild', total:9999 })
  const earn = () => f.economy.execute(f.input('win'), ctx => f.service.contribute(ctx,{userId:'alice'}))
  const receipts = await Promise.all([earn(),earn()])
  assert.equal(receipts.filter(row => row.replayed).length,1)
  assert.deepEqual(receipts[0].receipt.unlockedLevels,[2])
  assert.equal((await f.service.view('guild')).total,10000)
  assert.equal(await f.service.models.Contribution.count(),1)
  assert.equal(await f.service.models.Milestone.count(),1)
  assert.equal((await f.service.unlockedBadge('guild')).id,'community:chapter-two')
  assert.equal(await f.service.unlockedBadge('other'),null)
  assert.equal((await f.service.view('other')).total,0)
  assert.equal(await f.service.models.Guild.count(),1)
})
test('a failed reward rolls back the point, milestone and action cost together; retry succeeds once', async t => {
  const f = await fixture(t)
  const participants = require('../services/spooky/participants').createParticipants({ models:f.models,economy:f.economy,event:f.event })
  await participants.register({...f.input('register'),operationType:'registration'})
  await f.service.models.Guild.create({guildId:'guild',total:9999})
  let fail = true
  const actions = createActions({ models:f.models,economy:f.economy,participants,event:f.event,random:()=>0,getCurseState:()=>false,
    handlers:{plot_point:async(ctx,plan)=>{ const result=await f.service.contribute(ctx,{userId:plan.actorId}); if(fail) throw Error('forced');return result }} })
  const input = {...f.input('action'),action:'treat'}
  await assert.rejects(actions.execute(input),/forced/)
  assert.equal((await f.service.view('guild')).total,9999)
  assert.equal(await f.service.models.Milestone.count(),0)
  assert.equal(await f.service.models.Contribution.count(),0)
  assert.equal((await f.models.Participant.findOne()).candy,f.event.candy.starting)
  fail=false
  const win=await actions.execute(input)
  assert.equal(win.receipt.result.plotPoints,1)
  assert.equal(win.receipt.candy,f.event.candy.starting-1)
  assert.equal(win.receipt.eyes,0)
  assert.equal((await actions.execute(input)).replayed,true)
})
test('contribution rejects larger amounts and conflicting duplicate identities', async t => {
  const f=await fixture(t)
  await assert.rejects(f.economy.execute(f.input('bad'),ctx=>f.service.contribute(ctx,{userId:'alice',amount:2})),/Invalid/)
  await f.economy.execute(f.input('one'),ctx=>f.service.contribute(ctx,{userId:'alice',sourceId:'source'}))
  await assert.rejects(f.economy.execute(f.input('two'),ctx=>f.service.contribute(ctx,{userId:'bob',sourceId:'source'})),/identity mismatch/)
  assert.equal((await f.service.view('guild')).total,1)
})
test('spotlight follows frozen Spooky rotation, with year-round Selene and safe emoji fallback', async t => {
  const f=await fixture(t)
  const active=await f.economy.execute(f.input('spotlight'),ctx=>plots.resolveSpotlight({ctx,models:f.models,event:f.event}))
  assert.equal(active.receipt.emojiName,'spooky_hadley_badge')
  const ended=await plots.resolveSpotlight({ctx:{now:new Date('2026-11-03'),scope:{guildId:'guild',eventId:f.event.eventId}},models:f.models,event:f.event})
  assert.equal(ended.emojiName,'selene_badge')
  assert.equal(plots.plotEmoji(active.receipt,[]),'📖')
  assert.equal(plots.plotEmoji(active.receipt,[{name:'spooky_hadley_badge',id:'100000000000000001'}]),'<:spooky_hadley_badge:100000000000000001>')
})
test('popular badges count distinct current human owners, deterministic ties and shared unlocks', () => {
  const {popularBadges}=require('../services/community-profile')
  const humans=new Set(['alice','bob','138131238803210240'])
  const rows=[{userId:'alice',badgeId:'spooky-2026:had'},{userId:'alice',badgeId:'spooky-2026:had'},
    {userId:'138131238803210240',badgeId:'spooky-2026:had'},
    ...['alice','bob','bot'].flatMap(userId=>['sel','mrq'].map(id=>({userId,badgeId:`spooky-2026:${id}`})))]
  const badges=popularBadges(rows,humans,require('../config/leveling/plot-points.json').levelTwoBadge)
  assert.deepEqual(badges.map(b=>[b.id,b.ownerCount]),[['community:chapter-two',2],['spooky-2026:mrq',2],['spooky-2026:sel',2]])
  assert.deepEqual(popularBadges(rows,new Set(['alice','138131238803210240']),require('../config/leveling/plot-points.json').levelTwoBadge),[])
  assert.equal(humans.size,3)
})
test('community profile read has no account creation, no Sanity or personal balances', async t => {
  const f=await fixture(t)
  await require('../services/badges').defineBadgeModel(f.db).sync()
  const calls=[]
  const interaction={guild:{id:'guild',name:'Story',emojis:{fetch:async()=>new Map()}},deferReply:async()=>{},editReply:async data=>calls.push(data)}
  let rendered
  await require('../services/community-profile').showCommunity(interaction,{sequelize:f.db,event:f.event,clock:()=>new Date('2026-10-06T20:00:00Z'),
    directory:async()=>new Map([['alice',{id:'alice',user:{bot:false},roles:{cache:new Map()}}]]),render:async data=>{rendered=data;return Buffer.from('png')}})
  assert.equal(calls[0].files[0].name,'community-profile.png')
  assert.equal(rendered.sanity,null)
  assert.equal(rendered.user,undefined)
  assert.equal(rendered.displayName,'Story')
  assert.equal(rendered.community.currentEvent,'Spooky Season')
  assert.equal(rendered.community.currentEventEmoji,'🎃')
  assert.equal(rendered.community.currencyImage,undefined)
  assert.equal(rendered.community.spotlight.name,'Hadley')
  await require('../services/community-profile').showCommunity(interaction,{sequelize:f.db,event:f.event,clock:()=>new Date('2026-11-03T20:00:00Z'),
    directory:async()=>new Map(),render:async data=>{rendered=data;return Buffer.from('png')}})
  assert.equal(rendered.community.currentEvent,null)
  assert.equal(rendered.community.currentEventEmoji,null)
  assert.equal(rendered.community.spotlight.name,'Selene')
  assert.equal(await f.service.models.Guild.count(),0)
  assert.equal(await f.models.Operation.count(),0)
})

test('level-two community reward is delivered with its spotlight profile banner attachment', async () => {
  const badge = require('../config/badges/badges.json').badges.find(item => item.characterId === 'had')
  const payload = require('../services/spooky/presentation').actionMessages({ outcome: 'plot_point', result: {
    plotPoints: 1, communityLevel: 2, communityProgress: plots.progression(10000), unlockedLevels: [2],
    plotSpotlight: { ...badge, eventId: 'spooky-2026', imageCollection: 'Spooky', emojiName: 'spooky_hadley_badge' },
  } }, { actorId: 'alice', members: [{ userId: 'alice', displayName: 'Alice' }], registeredIds: new Set(['alice']),
    guildName: 'Meridian Campaign Setting' })[0].payload
  assert.equal(payload.communityBanner.displayName,'Meridian Campaign Setting')
  assert.equal(payload.communityBanner.currentEvent,'Spooky Season')
  assert.equal(payload.communityBanner.currentEventEmoji,'🎃')
  assert.equal(JSON.parse(JSON.stringify(payload)).communityBanner.currentEvent,'Spooky Season')
  const ready = await require('../services/spooky/token-art').preparePayload(payload, { now: new Date('2026-10-13T12:00:00Z') })
  assert.equal(ready.communityBanner, undefined)
  assert.equal(ready.files.length, 1)
  assert.equal(ready.files[0].name, 'community-level-up.png')
  assert.ok(Buffer.isBuffer(ready.files[0].attachment) && ready.files[0].attachment.length > 10000)
  assert.equal(ready.embeds[0].image.url, 'attachment://community-level-up.png')
  const evidence = require('../services/spooky/token-art').evidenceEmbeds(payload, {
    embeds: [{ image: { url: 'https://cdn.discordapp.com/attachments/1/community-level-up.png' } }],
    attachments: [{ name: 'community-level-up.png', url: 'https://cdn.discordapp.com/attachments/1/community-level-up.png' }],
  })
  assert.equal(evidence[0].image.url, 'attachment://community-level-up.png')
})
