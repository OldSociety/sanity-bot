const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');
const M = require('../services/winter/game/game');
const { createStore } = require('../services/winter/game/saved-progress');
const { screen } = require('../services/winter/game/screens');
const buttons = output => output.components.flatMap(r => r.components);

test('three real Rough practice throws precede the slow-progress dialogue and Kitchen recipe', () => {
  const s = M.fresh(); Object.assign(s, { liveRules: true, wooden: true, tier: 1, dummyHp: 0, roughOwned: true }); M.change(s, 'snow', 20, 'fixture');
  M.action(s, 'craft', 'max'); assert.equal(s.wallet.regular, 3);
  for (let n = 0; n < 3; n++) {
    const before = screen({ state: s, action: 'throw' }, 'u'); assert(!buttons(before).some(b => b.data.custom_id.includes(':kitchen:')));
    M.action(s, 'attack');
  }
  assert.equal(s.roughHp, 47); assert.equal(s.roughThrows, 3); assert.equal(s.wallet.regular, 0);
  const output = screen({ state: s, action: 'attack' }, 'u'); assert.match(output.embeds[0].data.description, /This is going to take forever/);
  assert.equal(output.embeds[0].data.title, 'Rough Snowman ⛄️'); assert(buttons(output).some(b => b.data.label === 'Kitchen 🌶️'));
  assert.throws(() => M.action(s, 'attack'), /Kitchen/);
  for (let n = 0; n < 3; n++) M.action(s, 'pepper'); M.action(s, 'mix');
  assert.throws(() => M.action(s, 'craft'), /Regular crafting/);
  assert(!screen({ state: s, action: 'throw' }, 'u').embeds[0].data.footer.text.includes('⚪'));
});

test('Sturdy waits for entry, has Shop in combat and conceals S2 until its unlock', () => {
  const s = M.fresh('chapter1'); Object.assign(s, { liveRules: true, tier: 1, chapter: 0, oldStone: false }); M.change(s, 'diamonds', 1, 'fixture'); M.change(s, 'snow', 10000, 'fixture');
  M.action(s, 'buy-sturdy', undefined, { shopCurrency: 'diamonds' }); assert.equal(s.active, false);
  let output = screen({ state: s, action: 'buy-sturdy' }, 'u'); assert.equal(output.embeds[0].data.title, 'New Opponent Unlocked!'); assert.deepEqual(buttons(output).map(b => b.data.label), ['Throw']);
  M.settle(s, 60000); assert.equal(s.tiers[1].attacks, 0);
  M.action(s, 'throw'); M.settle(s, 63000); assert.equal(s.tiers[1].attacks, 1);
  output = screen({ state: s, action: 'throw' }, 'u'); assert(buttons(output).some(b => b.data.label === 'Shop')); assert.equal(buttons(output).at(-1).data.label, 'Refresh');
  assert(!buttons(output).some(b => b.data.label === 'Fight S1'));
  assert(!buttons(output).some(b => b.data.label === 'Fight S2')); s.owned[2] = true; s.tiers[1].wins = 99;
  assert(!buttons(screen({ state: s, action: 'snowmen' }, 'u')).some(b => b.data.label === 'Fight S2'));
  s.tiers[1].wins = 100; assert(buttons(screen({ state: s, action: 'snowmen' }, 'u')).some(b => b.data.label === 'Fight S2'));
  assert(buttons(screen({ state: s, action: 'snowmen' }, 'u')).some(b => b.data.label === 'Fight S1'));
});

test('first S1 awards exactly five combat Sweat before Gym, without a second starter grant', () => {
  const s = M.fresh(); Object.assign(s, { liveRules: true, tutorialFlow: 2, wooden: true, tier: 1, roughOwned: true, roughHp: 0, dummyHp: 0, redRecipe: true });
  M.change(s, 'diamonds', 1, 'fixture'); M.change(s, 'red', 100, 'fixture'); M.change(s, 'snow', 10000, 'fixture');
  M.action(s, 'buy-sturdy', undefined, { shopCurrency: 'diamonds' }); M.action(s, 'equip-red'); M.action(s, 'throw'); M.settle(s, 120000);
  assert.equal(s.wallet.sweat, 5); assert.equal(s.ledger.sources['combat:sweat:gained'], 5); assert.equal(s.tiers[1].wins, 1); assert.equal(s.active, false);
  M.action(s, 'train'); assert.equal(s.wallet.sweat, 5); assert.equal(s.ledger.sources['gym-gift:sweat:gained'] || 0, 0);
  M.action(s, 'train-strength'); assert.equal(s.wallet.sweat, 3); M.action(s, 'train-strength'); assert.equal(s.wallet.sweat, 0);
});

async function stoneFixture(t, stopAt, options = {}) {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }); t.after(() => db.close());
  const store = createStore({ sequelize: db, clock: () => 0, seed: () => 3, ...options }); let sequence = 0;
  const run = (action, extra = {}) => store.execute({ id: `chapter-end-${++sequence}`, guildId: 'g', userId: 'u', action, ...extra });
  await run('diagnostic', { diagnostic: { mode: 'start', bookmark: 'chapter0', speed: 1, stopAt, reportMinutes: 0, channelId: 'c' } });
  const s = M.fresh('gym'); Object.assign(s, { liveRules: true, tutorialFlow: 2, tutorialStage: 'stone', stoneShopVisited: true, oldStone: false, tier: 1, chapter: 0 });
  delete s.milestones.stone; M.change(s, 'diamonds', 1, 'fixture');
  await db.query('UPDATE WinterPlaytestRuns SET state=$state,baseline=$state WHERE id=1', { bind: { state: JSON.stringify(s) } });
  return { db, store, run };
}

test('Stone shop has Exchange and its celebration waits for the chapter-end button before completing a diagnostic', async t => {
  const f = await stoneFixture(t, 'stone'); const shop = screen(await f.run('shop'), 'u');
  assert.deepEqual(buttons(shop).map(b => b.data.label), ['Old Skipping Stone · 1💎', '💎 Exchange', 'Refresh']);
  const bought = await f.run('buy-old-stone'); assert.equal(bought.run.status, 'active'); assert.equal(bought.state.chapter, 0); assert.equal(bought.state.tier, 2); assert.equal(bought.state.active, false);
  const output = screen(bought, 'u'); assert.equal(output.embeds[0].data.title, 'New Shovel Unlocked!'); assert.match(output.embeds[0].data.description, /Stone Shovel 🪏/); assert.match(output.embeds[0].data.thumbnail.url, /shop-badge/);
  assert.deepEqual(buttons(output).map(b => b.data.label), ['End of Chapter 0']); assert.equal(await f.store.claimReport(), null);
  assert.equal(screen(await f.run('status'), 'u').embeds[0].data.title, 'New Shovel Unlocked!');
  const done = await f.run('end-chapter0', { id: 'finish-once' }); assert.equal(done.run.status, 'completed'); assert.equal(done.state.chapter, 1); assert.equal(done.state.active, false);
  assert.deepEqual(await f.run('end-chapter0', { id: 'finish-once' }), done);
  assert.equal((await f.store.claimReport()).payload.status, 'completed'); assert.equal(await f.store.claimReport(), null);
});

test('chapter-end acknowledgement continues Chapter1 when the chosen endpoint is later', async t => {
  for (const stopAt of ['none', 'chapter1', 'iron']) {
    const f = await stoneFixture(t, stopAt); await f.run('buy-old-stone'); const done = await f.run('end-chapter0');
    assert.equal(done.run.status, 'active'); assert.equal(done.state.chapter, 1); assert.equal(done.state.chapter0Pending, false); assert.equal(done.state.active, true); assert.equal(await f.store.claimReport(), null);
  }
});

test('chapter-end failure rolls back its checkpoint and recap so the button can safely be retried', async t => {
  let fail = false; const f = await stoneFixture(t, 'stone', { beforeCommit: async ({ input }) => { if (fail && input.action === 'end-chapter0') throw Error('chapter-end-rollback'); } });
  await f.run('buy-old-stone'); fail = true; await assert.rejects(f.run('end-chapter0', { id: 'finish-retry' }), /chapter-end-rollback/);
  const [[row]] = await f.db.query('SELECT state,status FROM WinterPlaytestRuns'); assert.equal(row.status, 'active'); assert.equal(JSON.parse(row.state).chapter0Pending, true); assert.equal(await f.store.claimReport(), null);
  fail = false; assert.equal((await f.run('end-chapter0', { id: 'finish-retry' })).run.status, 'completed');
});
