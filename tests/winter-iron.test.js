const {
    test
  } = require('node:test'),
  assert = require('node:assert/strict'),
  {
    Sequelize
  } = require('sequelize');
const {
  createEconomy,
  SHOVELS
} = require('../services/winter/economy');
const battle = require('../services/winter/battle'),
  gym = require('../services/winter/gym');
const {
    screen
  } = require('../services/winter/presentation'),
  {
    createHandler
  } = require('../services/winter/runtime');
const buttons = p => p.components.flatMap(r => r.toJSON().components);
test('first and zero-balance recovery drops each wait five actual throws, including misses', () => {
  const s=battle.freshBattle();s.sturdyOwned=1;battle.startBattle(s,0);
  for(let n=1;n<5;n++){
    battle.throwAtEnemy(s,n*3000,0,()=>.99,battle.config,()=>0,true);
    assert.equal(s.buttons,0);
  }
  battle.throwAtEnemy(s,15000,0,()=>0,battle.config,()=>0,true);
  assert.equal(s.buttons,1);assert.equal(s.throws,5);
  s.buttonIntroPending=0;s.buttons=0;
  for(let n=1;n<5;n++){
    battle.throwAtEnemy(s,15000+n*3000,0,()=>0,battle.config,()=>0,true);
    assert.equal(s.buttons,0);
  }
  battle.throwAtEnemy(s,30000,0,()=>0,battle.config,()=>0,true);
  assert.equal(s.buttons,1);
});

test('first Gym visit grants six Sweat once, reveals navigation and uses Cost without speed text', async t => {
  const f=await fixture(t);const start=await f.start();
  assert.ok(!buttons(screen(start,'fight')).some(b=>b.custom_id.endsWith(':train')));
  await f.replace({trainUnlocked:1});
  const first=await f.run('train',undefined,{interactionId:'first-gym'});
  assert.equal(first.battle.sweat,6);assert.equal(first.battle.gymVisited,1);assert.equal(first.battle.gymStarterClaimed,1);
  assert.deepEqual(await f.run('train',undefined,{interactionId:'first-gym'}),first);
  assert.equal((await f.run('train')).battle.sweat,6);
  const trained=await f.run('train-strength','1');assert.equal(trained.battle.sweat,5);
  assert.equal((await f.run('train')).battle.sweat,5);
  const ui=screen(trained,'train').embeds[0].toJSON();
  assert.match(ui.fields[0].value,/Cost:/);assert.doesNotMatch(JSON.stringify(ui),/next|SPD|Speed|3s/);
  assert.ok(buttons(screen(trained,'fight')).some(b=>b.custom_id.endsWith(':train')));
});

test('status links unlocked Slots and dev strength grants add25 once per receipt, capped at100', async t => {
  const f=await fixture(t,true);await f.start();
  const initial=await f.run();assert.ok(!buttons(screen(initial,'status')).some(b=>b.custom_id.endsWith(':slots')));
  await f.replace({emporiumUnlocked:1});
  const unlocked=await f.run();assert.ok(buttons(screen(unlocked,'status')).some(b=>b.label==='Slots'));
  const strength=await f.run('test-strength',undefined,{interactionId:'str25'});
  assert.equal(strength.battle.gym.strength,25);assert.equal(strength.battle.sweat,0);
  assert.deepEqual(await f.run('test-strength',undefined,{interactionId:'str25'}),strength);
  assert.ok(buttons(screen(strength,'fight',{development:true})).some(b=>b.custom_id.endsWith(':test-strength')));
  assert.ok(!buttons(screen(strength,'fight')).some(b=>b.custom_id.endsWith(':test-strength')));
  await f.replace({gym:{...strength.battle.gym,strength:90}});
  assert.equal((await f.run('test-strength')).battle.gym.strength,100);
  const prod=await fixture(t);await assert.rejects(prod.run('test-strength'),/development/);
});
test('Winter numbers display whole compact values without altering exact accounting', () => {
  const {compactNumber}=require('../services/winter/numbers');
  assert.equal(compactNumber(1999),'1k');
  assert.equal(compactNumber(1999999),'1m');
  assert.equal(compactNumber(999),'999');
});

test('STR scales only regular throws and SPC only specials, including Fire Flower', () => {
  const run=(strength,special,fire=false)=>{
    const state=battle.freshBattle();state.sturdyOwned=1;
    state.gym.strength=strength;state.gym.special=special;state.fireFlowerOwned=Number(fire);
    battle.startBattle(state,0);state.buttonsUnlocked=1;
    const player={snow:1000},kitchen={spicy:10};
    if(fire)battle.enqueue(state,'spicy',kitchen);
    battle.advanceBattle(player,state,3000,()=>{},()=>0,battle.config,()=>.99,false,kitchen);
    return {damage:80-state.enemyHp,remaining:kitchen.spicy,stats:battle.derived(state)};
  };
  assert.equal(run(100,0).damage,4);
  assert.equal(run(0,100).damage,2);
  assert.equal(run(100,0,true).damage,50);
  const s=battle.freshBattle();s.sturdyOwned=1;s.gym.strength=100;s.gym.special=100;
  battle.startBattle(s,0);s.enemyMaxHp=s.enemyHp=200;s.buttonsUnlocked=1;
  battle.enqueue(s,'spicy',{spicy:10});
  battle.advanceBattle({snow:100},s,3000,()=>{},()=>0,battle.config,()=>.99,false,{spicy:10});
  assert.equal(s.enemyHp,180);
  assert.equal(battle.derived(s).interval,3000);
});

test('every new battle and every victory fully reset both health bars and timers', () => {
  const s=battle.freshBattle();s.sturdyOwned=1;s.mittensOwned=1;
  battle.startBattle(s,0);s.playerHp=1;s.enemyHp=2;s.stunRemaining=3;s.queue=['spicy'];
  s.phase='paused';s.active=0;s.specialReadyAt=5000;
  battle.startBattle(s,1000);
  assert.deepEqual([s.playerHp,s.enemyHp,s.nextPlayerAt,s.nextEnemyAt],[50,80,4000,11000]);
  assert.deepEqual(s.queue,[]);assert.equal(s.stunRemaining,0);assert.equal(s.specialReadyAt,5000);
  s.playerHp=1;battle.won(s,5000);
  assert.deepEqual([s.playerHp,s.enemyHp,s.enemyMaxHp],[50,81,81]);
});

test('six snowmen unlock in order and award the specified810 Sweat through their required kills', () => {
  const enemies=require('../services/winter/opponents'),s=battle.freshBattle();s.sturdyOwned=1;
  assert.deepEqual(enemies.available(s,battle.config).map(e=>e.id),['snowman-1']);
  assert.match(enemies.select(s,'snowman-2',battle.config),/not unlocked/);
  const totals=[10,40,115,255,480,810];
  for(const [index,enemy] of battle.config.snowmen.entries()){
    assert.equal(enemies.select(s,enemy.id,battle.config),null);
    battle.startBattle(s,index*100000);
    assert.equal(s.enemyHp,enemy.baseHp);
    for(let n=0;n<enemy.killsToUnlockNext;n++)battle.won(s,index*100000+n*3000);
    assert.equal(s.sweat,totals[index]);
    assert.equal(s.enemyMaxHp,enemy.baseHp+enemy.killsToUnlockNext);
    assert.equal(enemies.available(s,battle.config).length,Math.min(6,index+2));
  }
  assert.equal(s.defeated,185);
  assert.deepEqual(Object.values(s.snowmanWins),[10,15,25,35,45,55]);
});

test('new opponent controls reject locked or stale selections and start unlocked fights at full HP', async t => {
  const f=await fixture(t);
  let saved=await f.state();
  const locked=await f.run('battle-opponent','snowman-2.'+saved.fightId);
  assert.match(locked.message,/not unlocked/);assert.equal(locked.battle.snowmanId,'snowman-1');
  await f.replace({snowmanWins:{'snowman-1':10},defeated:10,playerHp:1,enemyHp:1});
  const start=await f.run('battle-opponent','snowman-2.'+saved.fightId);
  assert.equal(start.view,'fight');assert.deepEqual([start.battle.enemyHp,start.battle.playerHp],[139,10]);
  assert.equal(start.battle.snowmanId,'snowman-2');
  const picker=await f.run('opponents');assert.equal(picker.view,'opponents');assert.equal(picker.battle.active,0);
  const controls=buttons(screen(picker,'opponents'));
  assert.ok(controls.some(b=>b.label==='Snowman 2 ⛄️'));
  assert.ok(!controls.some(b=>b.label==='Snowman 3 ⛄️'));
  await f.run('battle-opponent','snowman-2.'+picker.battle.fightId);
  const stale=await f.run('battle-opponent','snowman-1.'+saved.fightId);
  assert.match(stale.message,/out of date/);assert.equal(stale.battle.snowmanId,'snowman-2');
  f.at(10000);const lost=await f.run('battle-tick');
  assert.equal(lost.battle.playerHp,2); // Snowman2 deals8, regular player attacks remain every3s.
});

test('SPD migration preserves purchased levels as SPC without changing the attack interval', () => {
  const s=battle.freshBattle();s.modelVersion=3;s.gym={strength:7,accuracy:2,dodge:3,speed:41};
  s.gymUnlocked={strength:1,accuracy:1,dodge:1,speed:1};s.trainingSkill='speed';s.defeated=12;
  battle.migrate(s,1000);
  assert.equal(s.gym.special,41);assert.equal(s.gym.speed,undefined);assert.equal(s.gymUnlocked.special,1);
  assert.equal(s.trainingSkill,'special');assert.equal(battle.derived(s).interval,3000);
  assert.equal(s.snowmanWins['snowman-1'],12);
  assert.equal(battle.migrate(s,2000),false);
});

test('fully unlocked opponent and material shop screens fit Discord without exposing SPD or evolution outside shop', async t => {
  const f=await fixture(t,true);
  await f.replace({snowmanWins:Object.fromEntries(battle.config.snowmen.map(e=>[e.id,e.killsToUnlockNext])),ironMaterial:1,weightStage:4,hendrixUnlocked:1,requiaUnlocked:1,emporiumUnlocked:1,gymUnlocked:{strength:1,accuracy:1,dodge:1,special:1},trainUnlocked:1});
  const receipt=await f.run();
  for(const view of ['shop','train','opponents','fight','status']){
    const payload=screen(receipt,view,{development:true});
    assert.ok(payload.components.length<=5,view);
    assert.ok(payload.components.every(r=>r.toJSON().components.length<=5),view);
    assert.doesNotMatch(JSON.stringify(payload.embeds[0].toJSON()),/SPD|Speed/);
    assert.equal(buttons(payload).some(b=>b.custom_id.endsWith(':iron')),view==='shop');
  }
  assert.equal(buttons(screen(receipt,'opponents')).filter(b=>b.custom_id.includes(':battle-opponent:')).length,6);
});

test('successful hit drops use75% at zero Buttons and5% otherwise; misses never drop', () => {
  const s=battle.freshBattle();s.sturdyOwned=1;battle.startBattle(s,0);
  for(let i=1;i<=4;i++){battle.throwAtEnemy(s,i*3000,2,()=>0,battle.config,()=>0);assert.equal(s.buttons,0);}
  battle.throwAtEnemy(s,15000,2,()=>0,battle.config,()=>.749);
  assert.equal(s.buttons,1);
  battle.throwAtEnemy(s,6000,2,()=>0,battle.config,()=>.05);
  assert.equal(s.buttons,1);
  s.buttons=0;
  battle.throwAtEnemy(s,9000,2,()=>0,battle.config,()=>.75);
  assert.equal(s.buttons,0);
  battle.throwAtEnemy(s,12000,2,()=>.99,battle.config,()=>0);
  assert.equal(s.buttons,0);
});

test('Mittens and Fire Flower charge once, conceal effects and reserve five ammo per fireball', async t => {
  const f=await fixture(t);
  await f.replace({emporiumUnlocked:1,buttonsUnlocked:1,buttons:100});
  const mittens=await f.run('buy-mittens',undefined,{interactionId:'mittens'});
  assert.equal(mittens.battle.buttons,90);
  assert.equal(battle.derived(mittens.battle).maxHp,50);
  assert.equal(mittens.battle.playerHp,10);
  assert.deepEqual(await f.run('buy-mittens',undefined,{interactionId:'mittens'}),mittens);
  const flower=await f.run('buy-fire-flower');assert.equal(flower.battle.buttons,40);
  const shop=screen(flower,'emporium').embeds[0].toJSON();
  assert.equal(shop.fields.length,3);assert.doesNotMatch(JSON.stringify(shop),/max HP|damage|Starting Clothes/);
  assert.equal((await f.run('buy-fire-flower')).battle.buttons,40);
  const start=await f.start();
  const queued=await f.run('battle-special',start.battle.fightId);
  assert.equal(queued.kitchen.spicy,20);
  assert.ok(buttons(screen(queued,'fight')).some(b=>b.label==='🔥'));
  f.at(3000);const fired=await f.run('battle-tick');
  assert.equal(fired.kitchen.spicy,15);assert.equal(fired.battle.enemyHp,30);
  await f.replace({queueCapacity:10,queue:[]});
  await f.db.query('UPDATE WinterKitchen SET spicy=9');
  await f.run('battle-special',fired.battle.fightId);
  const full=await f.run('battle-special',fired.battle.fightId);
  assert.match(full.message,/ammunition/);assert.deepEqual(full.battle.queue,['spicy']);
});

test('Winter Hendrix is an ownership-gated Arena skin of the existing Hendrix kit', () => {
  const {execFileSync}=require('node:child_process');
  const result=execFileSync(process.execPath,['-e',`const assert=require('node:assert/strict');
    const {accessSnapshot}=require('./services/arena/player-access');
    const {characters,isSelectable}=require('./services/arena/characters');
    const {rosterFor}=require('./services/arena/selection');
    assert.equal(accessSnapshot().allowedVariantIds.includes('winter-2026:hen'),false);
    const access=accessSnapshot({badgeIds:['winter-2026:hen']});
    assert.ok(access.allowedVariantIds.includes('winter-2026:hen'));
    assert.ok(rosterFor(access.allowedVariantIds).some(f=>f.variantIds.includes('winter-2026:hen')));
    assert.equal(characters.find(c=>c.id==='winter-2026:hen').kit,'classic-hendrix');
    console.log('ownership verified');`],{cwd:require('node:path').resolve(__dirname,'..'),env:{...process.env,NODE_ENV:'development'},encoding:'utf8'});
  assert.match(result,/ownership verified/);
});
async function fixture(t, testing = false) {
  const db = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false
  });
  t.after(() => db.close());
  let now = 0,
    id = 0,
    roll = 0,
    drop = .99;
  const slots = [];
  const economy = createEconomy({
    sequelize: db,
    clock: () => now,
    allowRestart: testing,
    random: () => roll,
    dropRandom: () => drop,
    slotsRandom: () => slots.shift() ?? 0
  });
  const run = (action = 'status', quantity, extra = {}) => economy.execute({
    guildId: 'g',
    userId: 'p',
    interactionId: 'iron-' + ++id,
    action,
    quantity,
    ...extra
  });
  const state = async () => JSON.parse((await db.query('SELECT state FROM WinterBattles'))[0][0].state);
  const replace = async patch => db.query('UPDATE WinterBattles SET state=$state', {
    bind: {
      state: JSON.stringify({
        ...(await state()),
        ...patch
      })
    }
  });
  await run();
  await db.query('UPDATE WinterPlayers SET snow=2000000,diamonds=1,tier=2');
  await db.query('UPDATE WinterProgress SET dummyHp=0');
  await db.query('UPDATE WinterShopProgress SET helped=1,snowmanOwned=1,snowmanHp=0');
  await db.query('UPDATE WinterKitchen SET spicyUnlocked=1,spicy=20');
  const bought = await run('buy-sturdy');
  return {
    db,
    economy,
    run,
    state,
    replace,
    start: () => run('battle-start', bought.battle.fightId),
    at: v => now = v,
    accuracy: v => roll = v,
    drop: v => drop = v,
    slots
  };
}
test('native regular/spicy attacks share schedule, accuracy and victory-only Sweat', async t => {
  const f = await fixture(t),
    started = await f.start();
  assert.equal(started.battle.playerHp, 10);
  const queued = await f.run('battle-special', started.battle.fightId, {
    interactionId: 'queue-once'
  });
  assert.equal(queued.battle.enemyHp, 80);
  assert.equal(queued.kitchen.spicy, 20);
  assert.deepEqual(queued.battle.queue, ['spicy']);
  assert.deepEqual(await f.run('battle-special', started.battle.fightId, {
    interactionId: 'queue-once'
  }), queued);
  assert.match((await f.run('battle-special', started.battle.fightId)).message, /full/);
  f.at(3000);
  const first = await f.run('battle-tick');
  assert.equal(first.battle.enemyHp, 70);
  assert.equal(first.kitchen.spicy, 19);
  assert.equal(first.battle.sweat, 0);
  assert.equal(first.player.snow, 2000108);
  f.accuracy(.9);
  f.at(6000);
  const miss = await f.run('battle-tick');
  assert.equal(miss.battle.enemyHp, 70);
  assert.equal(miss.player.snow, 2000206);
  assert.equal(miss.battle.sweat, 0);
});
test('Dirty is disabled and cannot be queued or consumed during an active stun', async t => {
  const f = await fixture(t),
    started = await f.start();
  await f.replace({
    dirtyUnlocked: 1,
    dirty: 2,
    stunRemaining: 2
  });
  const blocked = await f.run('battle-dirty', started.battle.fightId);
  assert.match(blocked.message, /already stunned/);
  assert.equal(blocked.battle.dirty, 2);
  assert.deepEqual(blocked.battle.queue, []);
  assert.equal(buttons(screen(blocked, 'fight')).find(b => b.label === '🟤').disabled, true);
  f.at(20000);
  await f.run('battle-tick');
  const q = await f.run('battle-dirty', started.battle.fightId);
  assert.deepEqual(q.battle.queue, ['dirty']);
  f.at(21000);
  const fired = await f.run('battle-tick');
  assert.equal(fired.battle.dirty, q.battle.dirty - 1);
  assert.ok(fired.battle.stunRemaining > 0);
});
test('growing Sturdy stats, per-hit drop and per-victory reward, capped ten HP healing and challenger unlock', async t => {
  const f = await fixture(t);
  await f.start();
  await f.replace({
    enemyHp: 1,
    playerHp: 20,
    defeated: 9,
    zeroButtonWindowActive:1,zeroButtonThrows:4
  });
  f.drop(0);
  f.at(3000);
  const win = await f.run('battle-tick', undefined, {
    interactionId: 'win'
  });
  assert.deepEqual([win.battle.defeated, win.battle.enemyMaxHp, win.battle.enemyHp, win.battle.playerHp, win.battle.sweat], [10, 90, 90, 10, 1]);
  assert.equal(win.battle.nextChallengerUnlocked, 1);
  assert.equal(win.battle.buttons, 1);
  assert.equal(win.battle.active, 0);
  assert.deepEqual(await f.run('battle-tick', undefined, {
    interactionId: 'win'
  }), win);
});
test('defeat preserves resources and opens Gym; a fresh run restores full clothing HP', async t => {
  const f = await fixture(t);
  await f.start();
  await f.replace({
    playerHp: 1,
    nextEnemyAt: 1000,
    sweat: 10,
    outfitOwned: 1
  });
  f.at(1000);
  const lost = await f.run('battle-tick');
  assert.equal(lost.view, 'train');
  assert.equal(lost.battle.playerHp, 0);
  assert.equal(lost.battle.sweat, 16);
  assert.equal(lost.kitchen.spicy, 20);
  const fresh = await f.run('battle-start', lost.battle.fightId);
  assert.equal(fresh.battle.playerHp, 100);
});
test('training buys one level even with an old bulk control and never reveals stats before lifting', async t => {
  const f=await fixture(t); await f.replace({trainUnlocked:1,sweat:20200});
  const a=await f.run('train-strength','10');
  assert.equal(a.battle.gym.strength,1); assert.equal(a.battle.sweat,20205);
  const b=await f.run('train-strength','max');assert.equal(b.battle.gym.strength,2);
  assert.equal(b.battle.gymUnlocked.accuracy,0);
  const controls=buttons(screen(b,'train'));
  assert.deepEqual(controls.map(x=>x.custom_id.split(':')[2]),['train-strength','lift']);
});


test('25/50/75/100 weights unlock stats sequentially and Iron at25, badge and opponent at100', async t => {
  const f=await fixture(t); await f.replace({trainUnlocked:1,sweat:325});
  assert.ok((await f.run('lift')).message.startsWith(gym.LIFT_TAUNT));
  await f.replace({gym:{strength:25,accuracy:0,dodge:0,speed:0}});
  const first=await f.run('lift'); assert.equal(first.battle.weightStage,1); assert.equal(first.battle.sweat,331);
  assert.equal(first.battle.gymUnlocked.accuracy,1);assert.equal(first.battle.ironShovelOwned,0);assert.equal(first.battle.ironMaterial,1);
  assert.equal(first.battle.queueCapacity,10);
  for(const strength of [50,75,100]){const st=await f.state();await f.replace({gym:{...st.gym,strength}});await f.run('lift');}
  const done=await f.run('train');assert.equal(done.battle.weightStage,4);assert.equal(done.battle.hendrixUnlocked,1);
  assert.equal((await f.db.query("SELECT badgeId FROM BadgeOwnership WHERE badgeId='winter-2026:hen'"))[0].length,1);
  assert.match((await f.run('lift')).message,/already/);
});


test('Iron consumes material and exactly one million snow at old-rate boundary without altering DB tier or ammo', async t => {
  const f = await fixture(t);
  await f.replace({
    ironMaterial: 1,
    weightStage: 1
  });
  f.at(500);
  const before = await f.run();
  assert.equal(before.player.snow,2000018);assert.equal(before.battle.ironMaterial,1);
  const offer=buttons(screen(before,'shop')).find(b=>b.custom_id.endsWith(':iron'));assert.ok(offer);
  const iron = await f.run('iron',undefined,{interactionId:'trade-iron'});
  assert.equal(iron.view,'shop');assert.equal(iron.player.snow, 1000018);
  assert.deepEqual(await f.run('iron',undefined,{interactionId:'trade-iron'}),iron);
  assert.equal(iron.player.tier, 2);
  assert.equal(iron.player.shovelTier, 3);
  assert.equal(iron.battle.ironMaterial, 0);
  assert.equal(iron.kitchen.spicy, 20);
  f.at(1500);
  const next = await f.run();
  assert.equal(next.player.snow, iron.player.snow + 216);
  assert.equal((await f.db.query('SELECT tier FROM WinterPlayers'))[0][0].tier, 2);
  assert.equal(SHOVELS[3].rate, 216);
  assert.equal((await f.run('iron')).player.snow, next.player.snow);
});
test('clothing costs Buttons once and changes maximum HP without free healing', async t => {
  const f = await fixture(t);
  await f.replace({
    emporiumUnlocked: 1,
    buttonsUnlocked: 1,
    buttons: 150,
    playerHp: 17
  });
  const bought = await f.run('buy-outfit');
  assert.equal(bought.battle.buttons, 50);
  assert.equal(bought.battle.playerHp, 17);
  assert.equal(battle.derived(bought.battle).maxHp, 100);
  assert.equal((await f.run('buy-outfit')).battle.buttons, 50);
});
test('Snow Slots payout distribution is exactly three expected Buttons and spending/retries are atomic', async t => {
  const f = await fixture(t);
  await f.replace({
    emporiumUnlocked: 1
  });
  assert.equal(battle.config.snowSlotsRewards.reduce((n, r) => n + r.buttons * r.weight / 100, 0), 3);
  f.slots.push(0, .4, .7, .9);
  let sum = 0;
  const before = await f.run();
  for (let i = 0; i < 4; i++) {
    const r = await f.run('snow-spin', '1');
    sum = r.battle.buttons;
  }
  assert.equal(sum, 21);
  const after = await f.run();
  assert.equal(before.player.snow - after.player.snow, 40000);
  f.slots.push(.9);
  const paid = await f.run('snow-spin', '1', {
    interactionId: 'one-spin'
  });
  assert.deepEqual(await f.run('snow-spin', '1', {
    interactionId: 'one-spin'
  }), paid);
});
test('Spicy craft quantities use snow once and preserve existing ammo', async t => {
  const f = await fixture(t),
    before = await f.run();
  const crafted = await f.run('buy-spicy', '100');
  assert.equal(crafted.kitchen.spicy, 120);
  assert.equal(crafted.player.snow, before.player.snow - 10000);
  assert.equal(crafted.player.diamonds, before.player.diamonds);
});
test('development guarantees a Button no earlier than throw five and offers an instant Sturdy victory', async t => {
  const f = await fixture(t, true);
  await f.start();
  f.at(12000);
  assert.equal((await f.run('battle-tick')).battle.buttons,0);
  f.at(15000);
  const found = await f.run('battle-tick');
  assert.equal(found.battle.throws, 5);
  assert.equal(found.battle.buttons, 1);
  assert.equal(found.view, 'button-found');
  await f.run('emporium');
  const resumed = await f.run('battle-start', found.battle.fightId);
  const ui = screen(resumed, 'fight', {
    development: true
  });
  assert.ok(buttons(ui).some(b => b.custom_id.endsWith(':test-sturdy')));
  const killed = await f.run('test-sturdy');
  assert.equal(killed.battle.defeated, 1);
  assert.equal(killed.battle.sweat, 1);
  const prod = await fixture(t);
  await assert.rejects(prod.run('test-sturdy'), /development/);
});
test('admin resource controls enforce development and administrator checks, dedupe and use current production rate', async t => {
  const f = await fixture(t, true);
  await assert.rejects(f.run('grant-sweat'), /administrators/);
  const before = await f.run();
  const snow = await f.run('grant-snow', undefined, {
    admin: true,
    interactionId: 'grant'
  });
  assert.equal(snow.player.snow, before.player.snow + 129600);
  assert.deepEqual(await f.run('grant-snow', undefined, {
    admin: true,
    interactionId: 'grant'
  }), snow);
  const sweat = await f.run('grant-sweat', undefined, {
    admin: true
  });
  assert.equal(sweat.battle.sweat, 100);
  const ammo = await f.run('grant-ammo', undefined, {
    admin: true
  });
  assert.equal(ammo.kitchen.spicy, 30);
  assert.equal(ammo.battle.dirty, 10);
  assert.equal(ammo.player.snowballs, 10);
  let payload;
  const handle = createHandler({
    getEconomy: () => f.economy,
    authorize: () => null,
    environment: () => 'development'
  });
  await handle({
    id: 'denied',
    guildId: 'g',
    user: {
      id: 'p'
    },
    isButton: () => false,
    options: {
      getSubcommand: () => 'admin'
    },
    reply: async p => payload = p
  });
  assert.match(payload.content, /administrators/);
});
test('legacy migration preserves balances, old stats, recipes, Slots, discoveries and opponent ownership', () => {
  const legacy = {
    ...battle.freshBattle(),
    modelVersion: undefined,
    playerHp: 7,
    enemyHp: 99,
    enemyMaxHp: 150,
    gym: {
      strength: 12,
      accuracy: 8,
      defense: 9,
      attack: 10
    },
    sweat: 123,
    dirty: 8,
    hendrixUnlocked: 1,
    slots: {
      active: 1,
      pot: 5
    }
  };
  assert.equal(battle.migrate(legacy, 100), true);
  assert.deepEqual(legacy.gym, {
    strength: 12,
    accuracy: 8,
    dodge: 9,
    special: 10
  });
  assert.equal(legacy.sweat, 123);
  assert.equal(legacy.dirty, 8);
  assert.equal(legacy.slots.pot, 5);
  assert.equal(legacy.hendrixUnlocked, 1);
  assert.equal(battle.migrate(legacy, 1000), false);
});
test('ten-slot queue reserves ammo, replaces scheduled attacks, and preserves unthrown ammo on defeat', async t => {
  const f = await fixture(t);
  const started = await f.start();
  await f.replace({
    queueCapacity: 10,
    weight20: 1
  });
  for (let i = 0; i < 10; i++) await f.run('battle-special', started.battle.fightId);
  const full = await f.run('battle-special', started.battle.fightId);
  assert.match(full.message, /full/);
  assert.equal(full.kitchen.spicy, 20);
  f.at(3000);
  const one = await f.run('battle-tick');
  assert.equal(one.kitchen.spicy, 19);
  assert.equal(one.battle.queue.length, 9);
  await f.replace({
    playerHp: 1,
    nextEnemyAt: 4000
  });
  f.at(4000);
  const lost = await f.run('battle-tick');
  assert.deepEqual(lost.battle.queue, []);
  assert.equal(lost.kitchen.spicy, 19);
});
test('31 offline days resolve chronologically with bounded state and no truncated run', () => {
  const state = battle.freshBattle(),
    settings = {
      ...battle.config,
      enemyDamage: 0,
      snowmen: battle.config.snowmen.map(enemy=>({...enemy,damage:0}))
    };
  state.sturdyOwned = 1;
  state.buttonsUnlocked = 1;
  battle.startBattle(state, 0, settings);
  const player = {
    snow: 1000000000,
    productionRate: 36
  };
  battle.advanceBattle(player, state, 31 * 86400000, () => {}, () => 0, settings, () => .99, false, {
    spicy: 0
  });
  assert.equal(state.active, 1);
  assert.equal(state.defeated, 1811);
  assert.equal(state.sweat, 1811);
  assert.equal(player.snow, 991072000);
});
test('all interface rows fit Discord and all new routes render without error', async t => {
  const f = await fixture(t, true);
  await f.replace({
    trainUnlocked: 1,
    gym: {
      strength: 20,
      accuracy: 20,
      dodge: 20,
      special: 20
    },
    gymUnlocked: {
      strength: 1,
      accuracy: 1,
      dodge: 1,
      speed: 1
    },
    emporiumUnlocked: 1,
    dirtyUnlocked: 1,
    dirty: 10
  });
  for (const view of ['shop', 'train', 'emporium', 'shovel', 'admin', 'snow-slots']) {
    const r = await f.run();
    const p = screen(r, view, {
      development: true
    });
    assert.ok(p.components.length <= 5, view);
    assert.ok(p.components.every(row => row.toJSON().components.length <= 5), view);
  }
  const r = await f.start();
  const p = screen(r, 'fight', {
    development: true
  });
  assert.ok(p.components.length <= 5);
  let payload;
  const handle = createHandler({
    getEconomy: () => f.economy,
    authorize: () => null,
    environment: () => 'development'
  });
  await handle({
    id: 'admin-route',
    guildId: 'g',
    user: {
      id: 'p'
    },
    memberPermissions: {
      has: () => true
    },
    isButton: () => false,
    options: {
      getSubcommand: () => 'admin'
    },
    deferReply: async () => {},
    editReply: async p => payload = p,
    reply: async p => payload = p
  });
  assert.equal(payload.embeds[0].toJSON().title, 'Winter testing controls');
  assert.ok(buttons(payload).some(b => b.custom_id.endsWith(':grant-ammo')));
});
test('fixed attack timers preserve fractional damage and accrual without speeding up Discord updates', async t => {
  const f = await fixture(t);
  await f.replace({
    gym: {
      strength: 1,
      accuracy: 0,
      dodge: 0,
      speed: 20
    }
  });
  await f.start();
  f.at(10000);
  const r = await f.run('battle-tick');
  assert.ok(Math.abs(r.battle.enemyHp - 73.94) < 1e-9);
  assert.equal(r.player.snow, 2000330);
  assert.equal(r.battle.nextPlayerAt,12000);
  assert.doesNotThrow(() => screen(r, 'fight'));
});
test('queued ammunition and scheduled combat survive database close and reopening without recharging queued actions', async t => {
  const {
      mkdtemp,
      rm
    } = require('node:fs/promises'),
    path = require('node:path'),
    {
      tmpdir
    } = require('node:os');
  const dir = await mkdtemp(path.join(tmpdir(), 'winter-iron-')),
    file = path.join(dir, 'test.sqlite');
  let db = new Sequelize({
    dialect: 'sqlite',
    storage: file,
    logging: false
  });
  t.after(async () => {
    await db.close();
    await rm(dir, {
      recursive: true,
      force: true
    });
  });
  let now = 0,
    id = 0;
  let e = createEconomy({
    sequelize: db,
    clock: () => now,
    random: () => 0,
    dropRandom: () => .99
  });
  const run = (action = 'status', quantity) => e.execute({
    guildId: 'g',
    userId: 'p',
    interactionId: 'disk-iron-' + ++id,
    action,
    quantity
  });
  await run();
  await db.query('UPDATE WinterPlayers SET snow=1000000,tier=2,diamonds=1');
  await db.query('UPDATE WinterProgress SET dummyHp=0');
  await db.query('UPDATE WinterShopProgress SET helped=1,snowmanOwned=1,snowmanHp=0');
  await db.query('UPDATE WinterKitchen SET spicyUnlocked=1,spicy=5');
  const bought = await run('buy-sturdy'),
    start = await run('battle-start', bought.battle.fightId);
  await run('battle-special', start.battle.fightId);
  await db.close();
  db = new Sequelize({
    dialect: 'sqlite',
    storage: file,
    logging: false
  });
  now = 6000;
  e = createEconomy({
    sequelize: db,
    clock: () => now,
    random: () => 0,
    dropRandom: () => .99
  });
  const r = await run();
  assert.equal(r.kitchen.spicy, 4);
  assert.equal(r.battle.enemyHp, 68);
  assert.equal(r.player.snow, 1000206);
  assert.equal(r.battle.throws, 2);
  assert.equal(r.battle.sweat, 0);
});
test('automatic worker receipts stay bounded while manual receipts remain replay-safe', async t => {
  const f = await fixture(t);
  await f.start();
  await f.replace({outfitOwned:1,playerHp:100});
  for (let i = 1; i <= 20; i++) {
    f.at(i * 3000);
    await f.run('battle-tick', undefined, {
      interactionId: 'winter-auto:test:' + i
    });
  }
  const rows = (await f.db.query('SELECT interactionId FROM WinterInteractions'))[0];
  assert.equal(rows.filter(r => r.interactionId.startsWith('winter-maintenance:')).length, 1);
  assert.ok(rows.some(r => r.interactionId === 'iron-1'));
  const before = await f.state();
  f.at(90000);
  const replay = await f.run('battle-tick', undefined, {
    interactionId: 'winter-auto:test:20'
  });
  assert.equal(replay.battle.throws, before.throws);
  assert.equal((await f.state()).throws, before.throws);
  const advanced = await f.run('battle-tick', undefined, {
    interactionId: 'winter-auto:test:21'
  });
  assert.equal(advanced.battle.throws, 30);
});
