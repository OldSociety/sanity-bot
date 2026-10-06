const test = require('node:test'), assert = require('node:assert/strict'), Sequelize = require('sequelize')
const { config } = require('../services/spooky/config')
async function fixture(t, random = () => 0) {
 const db = new Sequelize({ dialect:'sqlite',storage:':memory:',logging:false });t.after(()=>db.close())
 for(const file of ['20261001000000-create-spooky-core','20261001000001-create-spooky-delivery']) await require('../migrations/'+file).up(db.getQueryInterface())
 const models=require('../services/spooky/models').defineSpookyModels(db),event={...config,enabled:true}
 let now=new Date(config.startsAt)
 const economy=require('../services/spooky/economy').createEconomy({sequelize:db,models,configVersion:event.version,clock:()=>now})
 const participants=require('../services/spooky/participants').createParticipants({models,economy,event})
 const effects=require('../services/spooky/effects').createEffects({models,participants,event})
 const members=['alice','bob','carol','dan','eve','frank'].map(userId=>({userId,bot:false,nickname:null,displayName:userId,roleIds:[],canManageCurse:true,canManageNickname:true,canManageSweetTooth:true}))
 const adapter={getMember:async(_,id)=>members.find(m=>m.userId===id),setNickname:async(_,id,nick)=>{members.find(m=>m.userId===id).nickname=nick},getRoleHolders:async(_,role)=>members.filter(m=>m.roleIds.includes(role)).map(m=>m.userId),setRole:async(_,id,role,present)=>{const m=members.find(m=>m.userId===id);m.roleIds=m.roleIds.filter(r=>r!==role);if(present)m.roleIds.push(role)}}
 const delivery=require('../services/spooky/delivery').createDelivery({models,adapter,read:economy.read})
 const collection=require('../services/spooky/collection').createCollection({models,participants,event,random:()=>0})
 const deps={models,participants,effects,delivery,collection,event,random,listMembers:()=>members}
 const playful=require('../services/spooky/playful').createPlayful({...deps,roleIds:{curse:'curse',sweetTooth:'sweet'}})
 const events=require('../services/spooky/candy-events').createCandyEvents(deps)
 const theft=require('../services/spooky/theft').createTheft(deps)
 const handlers={...playful.handlers,...theft.handlers,...events.handlers}
 const scope={eventId:event.eventId,guildId:'guild'}
 const run=(key,fn)=>economy.execute({...scope,actorId:'alice',interactionId:key,operationType:'variety_test'},fn)
 const row=id=>models.Participant.findOne({where:{...scope,userId:id}})
 for(const m of members) {await participants.register({...scope,actorId:m.userId,interactionId:'register-'+m.userId});await(await row(m.userId)).update({candy:40})}
 const invoke=(key,outcome)=>run(key,async ctx=>{await ctx.changeBalance('alice','candy',-1,{metadata:{reason:'action_cost'}});return events.combat.receipt(ctx,await handlers[outcome](ctx,{actorId:'alice',action:outcome==='temporary_immunity'||outcome==='break_curse'?'treat':'trick',outcome}))})
 const total=async()=> (await models.Participant.findAll({where:scope})).reduce((n,p)=>n+p.candy,0)
 return {db,models,event,economy,participants,effects,playful,events,theft,delivery,members,scope,run,row,invoke,total,time:value=>{now=new Date(value)}}
}

test('large thefts sample the upper half, cap at five including holes, and conserve Candy on replay', async t => {
 for (const [roll, expected] of [[0,3],[.34,4],[.999999,5]]) {
  const draws = [0, roll], f = await fixture(t, () => draws.shift() ?? 0)
  await (await f.row('bob')).update({ candy:80 })
  const total = await f.total(), result = await f.invoke('range', 'candy_raid')
  assert.equal(result.receipt.stolen, expected)
  assert.equal(await f.total(), total - 1)
  assert.deepEqual((await f.invoke('range', 'candy_raid')).receipt, result.receipt)
 }
 const f = await fixture(t, () => .999999)
 await f.run('holes', async ctx => {
  for (const id of ['bob','carol','dan','eve','frank']) await f.effects.put(ctx,id,'bag_hole',{expiresAt:config.endsAt,metadata:{}})
  return {}
 })
 for (const outcome of ['candy_raid','candy_shakedown','sticky_fingers','trick_chain','bag_explosion','boo','bag_swap']) {
  for (const member of f.members) await (await f.row(member.userId)).update({candy:member.userId==='alice'?20:80})
  const total = await f.total(), result = await f.invoke('cap-'+outcome,outcome)
  const moved = (result.receipt.candyMovements || []).reduce((sum,item)=>sum+item.candy,0)
  assert.ok(moved <= 5,outcome)
  assert.equal(await f.total(),total-1,outcome)
 }
})

test('all nine candy outcomes conserve candy, charge once, freeze receipts and replay without a second debit',async t=>{
 const f=await fixture(t)
 for(const outcome of ['candy_raid','bag_swap','bag_explosion','sticky_fingers','reverse_robbery','candy_ransom','boo','candy_shakedown','trick_chain']) {
  for(const m of f.members) await(await f.row(m.userId)).update({candy:40})
  const before=await f.total(),result=await f.invoke(outcome,outcome)
  assert.equal(await f.total(),before-1,outcome)
  assert.equal(result.receipt.noEffect,undefined,outcome)
  const replay=await f.invoke(outcome,outcome);assert.equal(replay.replayed,true);assert.deepEqual(replay.receipt,result.receipt)
  assert.equal(await f.total(),before-1)
  const transferRows=await f.models.Ledger.findAll({where:{operationId:result.operationId,resource:'candy'}})
  assert.equal(transferRows.filter(r=>r.relatedUserId).reduce((n,r)=>n+r.delta,0),0)
 }
})
test('raid rounding, ransom, nearby swaps and conditional chain have their distinct bounded results',async t=>{
 const f=await fixture(t)
 await(await f.row('bob')).update({candy:80});assert.equal((await f.invoke('raid','candy_raid')).receipt.stolen,3)
 const ransom=(await f.invoke('ransom','candy_ransom')).receipt;assert.equal(ransom.ransomTaken,4);assert.equal(ransom.ransomReturned,2);assert.equal(ransom.stolen,2)
 await(await f.row('alice')).update({candy:20});await(await f.row('bob')).update({candy:25})
 await f.invoke('swap','bag_swap');assert.equal((await f.row('alice')).candy,22);assert.equal((await f.row('bob')).candy,22)
 const chain=(await f.invoke('chain','trick_chain')).receipt;assert.equal(chain.stolen,4);assert.equal(new Set(chain.victims.map(v=>v.userId)).size,3)
})
test('persistent hole adds ceiling25% up to2, preserves conservation and repairs without a nickname change',async t=>{
 const f=await fixture(t)
 await f.invoke('hole','marked_for_mischief');const hole=await f.models.Effect.findOne({where:{effectType:'bag_hole'}});assert.ok(hole)
 assert.equal(f.members[1].nickname,null)
 const one=(await f.invoke('one','steal_candy')).receipt;assert.equal(one.stolen,2)
 assert.equal(one.candyMovements[0].holeBonus,1)
 await(await f.row('bob')).update({candy:80});const raid=(await f.invoke('raid','candy_raid')).receipt;assert.equal(raid.stolen,4)
 assert.equal(raid.candyMovements[0].holeBonus,1)
 await(await f.row('bob')).update({candy:5})
 const ransom=(await f.invoke('hole-ransom','candy_ransom')).receipt
 assert.equal(ransom.ransomTaken,5);assert.equal(ransom.ransomReturned,2);assert.equal(ransom.stolen,3)
 assert.equal(ransom.candyMovements[0].holeBonus,1);assert.equal((await f.row('bob')).candy,2)
 assert.equal(await f.models.Effect.count({where:{effectType:'bag_hole'}}),1)
 const repaired=(await f.invoke('repair','break_curse')).receipt;assert.equal(repaired.bagRepairedUserId,'bob');assert.equal(await f.models.Effect.count({where:{effectType:'bag_hole'}}),0)
})
test('two-charge shield blocks the breaking hit, restores original nickname and never charges replay twice',async t=>{
 const f=await fixture(t);f.members[1].nickname='Original'
 await f.invoke('shield','temporary_immunity');await f.delivery.reconcile(f.scope)
 assert.equal(f.members[1].nickname,'✨( Original )✨')
 const before=(await f.row('bob')).candy
 const first=(await f.invoke('hit1','steal_candy')).receipt;assert.equal(first.stolen,0);assert.equal(first.blockedShields.find(s=>s.userId==='bob').popped,false)
 await f.invoke('hit1','steal_candy');assert.equal((await f.models.Effect.findOne({where:{effectType:'theft_protection',participantId:(await f.row('bob')).id}})).metadata.chargesRemaining,1)
 const second=(await f.invoke('hit2','steal_candy')).receipt;assert.equal(second.stolen,0);assert.equal(second.blockedShields[0].popped,true)
 assert.equal((await f.row('bob')).candy,before);await f.delivery.reconcile(f.scope);assert.equal(f.members[1].nickname,'Original')
 assert.equal((await f.invoke('hit3','steal_candy')).receipt.stolen,1)
})
test('shields deny Crown theft with no role/currency award; breaking attempt is still denied',async t=>{
 const f=await fixture(t)
 await f.run('owner',ctx=>require('../services/spooky/crown').createCrown({models:f.models,delivery:f.delivery,roleId:'sweet'}).capture(ctx,'bob',null).then(()=>({})))
 await f.delivery.reconcile(f.scope);await f.invoke('shield','temporary_immunity');await f.delivery.reconcile(f.scope)
 for(const key of ['crown1','crown2']) {const r=(await f.invoke(key,'steal_crown')).receipt;assert.equal(r.crownProtectedUserId,'bob');assert.equal(r.crownWon,false)}
 assert.equal(f.members[1].roleIds.includes('sweet'),true)
 const r=(await f.invoke('crown3','steal_crown')).receipt;assert.equal(r.crownWon,true);await f.delivery.reconcile(f.scope)
 assert.equal(f.members[0].roleIds.includes('sweet'),true);assert.equal(f.members[1].roleIds.includes('sweet'),false)
})
test('shield survives6h at most and hole/shield writes rollback together on failure',async t=>{
 const f=await fixture(t)
 await f.invoke('shield','temporary_immunity');await f.delivery.reconcile(f.scope)
 const expiry=Date.parse(config.startsAt)+21600000
 assert.equal(new Date((await f.models.Effect.findOne({where:{effectType:'theft_protection'}})).expiresAt).getTime(),expiry)
 await assert.rejects(f.run('rollback',async ctx=>{await f.events.combat.intercept(ctx,'bob');throw new Error('rollback')}),/rollback/)
 assert.equal((await f.models.Effect.findOne({where:{effectType:'theft_protection',participantId:(await f.row('bob')).id}})).metadata.chargesRemaining,2)
 f.time(expiry);await f.run('cleanup',ctx=>f.playful.cleanup(ctx));await f.delivery.reconcile(f.scope)
 assert.equal(await f.models.Effect.count({where:{effectType:'theft_protection'}}),0);assert.equal(f.members[1].nickname,null)
})
test('full receivers and tiny sources never lose unmoved candy; unregistered heavy targets are not enrolled',async t=>{
 const f=await fixture(t)
 await(await f.row('alice')).update({candy:80});await(await f.row('bob')).update({candy:1})
 const before=await f.total();assert.equal((await f.invoke('tiny','candy_raid')).receipt.stolen,1);assert.equal(await f.total(),before-1)
 for(const id of ['bob','carol','dan','eve','frank']) await(await f.row(id)).update({candy:80})
 const previous=await f.total();const explosion=(await f.invoke('full','bag_explosion')).receipt;assert.equal(explosion.fallback,'ordinary_theft');assert.equal(await f.total(),previous-1)
})


test('multi-recipient attacks spend one shield charge per victim and block every transfer including the popping hit', async t => {
 const f = await fixture(t);
 await f.invoke('shield', 'temporary_immunity'); await f.delivery.reconcile(f.scope);
 for (const key of ['multi1', 'multi2']) {
  const r = await f.run(key, async ctx => {
   assert.equal(await f.events.combat.transfer(ctx, 'bob', 'alice', 1), 0);
   assert.equal(await f.events.combat.transfer(ctx, 'bob', 'carol', 1), 0);
   return f.events.combat.receipt(ctx, {});
  });
  assert.equal(r.receipt.blockedShields.length, 1);
  assert.equal(await f.models.Ledger.count({ where: { operationId: r.operationId, resource: 'shield_charges' } }), 1);
 }
 assert.equal(await f.models.Effect.count({ where: { participantId: (await f.row('bob')).id, effectType: 'theft_protection' } }), 0);
});

test('hole amplification is aggregated per victim, bounded by room/funds, skipped for balancing swaps, and expires', async t => {
 const f = await fixture(t); await f.invoke('hole', 'marked_for_mischief');
 const before = await f.total();
 const r = await f.run('scatter', async ctx => {
  for (const id of ['alice', 'carol', 'dan', 'eve', 'frank']) await f.events.combat.transfer(ctx, 'bob', id, 1);
  return f.events.combat.receipt(ctx, {});
 });
 assert.equal(r.receipt.candyMovements.reduce((n, x) => n + x.holeBonus, 0), 1);
 assert.equal(r.receipt.candyMovements.reduce((n, x) => n + x.candy, 0), 5);
 assert.equal(await f.total(), before);
 await (await f.row('alice')).update({ candy: 79 }); await (await f.row('bob')).update({ candy: 1 });
 assert.equal((await f.run('bounded', async ctx => ({ moved: await f.events.combat.transfer(ctx, 'bob', 'alice', 8) }))).receipt.moved, 1);
 await (await f.row('alice')).update({ candy: 20 }); await (await f.row('bob')).update({ candy: 25 });
 const swap = (await f.invoke('swap', 'bag_swap')).receipt;
 assert.equal(swap.candyMovements[0].holeBonus, 0);
 assert.equal((await f.row('alice')).candy, 22); assert.equal((await f.row('bob')).candy, 22);
 f.time(Date.parse(config.startsAt) + 43200000);
 await f.run('expire-hole', ctx => f.playful.cleanup(ctx));
 assert.equal(await f.models.Effect.count({ where: { effectType: 'bag_hole' } }), 0);
});

test('shields absorb curse, reversal, and hole attacks before any role or nickname mutation', async t => {
 const f = await fixture(t);
 f.members.splice(2); await f.invoke('shield', 'temporary_immunity'); await f.delivery.reconcile(f.scope);
 for (const outcome of ['curse_target', 'marked_for_mischief']) {
  const r = (await f.invoke(outcome, outcome)).receipt;
  assert.equal(r.noEffect, 'shield_blocks_attack'); assert.equal(r.blockedShields[0].userId, 'bob');
 }
 assert.equal(await f.models.Effect.count({ where: { effectType: ['curse', 'bag_hole'] } }), 0);
 await f.delivery.reconcile(f.scope); assert.equal(f.members[1].nickname, null);
 await f.invoke('shield-again', 'temporary_immunity');
 const r = (await f.invoke('reverse', 'reverse_nickname')).receipt;
 assert.equal(r.noEffect, 'shield_blocks_attack');
 assert.equal(await f.models.Effect.count({ where: { effectType: 'reversed_nickname' } }), 0);
 // Shielded candidates remain selectable while their cosmetic delivery is pending.
 const candidates = await f.economy.read(transaction => f.playful.choiceCandidates({ ...{ scope: f.scope, transaction, now: new Date(config.startsAt) } }, { actorId: 'alice', outcome: 'curse_target' }));
 assert.deepEqual(candidates.map(x => x.userId), ['bob']);
});

test('three-charge strengths freeze on grant/replay and legacy shields retain their original expiry', async t => {
 const f = await fixture(t, () => .75);
 const grant = await f.invoke('three', 'temporary_immunity'), id = grant.receipt.shielded[0];
 const shield = await f.models.Effect.findOne({ where: { participantId: (await f.row(id)).id, effectType: 'theft_protection' } });
 assert.equal(shield.metadata.chargesRemaining, 3);
 await f.invoke('three', 'temporary_immunity'); assert.equal((await shield.reload()).metadata.chargesRemaining, 3);
 await f.run('legacy', ctx => f.effects.put(ctx, 'bob', 'theft_protection', { expiresAt: new Date(Date.parse(config.startsAt) + 3600000), metadata: {} }));
 await f.run('legacy-hit', async ctx => { assert.equal(await f.events.combat.intercept(ctx, 'bob'), true); return {}; });
 const legacy = await f.models.Effect.findOne({ where: { participantId: (await f.row('bob')).id, effectType: 'theft_protection' } });
 assert.equal(legacy.metadata.chargesRemaining, 1); assert.equal(new Date(legacy.expiresAt).getTime(), Date.parse(config.startsAt) + 3600000);
});

test('new heavy attacks choose registered players only; unavailable funded targets refund the whole operation', async t => {
 const f = await fixture(t);
 await (await f.row('bob')).update({ registeredAt: null });
 f.members.push({ userId: 'outsider', bot: false });
 const count = await f.models.Participant.count();
 assert.equal((await f.invoke('raid', 'candy_raid')).receipt.victims[0].userId, 'carol');
 assert.equal(await f.models.Participant.count(), count);
 for (const member of f.members.filter(x => x.userId !== 'outsider')) await (await f.row(member.userId)).update({ candy: member.userId === 'alice' ? 10 : 0 });
 f.members.pop();
 await assert.rejects(f.invoke('refund', 'candy_ransom'), error => error.code === 'NO_CANDY_TARGET');
 assert.equal((await f.row('alice')).candy, 10);
 assert.equal(await f.models.Operation.count({ where: { operationId: 'discord:refund' } }), 0);
});

test('blocked Crown capture earns no prestige/capture bonus or Fate currency and uses requested public failure wording', async t => {
 const f = await fixture(t);
 await f.run('owner', ctx => require('../services/spooky/crown').createCrown({ models: f.models, delivery: f.delivery, roleId: 'sweet' }).capture(ctx, 'bob', null).then(() => ({})));
 await f.delivery.reconcile(f.scope); await f.invoke('shield', 'temporary_immunity'); await f.delivery.reconcile(f.scope);
 const progression = require('../services/spooky/progression').createProgression({ User: { sequelize: f.db, findByPk: () => { throw new Error('Blocked Crown must not inspect Fate'); } }, models: f.models, event: f.event, isUnwanted: async () => true });
 const result = (await f.run('blocked-score', ctx => progression.wrapHandlers(f.playful.handlers).steal_crown(ctx, { actorId: 'alice', action: 'trick', outcome: 'steal_crown' }))).receipt;
 assert.equal(result.prestige.delta, 0); assert.equal(result.fateBonus, undefined); assert.equal(result.crownFirstWin, undefined);
 const receipt = { action: 'trick', outcome: 'steal_crown', candy: 40, eyes: 0, result };
 const messages = require('../services/spooky/presentation').actionMessages(receipt, { actorId: 'alice', members: f.members, registeredIds: new Set(['bob']) });
 assert.equal(messages[0].public, true); assert.match(messages[0].payload.embeds[0].description, /tried to take <@bob>'s crown. What a failure!/);
 assert.equal(messages[0].payload.content, undefined); assert.deepEqual(messages[0].payload.allowedMentions.users, []);
 const decorated = require('../services/spooky/gifs').withActionGif(receipt, messages, { operationId: 'blocked-score', routinePercent: 100 });
 assert.equal(decorated[0].payload.embeds[0].image, undefined);
});


test('protection repairs a damaged bag without granting a shield, even when no curse role can be managed; closure removes holes', async t => {
 const f = await fixture(t); await f.invoke('hole', 'marked_for_mischief');
 f.members[1].canManageCurse = false;
 const r = await f.run('repair', ctx => f.playful.handlers.temporary_immunity(ctx, { actorId: 'alice', action: 'treat', targetUserId: 'bob' }));
 assert.equal(r.receipt.bagRepairedUserId, 'bob'); assert.equal(r.receipt.shielded, undefined);
 assert.equal(await f.models.Effect.count(), 0);
 await f.invoke('second-hole', 'marked_for_mischief'); f.time(config.endsAt);
 await f.run('closed', ctx => f.playful.cleanup(ctx));
 assert.equal(await f.models.Effect.count(), 0); assert.equal(f.members[1].nickname, null);
});

test('conditional follow-ups stop at their boundaries and use distinct victims', async t => {
 const draws = []; const f = await fixture(t, () => draws.shift() ?? 0);
 for (const [key, rolls, expected] of [['stop1', [0, .4], 2], ['stop2', [0, .399, 0, .2], 3], ['all3', [0, .399, 0, .199, 0], 4]]) {
  draws.push(...rolls); const r = (await f.invoke(key, 'trick_chain')).receipt;
  assert.equal(r.stolen, expected); assert.equal(new Set(r.victims.map(x => x.userId)).size, r.victims.length);
 }
 draws.push(0, 0, .5); assert.equal((await f.invoke('sticky-stop', 'sticky_fingers')).receipt.stolen, 2);
 draws.push(0, 0, .499, 0); assert.equal((await f.invoke('sticky-go', 'sticky_fingers')).receipt.stolen, 3);
});
