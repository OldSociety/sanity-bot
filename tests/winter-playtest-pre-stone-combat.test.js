const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');
const M = require('../services/winter/game/game');
const { createStore } = require('../services/winter/game/saved-progress');
const { screen } = require('../services/winter/game/screens');

function beforePurchase() {
  const s = M.fresh('chapter1', 314159); Object.assign(s, { tier: 1, chapter: 0, oldStone: false });
  M.settle(s, 257242); M.change(s, 'diamonds', 1, 'fixture'); return s;
}
test('Sturdy purchase shows its introduction and entering the fight preserves its global cadence', () => {
  const s = beforePurchase(); M.action(s, 'buy-sturdy');
  assert(s.active); assert.equal(s.nextPlayerAt, 258000); assert.equal(s.nextEnemyAt, 267242);
  const output = screen({ state: s, action: 'buy-sturdy' }, 'u');
  assert.equal(output.embeds[0].data.title, 'New Opponent Unlocked!'); assert.match(output.embeds[0].data.description, /`\/snow throw`/);
  assert.deepEqual(output.components.flatMap(r => r.components).map(b => b.data.label), ['Throw']);
  assert(!JSON.stringify(output).includes('Throw / resume'));
  const a = structuredClone(s), b = structuredClone(s);
  M.settle(a, 258001); assert.equal(a.tiers[1].attacks, 1);
  M.settle(a, 600000); for (let at = 258001; at < 600000; at += 1777) M.settle(b, at); M.settle(b, 600000);
  assert.deepEqual(a, b); assert(a.tiers[1].attacks > 0); assert.equal(a.chapter, 0); M.validate(a);
});

test('existing active Chapter0 checkpoint recovers overdue time and all commands including diagnostic stop work', async t => {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }); t.after(() => db.close());
  let now = 0, sequence = 0; const store = createStore({ sequelize: db, clock: () => now, seed: () => 3 });
  const run = (action, extra = {}) => store.execute({ id: `pre-stone-${++sequence}`, guildId: 'g', userId: 'u', action, ...extra });
  await run('diagnostic', { diagnostic: { mode: 'start', bookmark: 'chapter0', speed: 1, stopAt: 'none', reportMinutes: 0, channelId: 'c' } });
  const s = beforePurchase(); M.action(s, 'buy-sturdy');
  await db.query('UPDATE WinterPlaytestRuns SET state=$state WHERE id=1', { bind: { state: JSON.stringify(s) } });
  now = 257242 + 2 * 3600000;
  const status = await run('status'); assert.equal(status.outcome, 'ok'); assert(status.state.tiers[1].attacks > 0); assert.equal(status.state.tiers[1].wins, 1); assert.equal(status.state.tutorialStage, 'gym');
  assert.equal(status.state.tier, 1); assert.equal(status.state.oldStone, false); M.validate(status.state);
  const shop = await run('shop'); assert.equal(shop.outcome, 'ok'); assert.equal(shop.redirected, true);
  assert.deepEqual(screen(shop, 'u').components.flatMap(r => r.components).map(b => b.data.label), ['Gym']);
  const thrown = await run('throw'); assert.equal(thrown.outcome, 'ok');
  const stopped = await run('diagnostic', { id: 'recovered-stop', diagnostic: { mode: 'stop' } });
  assert.equal(stopped.run.status, 'stopped'); assert.equal(stopped.state.active, false);
  assert.deepEqual(await run('diagnostic', { id: 'recovered-stop', diagnostic: { mode: 'stop' } }), stopped);
  const recap = await store.claimReport(); assert.equal(recap.payload.status, 'stopped'); assert.equal(recap.payload.label, 'WINTER-RUN-000001'); assert.equal(await store.claimReport(), null);
});
