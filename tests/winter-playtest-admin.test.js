const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');
const { createStore } = require('../services/winter/game/saved-progress');
const { createRuntime } = require('../services/winter/game/interactions');
const { screen } = require('../services/winter/game/screens');
async function fixture(t, options = {}) {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }); t.after(() => db.close());
  let now = 0, n = 0; const store = createStore({ sequelize: db, clock: () => now, seed: () => 17, ...options });
  const run = (action, extra = {}) => store.execute({ guildId: 'g', userId: 'u', id: `admin-${++n}`, action, admin: true, kind: action === 'admin' ? 'slash' : 'button', ...extra });
  const start = () => run('diagnostic', { diagnostic: { mode: 'start', speed: 5, bookmark: 'gym', stopAt: 'chapter1', reportMinutes: 0, channelId: 'c' } });
  return { db, store, run, start, at: value => { now = value; } };
}
test('admin panel restores resource controls and Reset without adding gameplay controls', async t => {
  const f = await fixture(t), receipt = await f.run('admin'); assert.equal(receipt.outcome, 'ok');
  const output = screen(receipt, 'u'), buttons = output.components.flatMap(r => r.components);
  assert.deepEqual(buttons.map(b => b.data.label), ['+100 Sweat', '+1 hour snow', '+10 each snowball', 'Reset']);
  output.embeds[0].toJSON(); assert.equal(buttons.at(-1).data.style, 4);
  const a = await f.run('grant-sweat', { id: 'grant-once' }); assert.equal(a.state.wallet.sweat, 100);
  assert.deepEqual(await f.run('grant-sweat', { id: 'grant-once' }), a);
  const b = await f.run('grant-snow'); assert.equal(b.state.wallet.snow, 3610);
  const c = await f.run('grant-ammo'); for (const key of ['regular', 'red', 'ice']) assert.equal(c.state.wallet[key], 10);
  assert.equal(c.state.redRecipe, false); assert.equal(c.state.iceRecipe, false);
  assert.equal(c.state.ledger.sources['admin-grant:sweat:gained'], 100);
});
test('reset uses owner-scoped green Confirm then red Cancel; cancellation and stale tokens preserve progress', async t => {
  const f = await fixture(t); await f.run('grant-snow');
  let prompt = await f.run('restart'); const token = prompt.state.restartToken;
  const buttons = screen(prompt, 'u').components[0].components;
  assert.deepEqual(buttons.map(b => b.data.label), ['Confirm', 'Cancel']); assert.deepEqual(buttons.map(b => b.data.style), [3, 4]);
  assert(buttons.every(b => b.data.custom_id.includes('snow:u:pt:normal:')));
  const cancel = await f.run('restart-cancel', { quantity: token }); assert.equal(cancel.state.wallet.snow, 3610); assert.equal(cancel.state.restartToken, undefined);
  const expired = await f.run('restart-confirm', { quantity: token }); assert.equal(expired.outcome, 'rejected');
  assert.match(screen(expired, 'u').embeds[0].data.description, /expired/);
  prompt = await f.run('restart'); const newer = await f.run('restart');
  assert.notEqual(newer.state.restartToken, prompt.state.restartToken);
  assert.equal((await f.run('restart-confirm', { quantity: prompt.state.restartToken })).outcome, 'rejected');
  assert.equal((await f.run('restart-cancel', { quantity: prompt.state.restartToken })).outcome, 'rejected');
  const reset = await f.run('restart-confirm', { id: 'confirmed-normal', quantity: newer.state.restartToken });
  assert.equal(reset.state.wallet.snow, 10); assert.equal(reset.state.wallet.sweat, 0); assert.equal(reset.state.chapter, 0); assert.equal(reset.state.tier, 0); assert.equal(reset.state.dummyHp, 5);
  const [[history]] = await f.db.query("SELECT afterState FROM WinterPlaytestInteractions WHERE action='grant-snow'"); assert.equal(JSON.parse(history.afterState).wallet.snow, 3610);
  f.at(1000); const next = await f.run('status'); assert.equal(next.state.wallet.snow, 11);
  assert.deepEqual(await f.run('restart-confirm', { id: 'confirmed-normal', quantity: newer.state.restartToken }), reset);
  assert.equal((await f.run('restart-confirm', { quantity: newer.state.restartToken })).outcome, 'rejected');
});
test('diagnostic reset archives the old run and starts a numbered Chapter0 run with the same settings', async t => {
  const f = await fixture(t); await f.start(); await f.run('grant-snow'); f.at(1000);
  const prompt = await f.run('restart'), token = prompt.state.restartToken;
  const request = { id: 'confirmed-diagnostic', quantity: token, expectedRun: '1' };
  const reset = await f.run('restart-confirm', request);
  assert.equal(reset.run.run, 2); assert.equal(reset.resetFromRun, 1); assert.equal(reset.run.bookmark, 'chapter0'); assert.equal(reset.run.speed, 5);
  assert.equal(reset.state.wallet.snow, 10); assert.equal(reset.run.stopAt, 'chapter1'); assert.equal(reset.state.now, 0);
  const [[old]] = await f.db.query('SELECT * FROM WinterPlaytestRuns WHERE id=1'); assert.equal(old.status, 'reset'); assert(JSON.parse(old.state).wallet.snow > 100000);
  const recap = await f.store.claimReport(); assert.equal(recap.payload.status, 'reset'); assert.equal(recap.payload.run, 1);
  assert.equal(await f.store.claimReport(), null);
  assert.deepEqual(await f.run('restart-confirm', request), reset);
  assert.equal((await f.run('restart-confirm', { quantity: token, expectedRun: '1' })).outcome, 'denied');
  const [[count]] = await f.db.query('SELECT COUNT(*) AS n FROM WinterPlaytestRuns'); assert.equal(count.n, 2);
});
test('admin remains accessible during Gym lessons and after completion; grants cannot mutate a frozen run', async t => {
  const f = await fixture(t); await f.start(); await f.run('diagnostic', { diagnostic: { mode: 'stop' } });
  const admin = await f.run('admin'), buttons = screen(admin, 'u').components.flatMap(r => r.components);
  assert.equal(buttons.find(b => b.data.label === 'Reset').data.disabled, false);
  assert(buttons.filter(b => b.data.label.startsWith('+')).every(b => b.data.disabled));
  const frozen = admin.state.wallet.snow; assert.equal((await f.run('grant-snow')).outcome, 'rejected');
  const prompt = await f.run('restart'); const result = await f.run('restart-confirm', { quantity: prompt.state.restartToken }); assert.equal(result.run.run, 2);
  const [[old]] = await f.db.query('SELECT status,state FROM WinterPlaytestRuns WHERE id=1'); assert.equal(old.status, 'stopped'); assert.equal(JSON.parse(old.state).wallet.snow, frozen);
});
test('admin grants and resets require authority in the store, including forged controls', async t => {
  const f = await fixture(t); await f.run('admin');
  for (const action of ['admin', 'grant-sweat', 'grant-snow', 'grant-ammo', 'restart', 'restart-confirm', 'restart-cancel']) {
    const r = await f.run(action, { admin: false, quantity: 'forged' }); assert.equal(r.outcome, 'denied'); assert.equal(r.state.wallet.snow, 10); assert.equal(r.state.wallet.sweat, 0);
    assert.equal(screen(r, 'u').components.length, 0);
  }
});
test('reset failure rolls back old run, nonce, new run and recap together', async t => {
  let fail = false; const f = await fixture(t, { beforeCommit: async () => { if (fail) throw Error('reset-rollback'); } });
  await f.start(); const prompt = await f.run('restart'); fail = true;
  const request = { id: 'reset-atomic', quantity: prompt.state.restartToken };
  await assert.rejects(f.run('restart-confirm', request), /reset-rollback/);
  const [[old]] = await f.db.query('SELECT status,state FROM WinterPlaytestRuns WHERE id=1'); assert.equal(old.status, 'active'); assert.equal(JSON.parse(old.state).restartToken, request.quantity);
  assert.equal(await f.store.claimReport(), null); fail = false;
  assert.equal((await f.run('restart-confirm', request)).run.run, 2);
});
test('runtime restores Administrator permission access and protects another player controls', async t => {
  const f = await fixture(t), output = [];
  const runtime = createRuntime({ store: f.store });
  const base = { guildId: 'g', channelId: 'c', user: { id: 'u' }, options: { getSubcommand: () => 'admin', data: [] },
    isButton: () => false, memberPermissions: { has: value => value === 'Administrator' }, deferReply: async p => assert(p.ephemeral), editReply: async p => output.push(p) };
  await runtime.handle({ ...base, id: 'permission-admin' }); assert.equal(output[0].embeds[0].data.title, 'Winter development admin');
  await runtime.handle({ ...base, id: 'permission-denied', memberPermissions: { has: () => false } }); assert.match(output[1].content, /administrators only/);
  await runtime.handle({ ...base, id: 'foreign-reset', isButton: () => true, customId: 'snow:someone:pt:normal:restart:1' }); assert.match(output[2].content, /another player/);
});
