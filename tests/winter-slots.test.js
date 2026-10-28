// Superseded pre-handoff rule assertions are retained in artifacts/winter-iron-progression-development-2026-10-27/before/. Native replacement coverage: winter-iron.test.js.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { Sequelize } = require('sequelize')
const { mkdtemp, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { createEconomy } = require('../services/winter/economy')
const rules = require('../services/winter/slots')
const { screen } = require('../services/winter/presentation')
const { createHandler } = require('../services/winter/runtime')
const { createLive } = require('../services/winter/live')
const buttons = payload => payload.components.flatMap(row => row.toJSON().components)

async function fixture(t, storage = ':memory:') {
  const db = new Sequelize({ dialect: 'sqlite', storage, logging: false })
  let now = 0, serial = 0, drop = .99, accuracy = 0, closed = false
  const draws = []
  const close = async () => { if (!closed) { closed = true; await db.close() } }
  t.after(close)
  const economy = createEconomy({ sequelize: db, clock: () => now, allowRestart: true,
    random: () => accuracy, dropRandom: () => drop, slotsRandom: () => draws.length ? draws.shift() : .9 })
  const run = (action = 'status', quantity, extra = {}) => economy.execute({ guildId: 'g', userId: 'p', interactionId: `slots-${++serial}`, action, quantity, ...extra })
  const state = async (user = 'p') => JSON.parse((await db.query('SELECT state FROM WinterBattles WHERE userId=$user', { bind: { user } }))[0][0].state)
  const replace = async (patch, user = 'p') => db.query('UPDATE WinterBattles SET state=$state WHERE userId=$user', { bind: { user, state: JSON.stringify({ ...await state(user), ...patch }) } })
  await run()
  await db.query('UPDATE WinterPlayers SET snow=1000,diamonds=1,tier=1')
  await db.query('UPDATE WinterProgress SET dummyHp=0,diamondsUnlocked=1')
  await db.query('UPDATE WinterShopProgress SET helped=1,snowmanOwned=1,snowmanHp=0')
  await db.query('UPDATE WinterKitchen SET spicyUnlocked=1,spicy=10')
  const bought = await run('buy-sturdy')
  const start = () => run('battle-start', bought.battle.fightId)
  const unlock = () => replace({ emporiumUnlocked: 1, buttonsUnlocked: 1, buttons: 100 })
  const bet = async (stake = '1') => { draws.push(0,0,0); return run('slots-bet', stake) }
  const setGame = async patch => { const s = await state(); await replace({ slots: { ...s.slots, ...patch } }); return rules.control((await state()).slots) }
  return { db, economy, close, run, state, replace, start, unlock, bet, setGame, draws,
    at: value => { now = value }, drop: value => { drop = value }, accuracy: value => { accuracy = value } }
}

test('original five stages, weights, stakes and first-roll protection are retained with Christmas symbols', () => {
  assert.deepEqual(rules.STAKES, [1,10,25,100])
  assert.deepEqual(rules.STAGES.map(s => s.name), ['Red','Blue','Green','Silver','Gold'])
  assert.deepEqual(rules.STAGES.map(s => s.effects.map(e => e[1])), [[50,16,8,14,8,12],[42,10,25,5,10,8],[40,8,24,8,8,12],[35,5,27,6,9,18],[39,5,34,2,20]])
  for (const draw of [0,.56,.75,.84,.99]) {
    const game = { ...rules.freshSlots(), active: 1 }
    rules.spin(game, () => draw)
    assert.equal(game.active, 1)
    assert.equal(game.stage, 0)
    assert.ok(!['advance','game_over'].includes(game.outcome))
  }
  assert.equal(rules.INITIAL_JACKPOT,105983)
  assert.equal(rules.RESET_JACKPOT,100000)
})





test('Emporium and Slots are gated and Azule uses the Azulis badge with italic dialogue', async t => {
  const f=await fixture(t)
  assert.equal((await f.run('emporium')).view,'not-ready')
  assert.equal((await f.run('slots')).view,'not-ready')
  await f.unlock()
  const receipt=await f.run('emporium'), payload=screen(receipt,receipt.view)
  assert.equal(payload.embeds[0].toJSON().title,'Azule’s Emporium')
  assert.match(payload.embeds[0].toJSON().description,/^_Welcome!.*single button.*glam\._$/)
  assert.equal(payload.files[0].attachment,path.resolve(__dirname,'../assets/badges/Classic/AZULIS_BADGE.png'))
  assert.deepEqual(buttons(payload).filter(b=>/slots/.test(b.custom_id)).map(b=>b.label),['Slots'])
  assert.doesNotMatch(JSON.stringify(payload.embeds[0].toJSON()),/Starting Clothes|max HP/)
  assert.match(payload.embeds[0].toJSON().footer.text,/💎.*🔘$/)
})

test('stakes charge once, collect pays Buttons once, and old game controls cannot spend or reroll', async t => {
  const f=await fixture(t); await f.unlock()
  const first=await f.bet('10')
  assert.equal(first.battle.buttons,90)
  assert.equal(first.battle.slots.pot,1) // Reduced ordinary gain, rounded to one Button.
  assert.equal(first.slotsJackpot,105998)
  const old=rules.control(first.battle.slots)
  f.draws.push(0,0)
  const next=await f.run('slots-spin',old,{interactionId:'one-spin'})
  assert.equal(next.battle.slots.pot,2)
  assert.deepEqual(await f.run('slots-spin',old,{interactionId:'one-spin'}),next)
  assert.match((await f.run('slots-spin',old)).message,/controls have changed/)
  const collect=rules.control(next.battle.slots)
  const cashed=await f.run('slots-collect',collect,{interactionId:'one-collect'})
  assert.equal(cashed.player.diamonds,0)
  assert.equal(cashed.battle.buttons,92)
  assert.equal(cashed.battle.slots.active,0)
  assert.deepEqual(await f.run('slots-collect',collect,{interactionId:'one-collect'}),cashed)
  assert.equal((await f.run('slots-collect',collect)).battle.buttons,92)
  await f.replace({buttons:0})
  assert.match((await f.run('slots-bet','100')).message,/not have enough/)
  await assert.rejects(f.run('slots-bet','2'),/quantity|stake/)
})

test('item outcomes grant only unlocked snowballs, retain original amounts and survive losing the pot', async t => {
  const f=await fixture(t); await f.unlock(); await f.bet()
  let token=await f.setGame({stage:2,pot:50})
  f.draws.push(.84,0)
  const spicy=await f.run('slots-spin',token)
  assert.equal(spicy.kitchen.spicy,13)
  assert.equal(spicy.battle.dirtyUnlocked,0)
  await f.replace({dirtyUnlocked:1})
  token=rules.control((await f.state()).slots)
  f.draws.push(.84,.99)
  const dirty=await f.run('slots-spin',token)
  assert.equal(dirty.battle.dirty,3)
  token=await f.setGame({stage:4,pot:51})
  f.draws.push(.9)
  const lost=await f.run('slots-spin',token)
  assert.equal(lost.battle.slots.active,0)
  assert.equal(lost.battle.slots.pot,0)
  assert.equal(lost.battle.dirty,3)
  assert.equal(lost.kitchen.spicy,13)
  assert.equal(lost.slotsJackpot,106014) // 105983 + 1 stake + 5 contribution + floor(51/2).
})

test('jackpot pays once and resets persistently; Zalathor outcome awards no equipment and preserves the game', async t => {
  const f=await fixture(t); await f.unlock(); await f.bet()
  let token=await f.setGame({stage:4,pot:50})
  f.draws.push(.79)
  const zalathor=await f.run('slots-spin',token)
  assert.equal(zalathor.battle.slots.outcome,'zalathor')
  assert.equal(zalathor.battle.slots.pot,50)
  assert.equal(zalathor.battle.slots.active,1)
  assert.equal(zalathor.player.diamonds,0)
  token=rules.control(zalathor.battle.slots)
  f.draws.push(.4)
  const jackpot=await f.run('slots-spin',token,{interactionId:'jackpot'})
  assert.equal(jackpot.player.diamonds,105989)
  assert.equal(jackpot.slotsJackpot,100000)
  assert.equal(jackpot.battle.slots.active,0)
  assert.deepEqual(await f.run('slots-spin',token,{interactionId:'jackpot'}),jackpot)
  assert.equal((await f.run('slots-spin',token)).player.diamonds,105989)
})

test('stage advancement and losses preserve original scaling and never make the pot negative', () => {
  for (const [stage,draw] of [[0,90/108],[1,.79],[2,.75],[3,.7]]) {
    const game={...rules.freshSlots(),active:1,stage,spins:1}
    rules.spin(game,()=>draw)
    assert.equal(game.stage,stage+1)
  }
  const game={...rules.freshSlots(),active:1,spins:1,stake:100,pot:100}
  const draws=[80/108,.999]
  rules.spin(game,()=>draws.shift())
  assert.equal(game.pot,64) // round(3 * 1.2 * sqrt(100)).
  game.pot=1
  rules.spin(game,()=>.75)
  assert.equal(game.pot,0)
})

test('concurrent spins and collecting cannot apply the same game revision twice', async t => {
  const f=await fixture(t); await f.unlock(); const started=await f.bet()
  const token=rules.control(started.battle.slots)
  f.draws.push(0,0)
  const outcomes=await Promise.all([f.run('slots-spin',token),f.run('slots-collect',token),f.run('slots-spin',token)])
  assert.equal(outcomes.filter(r=>!r.message).length,1)
  const state=await f.state()
  assert.equal(state.slots.spins,2)
  assert.equal(state.slots.pot,2)
  assert.equal(state.buttons,99)
})

test('game, wallet, jackpot and stale revision protection survive SQLite close and reopen', async t => {
  const directory=await mkdtemp(path.join(tmpdir(),'winter-slots-'))
  const storage=path.join(directory,'winter.sqlite'), f=await fixture(t,storage)
  await f.unlock(); const before=await f.bet('25')
  await f.close()
  const db=new Sequelize({dialect:'sqlite',storage,logging:false})
  t.after(async()=>{await db.close();await rm(directory,{recursive:true,force:true})})
  const economy=createEconomy({sequelize:db,clock:()=>0,dropRandom:()=>.99})
  const after=await economy.execute({guildId:'g',userId:'p',interactionId:'reopen-slots',action:'slots'})
  assert.deepEqual(after.battle.slots,before.battle.slots)
  assert.equal(after.battle.buttons,75)
  assert.equal(after.slotsJackpot,before.slotsJackpot)
  const collected=await economy.execute({guildId:'g',userId:'p',interactionId:'reopened-collect',action:'slots-collect',quantity:rules.control(after.battle.slots)})
  assert.equal(collected.battle.buttons,77)
})

test('new controls enforce owners and quantities and always keep the shared footer and Restart', async t => {
  const f=await fixture(t); await f.unlock()
  const handle=createHandler({getEconomy:()=>f.economy,authorize:()=>null,environment:()=> 'development'})
  let id=0,payload
  const run=(action,user='p')=>handle({id:`slot-ui-${++id}`,guildId:'g',user:{id:user},customId:`snow:p:${action}`,isButton:()=>true,
    deferUpdate:async()=>{},reply:async p=>{payload=p},editReply:async p=>{payload=p}})
  await run('slots')
  assert.equal(payload.embeds[0].toJSON().title,'Zalathor’s Winter Slots 🎰')
  assert.equal(buttons(payload).at(-1).label,'Restart')
  assert.match(payload.embeds[0].toJSON().footer.text,/100🔘/)
  f.draws.push(0,0,0)
  await run('slots-bet:1')
  assert.ok(buttons(payload).some(b=>b.custom_id.includes(':slots-spin:')))
  await run('slots-bet:1','other')
  assert.match(payload.content,/another player/)
  await run('slots-bet:2')
  assert.match(payload.content,/Invalid slots/)
  await run('slots-spin:bad')
  assert.match(payload.content,/expired/)
  const prompt=await f.run('restart')
  const reset=await f.run('restart-confirm',prompt.progress.restartToken)
  assert.deepEqual([reset.battle.buttons,reset.battle.emporiumUnlocked,reset.battle.slots],[0,0,null])
  assert.doesNotMatch(screen(reset,'welcome').embeds[0].toJSON().footer.text,/🔘/)
})

test('the guild jackpot is shared and concurrent winners cannot claim the same pre-reset pool', async t => {
  const f=await fixture(t); await f.unlock(); await f.bet()
  await f.run('status',undefined,{userId:'q'})
  await f.replace({emporiumUnlocked:1,buttonsUnlocked:1,buttons:1},'q')
  f.draws.push(0,0,0)
  const q=await f.run('slots-bet','1',{userId:'q'})
  assert.equal(q.slotsJackpot,105995)
  const pToken=await f.setGame({stage:4,pot:0})
  const qState=await f.state('q')
  await f.replace({slots:{...qState.slots,stage:4,pot:0}},'q')
  f.draws.push(.4,.4)
  const wins=await Promise.all([f.run('slots-spin',pToken),f.run('slots-spin',rules.control(qState.slots),{userId:'q'})])
  assert.deepEqual(wins.map(r=>r.player.diamonds).sort((a,b)=>a-b),[100000,105995])
  assert.equal((await f.run('slots')).slotsJackpot,100000)
})

test('failed Discord delivery never replays a committed stake and a saved game can be reopened', async t => {
  const f=await fixture(t); await f.unlock()
  const handle=createHandler({getEconomy:()=>f.economy,authorize:()=>null,environment:()=> 'development'})
  let edits=0
  f.draws.push(0,0,0)
  const originalError=console.error
  console.error=()=>{}
  try {
    await handle({id:'failed-slot-delivery',guildId:'g',user:{id:'p'},customId:'snow:p:slots-bet:1',isButton:()=>true,
      deferUpdate:async()=>{},reply:async()=>{},editReply:async()=>{if(++edits===1)throw Error('Discord unavailable')}})
  } finally { console.error=originalError }
  const saved=await f.run('slots')
  assert.equal(saved.battle.buttons,99)
  assert.equal(saved.battle.slots.spins,1)
  const retry=await f.run('slots-bet','1',{interactionId:'failed-slot-delivery'})
  assert.equal(retry.battle.buttons,99)
  assert.equal(retry.battle.slots.spins,1)
  assert.equal(handle.live.busy.size,0)
})

test('ordinary gain is reduced while jackpot remains unchanged', () => {
  const game={...rules.freshSlots(),active:1,stake:100,stage:4};
  const draws=[0,.999]; rules.spin(game,()=>draws.shift());
  assert.equal(game.pot,71); // previous 285
  assert.equal(rules.INITIAL_JACKPOT,105983);
});
