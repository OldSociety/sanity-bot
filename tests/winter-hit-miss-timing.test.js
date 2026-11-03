const test = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');
const M = require('../services/winter/playtest-model');
const { createControls } = require('../services/winter/playtest-controls');
const { createRuntime } = require('../services/winter/playtest-runtime');
const { createStore } = require('../services/winter/playtest-store');
const { screen } = require('../services/winter/playtest-presentation');

test('Discord edit latency cannot push the next live update into a second three-second slot', () => {
  let now = 0;
  const controls = createControls({ clock: () => now });
  const i = { guildId: 'g', user: { id: 'u' } }, ids = new Set(['snow:u:pt:normal:throw:1:token']);
  controls.remember(i, { id: 'm' }, ids, { fight: true });
  now = 3000; const entry = controls.live()[0]; assert(entry);
  controls.capturing(entry);
  now = 3150; controls.updated(entry, ids, true);
  now = 6000; assert.deepEqual(controls.live(), [entry]);
  // Queue jitter also retains the scheduled slot instead of accumulating drift.
  now = 6200; controls.capturing(entry); now = 6400; controls.updated(entry,ids,true);
  now = 9000; assert.deepEqual(controls.live(), [entry]);
  controls.capturing(entry); assert.equal(controls.live().length,0);
});

test('live runtime renders all three player attack slots despite 100ms delivery latency', async t => {
  const db = new Sequelize({dialect:'sqlite',storage:':memory:',logging:false});
  let now=0, output, edits=0;
  const store = createStore({sequelize:db,clock:()=>now,seed:()=>12345});
  const started = await store.execute({guildId:'g',userId:'u',id:'start',action:'diagnostic',diagnostic:{mode:'start',bookmark:'gym',speed:1,stopAt:'none',reportMinutes:0,channelId:'c'}});
  M.change(started.state,'snow',100000,'fixture'); M.action(started.state,'throw');
  await db.query('UPDATE WinterPlaytestRuns SET state=$state WHERE id=1',{bind:{state:JSON.stringify(started.state)}});
  const controls = createControls({clock:()=>now});
  const runtime = createRuntime({store,controls});
  t.after(async()=>{await runtime.stop();await db.close();});
  await runtime.handle({id:'open',guildId:'g',user:{id:'u'},options:{getSubcommand:()=> 'throw',data:[]},isButton:()=>false,
    deferReply:async()=>{},editReply:async p=>{output=p;edits++;now+=100;return{id:'m'};}});
  await runtime.start({isReady:()=>true,once:()=>{},channels:{fetch:async()=>{throw Error('No report expected');}}});
  for(const at of [3100,6100,9100]) {now=at;await runtime.pulse();}
  const [[saved]] = await db.query('SELECT state FROM WinterPlaytestRuns WHERE id=1');
  const s=JSON.parse(saved.state);
  assert.equal(s.tiers[1].attacks,3); assert.equal(edits,4);
  assert.match(output.embeds[0].data.description,/You: \*\*(Hit|Miss)\*\*.*0\.1s ago/);
});

test('a hit followed by a miss between updates explicitly reports both, with latest-tag age', async t => {
  const db = new Sequelize({dialect:'sqlite',storage:':memory:',logging:false});t.after(()=>db.close());
  let now=0;
  const store = createStore({sequelize:db,clock:()=>now,seed:()=>1});
  await store.execute({guildId:'g',userId:'u',id:'create',action:'status'});
  const s=M.fresh('gym',1);s.liveRules=true;M.change(s,'snow',10000,'fixture');M.action(s,'throw');
  // Seed 1's first two rolls both hit; locate a reproducible hit/miss pair.
  let pair;
  for(let seed=1;seed<100;seed++) {
    const trial=structuredClone(s);trial.rng=seed;M.settle(trial,6000);
    if(trial.tiers[1].hits===1&&trial.lastPlayerAttack.outcome==='miss'){s.rng=seed;pair=seed;break;}
  }
  assert(pair);s.profileAnchor=0;
  await db.query('UPDATE WinterPlaytestProfiles SET state=$state',{bind:{state:JSON.stringify(s)}});
  now=6500;const result=await store.execute({guildId:'g',userId:'u',id:'late-update',action:'throw'});
  assert.equal(result.combatUpdate.attacks,2);assert.equal(result.combatUpdate.hits,1);
  assert(result.state.enemyHp<64);
  const out=screen(result,'u');assert.match(out.embeds[0].data.description,/You: \*\*Miss\*\*.*0\.5s ago/);
  assert.match(out.embeds[0].data.fields.find(f=>f.name==='Attacks since last update').value,/You: 1 hit\(s\), 1 miss\(es\)/);
  const rng=result.state.rng;screen(result,'u');assert.equal(result.state.rng,rng);
});
