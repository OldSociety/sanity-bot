const test = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');
const M = require('../services/winter/game/game');
const B = require('../services/winter/game/brown-snowballs');
const { IDS, DIRTY_RECIPE } = require('../services/winter/recipes');
const { screen } = require('../services/winter/game/screens');
const { createStore } = require('../services/winter/game/saved-progress');

function permutations(a) {
  if (!a.length) return [[]];
  return [...new Set(a)].flatMap(x => { const b=a.slice();b.splice(b.indexOf(x),1);return permutations(b).map(p=>[x,...p]); });
}
function conditions(a) {
  const e=a.indexOf('eggplant'),c=a.indexOf('cherry'),p=a.indexOf('pepper'),g=a.indexOf('garlic'),g2=a.lastIndexOf('garlic'),v=a.indexOf('avocado'),v2=a.lastIndexOf('avocado');
  return [e===0||e===6,v>c,p>v2,p>e,v2>g2,g<c,g2>v];
}
function stock(s,n=1) { const b=B.ensure(s);b.generated+=n;b.inventory+=n;return b; }

test('all seven clues are necessary and have exactly one solution using only existing Kitchen emojis', () => {
  assert.equal(B.recipe.length,7);assert(B.recipe.every(x=>IDS.includes(x)));assert.equal(IDS.length,5);
  const all=permutations(B.recipe);assert.equal(all.length,1260);
  const solutions=all.filter(a=>conditions(a).every(Boolean));assert.deepEqual(solutions,[B.recipe]);
  for(let i=0;i<7;i++) assert(all.filter(a=>conditions(a).every((ok,j)=>j===i||ok)).length>1,`Clue ${i+1} is redundant`);
  assert.deepEqual(B.recipe.filter(x=>x!=='cherry').filter((x,i,a)=>!(x==='avocado'&&a.indexOf(x)!==i)),DIRTY_RECIPE);
});

test('Brown accrual starts at Iron, preserves fractions, and never retroactively grants past supply', () => {
  const s=M.fresh('gym');M.settle(s,B.generationMs*2);assert.equal(s.brown,undefined);
  s.strength=25;s.ironMaterial=true;M.change(s,'snow',1000000,'fixture');M.action(s,'iron');
  const origin=s.now;M.settle(s,origin+B.generationMs-1);assert.equal(s.brown.inventory,0);
  M.settle(s,origin+B.generationMs);assert.equal(s.brown.inventory,1);assert.equal(s.brown.remainderMs,0);
  const a=M.fresh('s3',11),b=structuredClone(a);M.settle(a,B.generationMs*5+123);
  for(let i=1;i<=5;i++)M.settle(b,B.generationMs*i);M.settle(b,B.generationMs*5+123);
  assert.deepEqual(a,b);assert.equal(a.brown.inventory,5);assert.equal(a.brown.remainderMs,123);
});

test('Brown throws deal 1.5x regular damage, use no snow, and discover clues independently of hit rolls', () => {
  const s=M.fresh('s3',1);s.liveRules=true;const b=stock(s);b.rng=1;
  M.action(s,'equip-brown');M.action(s,'throw');const before=s.enemyHp;M.settle(s,3000);
  assert.equal(before-s.enemyHp,7.5);assert.equal(s.tiers[3].brown,1);assert.equal(b.pieces,1);assert.equal(b.spent,1);assert.equal(s.equipped,'regular');
  assert.equal(s.ledger.sources['regular-attack:snow:spent']||0,0);
  const miss=M.fresh('s3',12345);miss.liveRules=true;stock(miss).rng=1;M.action(miss,'equip-brown');M.action(miss,'throw');M.settle(miss,3000);
  assert.equal(miss.lastPlayerAttack.outcome,'miss');assert.equal(miss.brown.pieces,1);
});

test('discovery order is fixed, capped at seven, and rendering cannot reveal undiscovered messages', () => {
  const s=M.fresh('s3');s.liveRules=true;const b=stock(s,8),rng=s.rng;
  for(let i=1;i<=7;i++){b.rng=1;B.spend(s);assert.equal(b.pieces,i);const text=B.messages(s);assert(text.includes(B.clues[i-1]));if(i<7)assert(!text.includes(B.clues[i]));}
  B.spend(s);assert.equal(b.pieces,7);assert.equal(s.rng,rng);
  const banner=screen({state:s,action:'shop'},'u');assert(banner.embeds[0].data.fields.some(f=>f.name==='Hidden message'&&f.value.includes('/snow hidden')));
  const message=M.action(s,'hidden');assert.equal(b.read,7);assert.equal(message.match(/^\d\./gm).length,7);
  const out=screen({state:s,action:'hidden',message},'u');assert.equal(out.embeds[0].data.title,'Hidden messages');assert(!JSON.stringify(out).includes('🍆🧄🍒🥑🧄🥑🌶️'));
});

test('new seven-emoji recipe mixes correctly and legacy discoveries remain owned', () => {
  const s=M.fresh('s3');s.liveRules=true;
  for(const x of DIRTY_RECIPE)M.action(s,'ingredient',x);assert.match(M.action(s,'mix'),/did not unlock/);
  for(const x of B.recipe)M.action(s,'ingredient',x);assert.match(M.action(s,'mix'),/discovered/);assert.equal(s.dirtyRecipeVersion,2);
  assert(screen({state:s,action:'kitchen'},'u').embeds[0].data.fields.find(f=>f.name==='Recipes').value.includes('🍆🧄🍒🥑🧄🥑🌶️'));
  const old=M.fresh('s3');old.dirtyRecipeUnlocked=true;
  assert(screen({state:old,action:'kitchen'},'u').embeds[0].data.fields.find(f=>f.name==='Recipes').value.includes('🍆🧄🥑🧄🌶️'));
  for(const x of DIRTY_RECIPE)M.action(old,'ingredient',x);assert.match(M.action(old,'mix'),/already know/);
});

test('SQLite 5x settlement, duplicate requests and reconnect preserve supply and discovered messages', async t => {
  const db=new Sequelize({dialect:'sqlite',storage:':memory:',logging:false});t.after(()=>db.close());let now=0;
  const options={sequelize:db,clock:()=>now,seed:()=>1};let store=createStore(options);
  await store.execute({id:'start',guildId:'g',userId:'u',action:'diagnostic',diagnostic:{mode:'start',speed:5,bookmark:'s3',stopAt:'none',reportMinutes:0,channelId:'c'}});
  now=B.generationMs/5;const status=await store.execute({id:'time',guildId:'g',userId:'u',action:'status'});assert.equal(status.state.brown.inventory,1);
  const [[row]]=await db.query('SELECT state FROM WinterPlaytestRuns WHERE id=1');const s=JSON.parse(row.state);s.brown.rng=1;
  await db.query('UPDATE WinterPlaytestRuns SET state=$s WHERE id=1',{bind:{s:JSON.stringify(s)}});
  await store.execute({id:'equip',guildId:'g',userId:'u',action:'equip-brown'});await store.execute({id:'fight',guildId:'g',userId:'u',action:'throw'});
  now+=600;const q={id:'attack',guildId:'g',userId:'u',action:'status'};const first=await store.execute(q),again=await store.execute(q);
  assert.equal(first.state.brown.pieces,1);assert.deepEqual(first.state.brown,again.state.brown);
  store=createStore(options);const read=await store.execute({id:'hidden',guildId:'g',userId:'u',action:'hidden'});
  assert.equal(read.state.brown.read,1);assert(read.message.includes(B.clues[0]));assert(!read.message.includes(B.clues[1]));
});
