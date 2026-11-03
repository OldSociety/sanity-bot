const test = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');
const M = require('../services/winter/game/game');
const { screen } = require('../services/winter/game/screens');
const { createStore } = require('../services/winter/game/saved-progress');
const { gymLine } = require('../services/winter/game/dialogue');
const buttons = out => out.components.flatMap(r => r.components);

test('Idol costs 5000 Buttons once, reveals the Shop trade, and does not grant early Golden production', () => {
  const s = M.fresh('s3', 1); s.liveRules = true; s.fireFlowerOwned = s.reinforcedJacketOwned = s.soupKitchenOwned = true;
  M.change(s, 'buttons', 4999, 'fixture');
  assert.throws(() => M.action(s, 'buy-golden-shovel'), /unavailable/);
  assert.throws(() => M.action(s, 'buy-golden-idol'), /buttons/);
  M.change(s, 'buttons', 1, 'fixture');
  const message = M.action(s, 'buy-golden-idol');
  assert.equal(message, "I didn't even realize that was there. I wonder what its for?");
  assert.equal(s.tier, 3); assert.equal(s.wallet.buttons, 0); assert.equal(M.rate(s), 216);
  assert.equal(s.ledger.sources['golden-idol:buttons:spent'], 5000);
  assert.throws(() => M.action(s, 'buy-golden-idol'), /already owned/);
  const shop = screen({state:s,action:'shop'}, 'u');
  assert(buttons(shop).some(b => b.data.custom_id.includes(':buy-golden-shovel:')));
  assert(!buttons(screen({state:s,action:'emporium'}, 'u')).some(b => b.data.custom_id.includes(':buy-golden-idol:')));
  M.settle(s, 10000); assert.equal(s.wallet.snow, 2160);
  const before = structuredClone(s.wallet); M.action(s, 'buy-golden-shovel');
  assert.equal(s.tier, 4); assert.equal(s.goldenIdolOwned, false); assert.deepEqual(s.wallet, before);
  M.settle(s, 20000); assert.equal(s.wallet.snow, 15120);
  assert.throws(() => M.action(s, 'buy-golden-shovel'), /already owned/);
});

test('Reinforced coat purchase shows Azule speech and changes maximum HP without healing', () => {
  const s = M.fresh('s3', 1); s.liveRules = true; s.fireFlowerOwned = true; s.playerHp = 40;
  M.change(s, 'buttons', 200, 'fixture'); const message = M.action(s, 'buy-reinforced-jacket');
  const out = screen({state:s,action:'buy-reinforced-jacket',message},'u');
  assert.match(out.embeds[0].data.description, /Congratulations, now you won't take as many hits\. Just watch the face\. 100 HP -> 150 HP/);
  assert.match(out.embeds[0].data.thumbnail.url, /winter-emporium-badge/i);
  assert.equal(M.maxHp(s), 150); assert.equal(s.playerHp, 40);
});

test('Gym visits rotate dialogue without combat RNG draws; locked training topics stay hidden', () => {
  const s = M.fresh('gym', 42); s.liveRules = true; const rng = s.rng, lines = new Set();
  for(let n=0;n<11;n++) { M.action(s, 'gym'); lines.add(gymLine(s)); }
  assert.equal(lines.size, 11); assert.doesNotMatch([...lines].join(' '), /Accuracy|Endurance/);
  assert.equal(s.rng, rng);
  const visits = s.gymVisits; screen({state:s,action:'train'},'u'); screen({state:s,action:'train'},'u'); assert.equal(s.gymVisits, visits);
  s.strength = 25; const unlocked = new Set();
  for(let n=0;n<13;n++) { M.action(s, 'gym'); unlocked.add(gymLine(s)); }
  assert.match([...unlocked].join(' '), /Accuracy is all about/); assert.doesNotMatch([...unlocked].join(' '), /Endurance/);
});

test('hidden clue requires Iron and all unavailable locations use Stop with Kylax', () => {
  const early = M.fresh('chapter0'); early.liveRules = true;
  assert.throws(() => M.action(early, 'hidden'), /Iron Shovel/);
  for(const action of ['hidden','slots','shop','diamonds','gym','kitchen','emporium']) {
    const out = screen({state:early,action},'u');
    assert.equal(out.embeds[0].data.title, 'Stop!'); assert.match(out.embeds[0].data.thumbnail.url, /winter-kitchen-badge/);
  }
  const iron = M.fresh('s3'); iron.liveRules = true; const before=structuredClone(iron);
  const message = M.action(iron,'hidden'); assert.equal(message, 'No hidden messages have been found yet.'); assert.deepEqual(iron,before);
  assert.equal(screen({state:iron,action:'hidden',message},'u').embeds[0].data.description,message);
});

test('previous saves and existing Golden owners retain balances and equipment on compatibility upgrade', () => {
  for(const tier of [3,4]) {
    const s=M.fresh('s3');s.tier=tier;s.fingerprint='35b555e4291edbb5a576645172afb3c4983e15c7811236d9e700073aa9793301';
    const before=structuredClone(s);M.upgradeOpeningBalance(s);
    const {fingerprint,balanceUpgrades,...after}=s;const {fingerprint:old,...original}=before;
    assert.deepEqual(after,original);assert.equal(balanceUpgrades.at(-1).id,'golden-idol-2026-11-03');
  }
});

test('Idol purchase and Gym visits are receipt-deduped in SQLite', async t => {
  const db = new Sequelize({dialect:'sqlite',storage:':memory:',logging:false});t.after(()=>db.close());
  const store=createStore({sequelize:db,clock:()=>0,seed:()=>1});
  await store.execute({id:'start',guildId:'g',userId:'u',action:'diagnostic',diagnostic:{mode:'start',speed:1,bookmark:'s3',stopAt:'none',reportMinutes:0,channelId:'c'}});
  const [[row]]=await db.query('SELECT state FROM WinterPlaytestRuns WHERE id=1');const s=JSON.parse(row.state);
  s.fireFlowerOwned=s.reinforcedJacketOwned=s.soupKitchenOwned=true;M.change(s,'buttons',5000,'fixture');
  await db.query('UPDATE WinterPlaytestRuns SET state=$state WHERE id=1',{bind:{state:JSON.stringify(s)}});
  const request={id:'idol',guildId:'g',userId:'u',action:'buy-golden-idol'};
  const first=await store.execute(request),second=await store.execute(request);
  assert.equal(first.state.wallet.buttons,0);assert.equal(second.state.wallet.buttons,0);assert.equal(second.state.goldenIdolOwned,true);
  const gym={...request,id:'gym',action:'gym'};const visit=await store.execute(gym),replay=await store.execute(gym);
  assert.equal(visit.state.gymVisits,1);assert.equal(replay.state.gymVisits,1);
});
