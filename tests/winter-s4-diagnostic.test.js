const test = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');
const M = require('../services/winter/playtest-model');
const { createStore } = require('../services/winter/playtest-store');
const { screen } = require('../services/winter/playtest-presentation');

test('S4 costs 8,000 diamonds after 100 S3 wins, and only fireballs damage it', () => {
  const s = M.fresh('s3', 1); s.liveRules = true; const act = (name,q) => M.action(s,name,q,{shopCurrency:'diamonds'});
  M.change(s, 'diamonds', 8000, 'fixture'); s.tiers[3].wins = 99;
  assert.throws(() => act('buy-s4'), /100 S3/); assert.equal(s.wallet.diamonds, 8000);
  s.tiers[3].wins = 100; act('buy-s4'); assert.equal(s.wallet.diamonds, 0); assert(s.owned[4]);
  assert.throws(() => act('buy-s4'), /already/); act('select-s4');
  assert.deepEqual(M.enemy(s), { hp: 550, damage: 14, sweat: 4 });
  M.change(s, 'snow', 10000, 'fixture'); s.rng = 1; M.settle(s, 3000);
  assert.equal(s.enemyHp, 550); assert.equal(s.lastPlayerAttack.immune, true);
  s.iceRecipe = true; M.change(s, 'ice', 1, 'fixture'); act('equip-ice'); s.rng = 1; M.settle(s, 6000);
  assert.equal(s.enemyHp, 550); assert.equal(s.lastPlayerAttack.immune, true);
  M.change(s, 'red', 1, 'fixture'); act('equip-red'); s.rng = 1; M.settle(s, 9000);
  assert.equal(s.enemyHp, 550); assert.equal(s.lastPlayerAttack.immune, true);
  M.change(s, 'red', 5, 'fixture'); s.fireFlowerOwned = true; act('equip-red'); s.rng = 1; M.settle(s, 12000);
  assert.equal(s.enemyHp, 500); assert.equal(s.lastPlayerAttack.damage, 50); assert.equal(s.wallet.red, 0);
  assert.equal(s.tiers[4].attacks, 4); M.validate(s);
  const out = screen({state:s,action:'throw',run:null},'u'); assert.equal(out.embeds[0].data.title, 'Snowman 4');
  assert(out.components.flatMap(r => r.components).some(b => b.data.custom_id.includes(':select-s4:')));
});

test('existing S3 runs can buy and record S4 without changing their baseline', async t => {
  const db = new Sequelize({dialect:'sqlite',storage:':memory:',logging:false}); t.after(() => db.close());
  let n=0; const store=createStore({sequelize:db,clock:()=>0,seed:()=>1});
  const run=(action,extra={})=>store.execute({id:`s4-${++n}`,guildId:'g',userId:'u',action,...extra});
  await run('diagnostic',{diagnostic:{mode:'start',speed:1,bookmark:'s3',stopAt:'none',reportMinutes:0,channelId:'c'}});
  const [[row]]=await db.query('SELECT state FROM WinterPlaytestRuns WHERE id=1'); const s=JSON.parse(row.state);
  s.tiers[3].wins=100; M.change(s,'diamonds',8000,'fixture');
  await db.query('UPDATE WinterPlaytestRuns SET state=$state WHERE id=1',{bind:{state:JSON.stringify(s)}});
  const bought=await run('buy-s4'); assert.equal(bought.outcome,'ok'); assert.equal(bought.run.tierChanges[4].wins,0);
  const fight=await run('select-s4'); assert.equal(fight.state.target,4); assert.equal(fight.run.status,'active');
  const stopped=await run('diagnostic',{diagnostic:{mode:'stop'}}); assert.equal(stopped.run.status,'stopped');
});
