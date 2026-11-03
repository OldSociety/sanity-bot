const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');
const { createStore } = require('../services/winter/playtest-store');
const { createRuntime } = require('../services/winter/playtest-runtime');

test('gym command reaches training, retains raw audit identity and follows tutorial/unlock controls', async t => {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }); t.after(() => db.close());
  let sequence = 0, output;
  const store = createStore({ sequelize: db, clock: () => 0, seed: () => 3 });
  const run = (action, extra = {}) => store.execute({ id: `gym-test-${++sequence}`, guildId: 'g', userId: 'u', action, ...extra });
  await run('diagnostic', { diagnostic: { mode: 'start', speed: 1, bookmark: 'chapter1', stopAt: 'none', reportMinutes: 0, channelId: 'c' } });
  const runtime = createRuntime({ store, isAdmin: () => false });
  const request = { id: 'gym-slash', guildId: 'g', channelId: 'c', user: { id: 'u' }, isButton: () => false,
    options: { getSubcommand: () => 'gym', data: [{ name: 'gym', type: 1 }] }, deferReply: async p => assert(p.ephemeral), deleteReply: async () => {}, editReply: async p => { output = p; return { id: 'gym-message' }; } };
  await runtime.handle(request); await runtime.stop();
  assert.equal(output.embeds[0].data.title, 'Hendrix’s Gym 💪🏽');
  assert.deepEqual(output.components.flatMap(r => r.components).slice(-2).map(b => b.data.label), ['Shop', 'Throw']);
  const [[audit]] = await db.query("SELECT action,outcome FROM WinterPlaytestInteractions WHERE id='gym-slash'"); assert.equal(audit.action, 'gym'); assert.equal(audit.outcome, 'ok');
  const before = await run('status'); const repeated = await run('gym'); assert.equal(repeated.state.wallet.sweat, before.state.wallet.sweat);
  await run('diagnostic', { diagnostic: { mode: 'stop' } });
  await run('diagnostic', { diagnostic: { mode: 'start', speed: 1, bookmark: 'chapter0', stopAt: 'none', reportMinutes: 0, channelId: 'c' } });
  const early = await run('gym'); assert.equal(early.outcome, 'rejected'); assert.equal(early.state.gymEntered, false);
  assert.equal(require('../services/winter/playtest-presentation').screen(early, 'u').embeds[0].data.title, 'Stop!');
  const [[row]] = await db.query('SELECT state FROM WinterPlaytestRuns ORDER BY id DESC LIMIT 1'); const s = JSON.parse(row.state);
  Object.assign(s, { dummyHp: 0, wooden: true, tier: 1, roughOwned: true, roughHp: 0, redRecipe: true, owned: { 1: true, 2: false, 3: false }, gymUnlocked: true, tutorialStage: 'gym', spicyShopGiftClaimed: true });
  await db.query('UPDATE WinterPlaytestRuns SET state=$state WHERE id=2', { bind: { state: JSON.stringify(s) } });
  const lesson = await run('gym'); assert.equal(lesson.redirected, false); assert.equal(lesson.state.gymEntered, true); assert.equal(lesson.state.strength, 1);
  assert.equal(require('../services/winter/playtest-presentation').screen(lesson, 'u').components.flatMap(r => r.components).length, 1);
});
