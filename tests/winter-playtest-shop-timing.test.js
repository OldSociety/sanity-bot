const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');
const M = require('../services/winter/game/game');
const { createStore } = require('../services/winter/game/saved-progress');
const { createRuntime } = require('../services/winter/game/interactions');
const { screen } = require('../services/winter/game/screens');
const { compactNumber } = require('../services/winter/numbers');

async function fixture(t, options = {}) {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }); t.after(() => db.close());
  let sequence = 0; const store = createStore({ sequelize: db, clock: () => 0, seed: () => 9, ...options });
  const run = (action, extra = {}) => store.execute({ id: `shop-timing-${++sequence}`, guildId: 'g', userId: 'u', action, ...extra });
  return { db, store, run };
}

test('post-Spicy shop prices ammunition in snow and Stone in diamonds, with contextual navigation', () => {
  const s = M.fresh('chapter1'); Object.assign(s, { chapter: 0, tier: 1, oldStone: false, roughHp: 47 });
  s.wallet.diamonds = 1; M.change(s, 'snow', 1000, 'fixture');
  const output = screen({ state: s, action: 'shop' }, 'u'), embed = output.embeds[0].data;
  assert.deepEqual(embed.fields.map(f => [f.name, f.value]), [['🔴 `Spicy Snowballs`', '**1,000❄️ each**'], ['`Old Skipping Stone`', '**10💎**']]);
  const buttons = output.components.flatMap(r => r.components);
  assert(buttons.some(b => b.data.label === 'Refresh')); assert(!buttons.some(b => /Kitchen|Ice|recipe/i.test(b.data.label)));
  assert(JSON.stringify(embed.fields).includes('❄️'));
  assert.equal(buttons.find(b => b.data.custom_id.includes(':buy-spicy:1')).data.disabled, false);
  assert.equal(buttons.find(b => b.data.custom_id.includes(':buy-spicy:10')), undefined);
});

test('defeating Rough reveals Sturdy for one diamond without requiring Stone, then removes the purchased ware', () => {
  const s = M.fresh('chapter1'); Object.assign(s, { chapter: 0, tier: 1, oldStone: false, roughHp: 1 });
  M.change(s, 'diamonds', 1, 'fixture');
  const show = () => screen({ state: s, action: 'shop' }, 'u');
  const sturdy = () => show().components.flatMap(r => r.components).find(b => b.data.custom_id.includes(':buy-sturdy:'));
  assert.equal(sturdy(), undefined); assert.throws(() => M.action(s, 'buy-sturdy'), /Defeat the Rough/);
  s.roughHp = 0;
  assert(sturdy()); assert.equal(sturdy().data.disabled, false);
  assert(show().embeds[0].data.fields.some(f => f.name.includes('Sturdy Snowman') && f.value === '**1💎**'));
  M.action(s, 'buy-sturdy', undefined, { shopCurrency: 'diamonds' });
  assert.equal(s.wallet.diamonds, 0); assert.equal(s.owned[1], true); assert.equal(s.oldStone, false); assert.equal(s.tier, 1); assert.equal(s.chapter, 0);
  assert.equal(sturdy(), undefined); assert.throws(() => M.action(s, 'buy-sturdy'), /already own/);
  M.action(s, 'throw'); assert.equal(s.active, true);
  s.gymUnlocked = true; M.action(s, 'train'); M.action(s, 'train-strength'); M.action(s, 'train-strength');
  M.change(s, 'diamonds', 1, 'fixture'); M.action(s, 'buy-old-stone'); assert.equal(s.tier, 2); assert.equal(s.owned[1], true); M.validate(s);
});

test('shop gift is one-time, ledgered, receipt-deduped, serialized and rolled back with the transaction', async t => {
  let fail = false; const f = await fixture(t, { beforeCommit: async () => { if (fail) throw Error('gift-rollback'); } });
  await f.run('status');
  const [[profile]] = await f.db.query('SELECT state FROM WinterPlaytestProfiles'); const state = JSON.parse(profile.state);
  Object.assign(state, { dummyHp: 0, wooden: true, tier: 1, roughOwned: true, roughThrows: 3, redRecipe: true });
  await f.db.query('UPDATE WinterPlaytestProfiles SET state=$state', { bind: { state: JSON.stringify(state) } });
  fail = true; await assert.rejects(f.run('shop'), /gift-rollback/); fail = false;
  const [a, b] = await Promise.all([f.run('shop', { id: 'gift-once' }), f.run('shop')]);
  assert.equal(a.state.wallet.red, 10); assert.equal(b.state.wallet.red, 10); assert.match(a.message, /on the house/); assert(!b.message);
  assert.equal(b.state.ledger.sources['requia-spicy-gift:red:gained'], 10);
  assert.deepEqual(await f.run('shop', { id: 'gift-once' }), a);
  const embed = screen(a, 'u').embeds[0].data; assert.equal(embed.description, "_Looks like you unlocked a new type of weapon. I really shouldn't but here's a few on the house._");
});

test('live shop spends snow on ammunition and diamonds on equipment, retaining recipe gates', () => {
  const s = M.fresh('gym'); M.change(s, 'snow', 10000000, 'fixture'); M.change(s, 'diamonds', 8000, 'fixture');
  const options = { shopCurrency: 'diamonds' };
  M.action(s, 'buy-spicy', '10', options); assert.equal(s.wallet.diamonds, 8000); assert.equal(s.wallet.red, 10); assert.equal(s.wallet.snow, 9990000);
  s.strength = 25; M.action(s, 'lift'); M.action(s, 'iron', undefined, options); assert.equal(s.wallet.diamonds, 7000);
  assert.throws(() => M.action(s, 'buy-ice-recipe', undefined, options), /after unlocking Snowman 3/);
  s.tiers[1].wins = 100; M.action(s, 'buy-s2', undefined, options); s.tiers[2].wins = 100;
  M.action(s, 'buy-s3', undefined, options); assert.equal(s.wallet.diamonds, 4000); assert.equal(s.wallet.snow, 9990000); M.validate(s);
  const poor = M.fresh('gym'); M.change(poor, 'diamonds', 1000, 'fixture'); assert.throws(() => M.action(poor, 'buy-spicy', '1', options), /snow/);
});

test('Available formatting retains only one decimal without rounding balances upward', () => {
  for (const [n, expected] of [[999, '999'], [1000, '1k'], [1500, '1.5k'], [1599, '1.5k'], [1999999, '1.9m'], [1000000, '1m']]) assert.equal(compactNumber(n), expected);
  const s = M.fresh('gym'); M.change(s, 'snow', 1500, 'fixture'); M.change(s, 'diamonds', 1599, 'fixture');
  const output = screen({ state: s, action: 'shop', run: { run: 1, status: 'active', speed: 5, realElapsedMs: 0, gameElapsedMs: 0 } }, 'u');
  assert.match(output.embeds[0].data.footer.text, /1.5k❄️.*1.5k💎/); assert(!output.embeds[0].data.footer.text.includes('Run #'));
});

test('diagnostic button timing is saved once, averaged by action, exported and included in the final recap', async t => {
  const f = await fixture(t); let sequence = 0, time = 0, output;
  const runtime = createRuntime({ store: f.store, isAdmin: () => true, measure: () => { time += 5; return time; } });
  async function invoke(action, values = {}, customId) {
    await runtime.handle({ id: `measured-${++sequence}`, guildId: 'g', channelId: 'c', user: { id: 'u' }, customId,
      message: { id: 'measured-message' }, isButton: () => Boolean(customId), options: { getSubcommand: () => action, getString: key => values[key] ?? null, getInteger: key => values[key] ?? null, data: [] },
      deferReply: async () => {}, deferUpdate: async () => {}, deleteReply: async () => {}, editReply: async p => { output = p; return { id: 'measured-message' }; } });
  }
  await invoke('diagnostic', { mode: 'start', bookmark: 'chapter1', speed: 5 }); await invoke('shop');
  for (let n = 0; n < 2; n++) {
    const refresh = output.components.flatMap(r => r.components).find(b => b.data.label === 'Refresh').data.custom_id;
    await invoke(null, {}, refresh);
  }
  const [[sample]] = await f.db.query("SELECT * FROM WinterPlaytestTimings WHERE kind='button' LIMIT 1");
  assert.equal(sample.action, 'shop'); assert.equal(sample.totalMs, 30); assert.equal(sample.engineMs, 5); assert.equal(sample.deliveryMs, 5);
  await f.store.recordTiming({ id: sample.interactionId, guildId: 'g', userId: 'u', queueMs: 999, ackMs: 999, engineMs: 999, renderMs: 999, deliveryMs: 999, totalMs: 999 });
  await invoke('diagnostic', { mode: 'status' });
  assert.match(JSON.stringify(output), /shop: \*\*30.0 ms\*\* avg \(2 samples/);
  const exported = await f.run('diagnostic', { diagnostic: { mode: 'export', runId: 1 } });
  assert.equal(exported.export.timings.filter(v => v.kind === 'button').length, 2);
  await invoke('diagnostic', { mode: 'stop' }); const report = await f.store.claimReport();
  assert.equal(report.payload.timings.find(v => v.kind === 'button').samples, 2);
  assert.match(JSON.stringify(require('../services/winter/game/recaps').recapMessage(report.payload)), /Button response times/);
  assert(report.payload.timings.some(v => v.kind === 'slash' && v.action === 'diagnostic'));
});
