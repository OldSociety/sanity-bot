const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');
const M = require('../services/winter/game/game');
const { createStore } = require('../services/winter/game/saved-progress');
const { createRuntime } = require('../services/winter/game/interactions');
const { createControls } = require('../services/winter/game/buttons');
const { screen } = require('../services/winter/game/screens');

async function fixture(t, tutorial = false) {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
  let now = 0, sequence = 0, output; const edits = [];
  const store = createStore({ sequelize: db, clock: () => now, seed: () => 314159 });
  const start = await store.execute({ guildId: 'g', userId: 'u', id: 'start', action: 'diagnostic', diagnostic: { mode: 'start', bookmark: tutorial ? 'chapter0' : 'gym', speed: 1, stopAt: 'none', reportMinutes: 0, channelId: 'c' } });
  const s = start.state;
  if (tutorial) Object.assign(s, { wooden: true, tier: 1, roughOwned: true, roughHp: 0, redRecipe: true, dummyHp: 0, spicyShopGiftClaimed: true });
  M.change(s, 'snow', 10000, 'fixture'); M.change(s, 'red', 100, 'fixture');
  if (tutorial) { M.change(s, 'diamonds', 1, 'fixture'); M.action(s, 'buy-sturdy', undefined, { shopCurrency: 'diamonds' }); }
  M.action(s, 'equip-red'); M.action(s, 'throw');
  await db.query('UPDATE WinterPlaytestRuns SET state=$state WHERE id=1', { bind: { state: JSON.stringify(s) } });
  const controls = createControls({ clock: () => now });
  const runtime = createRuntime({ store, controls, isAdmin: () => true }); t.after(async () => { await runtime.stop(); await db.close(); });
  const client = { isReady: () => true, once: () => {}, channels: { fetch: async () => { throw Error('No report expected'); } } };
  async function invoke(action, customId) {
    await runtime.handle({ id: `live-screen-${++sequence}`, guildId: 'g', channelId: 'c', user: { id: 'u' }, customId, message: { id: 'fight' },
      options: { getSubcommand: () => action, data: [] }, isButton: () => Boolean(customId), deferReply: async () => {}, deferUpdate: async () => {}, deleteReply: async () => {},
      editReply: async p => { output = p; edits.push(p); return { id: 'fight' }; } });
    await runtime.pulse();
    return output;
  }
  const saved = async () => JSON.parse((await db.query('SELECT state FROM WinterPlaytestRuns WHERE id=1'))[0][0].state);
  return { db, store, runtime, controls, client, invoke, saved, edits, output: () => output, at: n => { now = n; } };
}

test('open fight updates health and attack timers without clicks; five-minute expiry preserves offline progression', async t => {
  const f = await fixture(t); await f.invoke('throw'); await f.runtime.start(f.client);
  const initial = f.output().embeds[0].data.description;
  const originalButton = f.output().components.flatMap(r => r.components).find(b => b.data.label === 'Refresh').data.custom_id;
  for (const time of [3000, 6000, 9000]) { f.at(time); await f.runtime.pulse(); }
  assert.equal((await f.saved()).tiers[1].attacks, 3); assert.notEqual(f.output().embeds[0].data.description, initial);
  assert(f.output().embeds[0].data.fields.some(v => v.name === 'Next attacks'));
  assert.equal(f.output().components.flatMap(r => r.components).at(-1).data.label, 'Refresh');
  assert.equal(f.output().components.flatMap(r => r.components).at(-1).data.custom_id, originalButton, 'system updates preserve the displayed control token');
  const penalized = await f.saved(); penalized.penalized = true;
  await f.db.query('UPDATE WinterPlaytestRuns SET state=$state WHERE id=1', { bind: { state: JSON.stringify(penalized) } });
  f.at(12000); await f.runtime.pulse(); assert.equal((await f.saved()).penalized, true, 'automatic display updates do not refresh combat accuracy');
  f.at(300000); await f.runtime.pulse(); assert.match(f.output().content, /fight continues even when you're offline/); assert.deepEqual(f.output().components, []);
  const count = f.edits.length; f.at(360000); await f.runtime.pulse(); assert.equal(f.edits.length, count);
  await f.invoke('throw'); assert((await f.saved()).tiers[1].attacks > 3, 'expiry did not stop offline combat');
});

test('leaving the fight removes it from live updates; no abandoned-player captures are scheduled', async t => {
  const f = await fixture(t); await f.invoke('throw'); await f.runtime.start(f.client);
  await f.invoke('shop'); const count = f.edits.length;
  f.at(30000); await f.runtime.pulse(); assert.equal(f.edits.length, count);
  const [[row]] = await f.db.query("SELECT COUNT(*) n FROM WinterPlaytestInteractions WHERE id LIKE 'winter-live:%'"); assert.equal(row.n, 0);
});

test('simultaneous live capture and location change serialize and leave the Shop as the current screen', async t => {
  const f = await fixture(t); await f.invoke('throw'); await f.runtime.start(f.client); f.at(3000);
  await Promise.all([f.runtime.pulse(), f.invoke('shop')]);
  assert.equal(f.output().embeds[0].data.title, 'Requia’s Winter Shop'); const count = f.edits.length;
  f.at(6000); await f.runtime.pulse(); assert.equal(f.edits.length, count);
  assert((await f.saved()).tiers[1].attacks <= 1, 'the same interval cannot be rewarded twice');
});

test('a player interaction renews the five-minute window while automatic updates do not', async t => {
  const f = await fixture(t); await f.invoke('throw'); await f.runtime.start(f.client);
  f.at(240000); const refresh = f.output().components.flatMap(r => r.components).find(b => b.data.label === 'Refresh').data.custom_id;
  await f.invoke(null, refresh);
  f.at(300000); await f.runtime.pulse(); assert(!f.output().content.includes('offline'));
  f.at(540000); await f.runtime.pulse(); assert.match(f.output().content, /fight continues even when you're offline/);
});

test('frozen pre-update diagnostic checkpoints are not normalized or rewritten by later status requests', async t => {
  const f = await fixture(t);
  await f.store.execute({ id: 'freeze', guildId: 'g', userId: 'u', action: 'diagnostic', diagnostic: { mode: 'stop' } });
  const legacy = await f.saved(); delete legacy.liveRules; delete legacy.tutorialFlow;
  Object.assign(legacy, { oldStone: false, chapter: 0, tier: 1, gymEntered: true, strength: 3 });
  await f.db.query('UPDATE WinterPlaytestRuns SET state=$state WHERE id=1', { bind: { state: JSON.stringify(legacy) } });
  await f.invoke('status'); assert.deepEqual(await f.saved(), legacy);
});

test('first S1 win automatically replaces the live fight with only Gym and no prior Sweat accumulation', async t => {
  const f = await fixture(t, true); await f.invoke('throw'); assert(!f.output().embeds[0].data.footer.text.includes('💦'));
  await f.runtime.start(f.client);
  for (let now = 3000; now <= 120000 && !(await f.saved()).gymUnlocked; now += 3000) { f.at(now); await f.runtime.pulse(); }
  const s = await f.saved(); assert.equal(s.tiers[1].wins, 1); assert.equal(s.active, false); assert.equal(s.tutorialStage, 'gym'); assert.equal(s.wallet.sweat, 5);
  assert.equal(f.output().embeds[0].data.title, 'Your first victory!');
  assert.equal(f.output().embeds[0].data.description, "_Wow, you worked up quite the 💦 Sweat taking down that Snowman. Let's head to the Gym and see what we can do with it._");
  assert.deepEqual(f.output().components.flatMap(r => r.components).map(b => b.data.label), ['Gym']);
  const count = f.edits.length; f.at(180000); await f.runtime.pulse(); assert.equal(f.edits.length, count);
});

test('live specialties switch selection to Regular immediately and restocking requires manual re-equipping', () => {
  const s = M.fresh('gym', 3); s.liveRules = true; M.change(s, 'snow', 1000, 'fixture'); M.change(s, 'red', 1, 'fixture');
  M.action(s, 'equip-red'); M.action(s, 'throw'); M.settle(s, 3000); assert.equal(s.equipped, 'regular'); assert.equal(s.wallet.red, 0);
  M.change(s, 'red', 2, 'restock'); M.settle(s, 6000); assert.equal(s.tiers[1].red, 1); assert.equal(s.wallet.red, 2);
  let output = screen({ state: s, action: 'throw' }, 'u');
  assert.equal(output.components.flatMap(r => r.components).find(b => b.data.custom_id.includes(':equip-regular:')).data.style, 3);
  assert.equal(output.components.flatMap(r => r.components).find(b => b.data.custom_id.includes(':equip-red:')).data.style, 2);
  M.action(s, 'equip-red'); M.settle(s, 9000); assert.equal(s.wallet.red, 1);
});

test('live Rough uses only Spicy, hides regulars and Stone, and hides unaffordable multiplier buttons', () => {
  const s = M.fresh(); Object.assign(s, { liveRules: true, tutorialFlow: 2, wooden: true, tier: 1, dummyHp: 0, roughOwned: true, redRecipe: true });
  M.change(s, 'regular', 10, 'fixture'); M.change(s, 'red', 10, 'fixture'); M.change(s, 'diamonds', 1, 'fixture');
  assert.throws(() => M.action(s, 'attack'), /Spicy/); assert.throws(() => M.action(s, 'craft'), /dummy/);
  let output = screen({ state: s, action: 'throw' }, 'u'); assert(!output.embeds[0].data.footer.text.includes('⚪'));
  assert(!output.components.flatMap(r => r.components).some(b => /:attack:|:craft:/.test(b.data.custom_id)));
  output = screen({ state: s, action: 'shop' }, 'u'); assert.equal(output.embeds[0].data.fields.length, 1);
  assert(!JSON.stringify(output).includes('Skipping Stone')); assert(!output.components.flatMap(r => r.components).some(b => /:buy-spicy:(10|100):/.test(b.data.custom_id)));
  assert.equal(output.components.flatMap(r => r.components).at(-1).data.label, 'Refresh');
});
