const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');
const M = require('../services/winter/game/game');
const { createStore } = require('../services/winter/game/saved-progress');
const { createRuntime } = require('../services/winter/game/interactions');
const { createControls } = require('../services/winter/game/buttons');
const { screen } = require('../services/winter/game/screens');
const tutorial = require('../services/winter/game/tutorial');
const labels = out => out.components.flatMap(r => r.components).map(b => b.data.label);

function state(stage) {
  const s = M.fresh('chapter0', 3); Object.assign(s, { liveRules: true, tutorialFlow: 2, uiWelcomed: true });
  M.change(s, 'snow', 100000, 'fixture');
  if (stage === 'dummy') return s;
  s.dummyHp = 0; if (stage === 'broken-dummy') return s;
  s.wooden = true; s.tier = 1;
  if (stage === 'wooden-gift') { s.woodenGiftPending = true; return s; }
  if (stage === 'first-diamond') return s;
  s.diamondGift = true; M.change(s, 'diamonds', 100, 'fixture');
  if (stage === 'diamond-gift') { s.diamondGiftPending = true; return s; }
  if (stage === 'rough-shop') return s;
  s.roughOwned = true;
  if (stage === 'rough-introduction') { s.roughIntroPending = true; return s; }
  if (stage === 'rough-practice') { s.roughThrows = 1; s.roughHp = 49; M.change(s, 'regular', 2, 'fixture'); return s; }
  s.roughThrows = 3; s.roughHp = 47;
  if (stage === 'rough-slow') return s;
  if (stage === 'first-recipe') { s.kitchenVisited = true; M.change(s, 'peppers', 2, 'fixture'); return s; }
  s.redRecipe = true;
  if (stage === 'spicy-unlock') { s.spicyUnlockPending = true; return s; }
  if (stage === 'spicy-gift') return s;
  s.spicyShopGiftClaimed = true; M.change(s, 'red', 10, 'fixture');
  if (stage === 'rough-spicy') return s;
  s.roughHp = 0;
  if (stage === 'sturdy-shop') return s;
  s.owned[1] = true;
  if (stage === 'sturdy-introduction') return s;
  s.idleStarted = true;
  if (stage === 'first-s1') { s.active = true; return s; }
  s.tiers[1].wins = 1; s.gymUnlocked = true; s.gymStarterFromVictory = true; s.tutorialStage = 'gym'; M.change(s, 'sweat', 5, 'fixture');
  if (stage === 'gym-invitation') return s;
  M.action(s, 'train');
  if (stage === 'gym-lessons') return s;
  M.action(s, 'train-strength'); M.action(s, 'train-strength');
  if (stage === 'gym-complete') return s;
  s.stoneShopVisited = true;
  if (stage === 'stone-shop') return s;
  Object.assign(s, { oldStone: true, tier: 2, chapter0Pending: true, tutorialStage: 'chapter0-end' });
  return s;
}

async function fixture(t) {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }); t.after(() => db.close());
  let now = 0, sequence = 0;
  const store = createStore({ sequelize: db, clock: () => now, seed: () => 3 });
  const run = (action, extra = {}) => store.execute({ id: `guard-${++sequence}`, guildId: 'g', userId: 'u', action, ...extra });
  await run('diagnostic', { diagnostic: { mode: 'start', speed: 1, bookmark: 'chapter0', stopAt: 'none', reportMinutes: 0, channelId: 'c' } });
  const install = s => db.query('UPDATE WinterPlaytestRuns SET state=$state,baseline=$state WHERE id=1', { bind: { state: JSON.stringify(s) } });
  return { db, store, run, install, at: value => { now = value; }, clock: () => now };
}

test('every required Chapter0 step survives unrelated navigation and reconstructs its controls from SQLite', async t => {
  const f = await fixture(t);
  const cases = [
    ['dummy', 'Training Dummy', 'Throw · 1 ⚪️'], ['broken-dummy', 'Oh No!', 'Requia’s Winter Shop'],
    ['wooden-gift', 'Congratulations!', 'Back to Shop'], ['first-diamond', '💎 Exchange', 'Beg'], ['diamond-gift', '💎 Exchange', 'Back to Shop'],
    ['rough-shop', 'Requia’s Winter Shop', 'Rough ⛄️ · 1💎'], ['rough-introduction', 'Rough Snowman purchased! ⛄️', 'Throw'],
    ['rough-practice', 'Rough Snowman ⛄️', 'Throw · 1 ⚪️'], ['rough-slow', 'Rough Snowman ⛄️', 'Kitchen 🌶️'], ['first-recipe', 'Kylax’s Kitchen 🌶️', '🌶️'],
    ['spicy-unlock', 'New Snowball Unlocked!', 'Back to Shop'], ['spicy-gift', 'New Snowball Unlocked!', 'Back to Shop'],
    ['rough-spicy', 'Rough Snowman ⛄️', 'Throw · 1 🔴'], ['sturdy-shop', 'Not again!', 'Shop'], ['sturdy-introduction', 'New Opponent Unlocked!', 'Throw'],
    ['first-s1', 'Sturdy Snowman', 'Shop'], ['gym-invitation', 'Your first victory!', 'Gym'], ['gym-lessons', 'Hendrix’s Gym 💪🏽', 'Strength · 2💦'],
    ['gym-complete', 'Hendrix’s Gym 💪🏽', 'Shop'], ['stone-shop', 'Requia’s Winter Shop', '💎 Exchange'], ['stone-celebration', 'New Shovel Unlocked!', 'End of Chapter 0']
  ];
  for (const [id, title, next] of cases) for (const action of ['status', 'help', 'hidden', 'slots', 'emporium']) {
    const s = state(id); assert.equal(tutorial.step(s).id, id); await f.install(s);
    // A new store instance cannot rely on an old Discord message or collector.
    const reopened = createStore({ sequelize: f.db, clock: () => 0 });
    const receipt = await reopened.execute({ id: `${id}-${action}`, guildId: 'g', userId: 'u', action });
    if (require('../services/winter/game/dialogue').unavailable(s, action)) {
      const output = screen(receipt, 'u'); assert.equal(output.embeds[0].data.title, 'Stop!');
      assert.match(output.embeds[0].data.thumbnail.url, /winter-kitchen-badge/);
      assert.equal(receipt.state.tutorialCheckpoint, id); assert.deepEqual(receipt.state.wallet, s.wallet); assert.equal(receipt.state.rng, s.rng);
      continue;
    }
    const output = screen(receipt, 'u'); assert.equal(output.embeds[0].data.title, title, `${id}/${action}`);
    assert(labels(output).includes(next), `${id}/${action} has no next-step control`);
    assert.equal(receipt.state.tutorialCheckpoint, id); assert.deepEqual(receipt.state.wallet, s.wallet); assert.equal(receipt.state.rng, s.rng);
    assert.equal(receipt.action, action, 'the requested interaction remains in the audit'); assert.equal(receipt.redirected, true);
  }
});

test('offline first S1 victory takes priority over any shop or other navigation without duplicate Sweat', async t => {
  const f = await fixture(t);
  for (const action of ['shop', 'diamonds', 'kitchen', 'hidden', 'status']) {
    const s = state('first-s1'); s.enemyHp = 1; await f.install(s); f.at(60000);
    const receipt = await f.run(action), output = screen(receipt, 'u');
    assert.equal(receipt.state.tiers[1].wins, 1); assert.equal(receipt.state.wallet.sweat, 5); assert.equal(receipt.state.active, false);
    assert.equal(receipt.state.tutorialCheckpoint, 'gym-invitation');
    if (action === 'hidden') assert.equal(output.embeds[0].data.title, 'Stop!');
    else assert.deepEqual(labels(output), ['Gym']);
    const repeated = await f.run('status'); assert.equal(repeated.state.wallet.sweat, 5); assert.equal(repeated.state.tiers[1].wins, 1);
  }
});

test('guarded mutation cannot spend resources; the next required button still completes the step exactly once', async t => {
  const f = await fixture(t), s = state('spicy-unlock'); await f.install(s);
  const blocked = await f.run('buy-spicy', { quantity: '10', kind: 'button' });
  assert.equal(blocked.outcome, 'rejected'); assert.deepEqual(blocked.state.wallet, s.wallet); assert.equal(screen(blocked, 'u').embeds[0].data.title, 'New Snowball Unlocked!');
  const shop = await f.run('shop', { id: 'required-shop' }); assert.equal(shop.state.wallet.red, 10); assert.equal(shop.state.spicyShopGiftClaimed, true);
  assert.deepEqual(await f.run('shop', { id: 'required-shop' }), shop); assert.equal((await f.run('status')).state.wallet.red, 10);
});

test('restocking stays reachable while S1 is alive, and a redirected fight does not refresh defeat accuracy', async t => {
  const f = await fixture(t), s = state('first-s1'); s.penalized = true; await f.install(s);
  const status = await f.run('status'); assert.equal(status.displayAction, 'throw'); assert.equal(status.state.penalized, true);
  assert.equal((await f.run('shop')).redirected, false); assert.equal((await f.run('diamonds')).redirected, false);
  const stocked = await f.run('buy-spicy', { quantity: '1' }); assert.equal(stocked.outcome, 'ok'); assert.equal(stocked.state.wallet.diamonds, 100); assert.equal(stocked.state.wallet.snow, s.wallet.snow - 1000);
  assert.equal((await f.run('throw')).state.penalized, false, 'only an actual Throw command refreshes accuracy');
});

test('Chapter0 guardrails keep admin/diagnostic controls accessible and release ordinary pages after completion', async t => {
  const f = await fixture(t); await f.install(state('gym-invitation'));
  const admin = await f.run('admin', { admin: true }); assert.equal(admin.outcome, 'ok'); assert.equal(admin.redirected, false);
  const stopped = await f.run('diagnostic', { diagnostic: { mode: 'stop' } }); assert.equal(stopped.run.status, 'stopped'); assert.equal((await f.store.claimReport()).payload.status, 'stopped');
  const next = await f.run('diagnostic', { diagnostic: { mode: 'start', speed: 1, bookmark: 'chapter1', stopAt: 'none', reportMinutes: 0, channelId: 'c' } });
  assert.equal(next.state.chapter, 1); const kitchen = await f.run('kitchen'); assert.equal(kitchen.redirected, false); assert.equal(screen(kitchen, 'u').embeds[0].data.title, 'Kylax’s Kitchen 🌶️');
});

test('a redirected live fight keeps display updates, while unavailable commands stop before Welcome', async t => {
  const f = await fixture(t); await f.install(state('first-s1'));
  const controls = createControls({ clock: f.clock }); const runtime = createRuntime({ store: f.store, controls, isAdmin: () => false });
  let output;
  await runtime.handle({ id: 'redirected-live-screen', guildId: 'g', channelId: 'c', user: { id: 'u' }, isButton: () => false,
    options: { getSubcommand: () => 'status', data: [] }, deferReply: async () => {}, deleteReply: async () => {}, editReply: async p => { output = p; return { id: 'resume' }; } });
  await runtime.stop(); assert.equal(output.embeds[0].data.title, 'Sturdy Snowman'); f.at(3000); assert.equal(controls.live().length, 1);
  const fresh = M.fresh(); Object.assign(fresh, { liveRules: true, tutorialFlow: 2 }); f.at(0); await f.install(fresh);
  let receipt = await f.run('kitchen'); assert.equal(screen(receipt, 'u').embeds[0].data.title, 'Stop!'); assert.equal(receipt.state.uiWelcomed, undefined);
  receipt = await f.run('shop'); assert.equal(screen(receipt, 'u').embeds[0].data.title, 'Stop!');
  receipt = await f.run('status'); assert.equal(screen(receipt, 'u').embeds[0].data.title, 'Welcome to Winter Wars ❄️'); assert.equal(receipt.state.uiWelcomed, true);
});
