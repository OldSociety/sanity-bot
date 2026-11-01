const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const M = require('../services/winter/early-progression');
const O = require('../services/winter/offline-checkpoints');
const R = require('../services/winter/simulation-rng');
const settings = require('../config/winter/return-simulation.json');
const H = M.HOUR;
async function fixture(t, options = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'winter-return-'));
  const file = path.join(dir, 'return.winter-sim.sqlite');
  const connections = [];
  async function connect() {
    const entry = { store: await O.open(file, { settings, ...options }), closed: false };
    connections.push(entry); return entry;
  }
  t.after(async () => {
    for (const e of connections) if (!e.closed) await e.store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  const first = await connect();
  return { store: first.store, connect, close: async e => { await e.store.close(); e.closed = true; }, first };
}

test('five-minute visits credit every interval and preserve combat/RNG exactly', async t => {
  const f = await fixture(t), s = f.store;
  await s.create('p', 42);
  for (let i = 1; i <= 24; i++) await s.command('p', i * 5 * 60000, `v${i}`, {});
  const actual = await s.read('p'), expected = O.fresh(42, M.config, settings);
  M.settle(expected.state, 2 * H, R.streams(expected.random));
  assert.deepEqual(actual.state, expected.state);
  assert.deepEqual(actual.random, expected.random);
  assert.equal(actual.discardedMs, 0); assert.equal(actual.creditedMs, 2 * H);
  assert.equal(actual.state.tiers[1].attacks, 2400);
});

test('return settles a 10.5-hour gap as 4+4+2.5 hours, then applies the command', async t => {
  const f = await fixture(t), s = f.store;
  await s.create('p', 43);
  const result = await s.command('p', 10.5 * H, 'return', {}, (state, envelope) => {
    assert.equal(state.now, 10.5 * H);
    assert.equal(envelope.creditedMs, 10.5 * H);
    M.purchase(state, 'visit');
  });
  assert.equal(result.discardedMs, 0);
  const rows = await s.journal('p');
  assert.deepEqual(rows.filter(r => r.kind === 'capture').map(r => r.throughAt - r.fromAt), [4 * H, 4 * H, 2.5 * H]);
  assert.equal(rows.at(-1).kind, 'command');
  assert.equal(rows.at(-1).fromAt, 10.5 * H);
  M.assertLedger(result.state);
});

test('abandoned players require no captures or startup settlement; only the returning player advances', async t => {
  const metrics = {}, f = await fixture(t, { metrics }), s = f.store;
  await s.create('returning', 1); await s.create('absent', 2);
  assert.equal(await s.recover(31 * 24 * H), 0);
  assert.equal(metrics.simulationCalls, 0);
  await assert.rejects(s.capture('absent', 31 * 24 * H), /no background/);
  assert.equal((await s.read('absent')).state.now, 0);
  await s.command('returning', 24 * H, 'visit', {});
  assert.equal((await s.read('returning')).creditedMs, 24 * H);
  assert.equal((await s.read('absent')).state.now, 0);
});

test('ten simultaneous returns share one queue and yield between bounded chunks', async t => {
  const metrics = {}, f = await fixture(t, { metrics }), s = f.store;
  for (let i = 0; i < 10; i++) await s.create(`p${i}`, i + 1);
  metrics.peakQueued = 0;
  let turns = 0, running = true;
  function tick() { if (running) { turns++; setImmediate(tick); } }
  setImmediate(tick);
  try {
    await Promise.all(Array.from({ length: 10 }, (_, i) => s.command(`p${i}`, 24 * H, 'visit', {})));
  } finally { running = false; }
  assert.equal(metrics.peakActive, 1);
  assert.equal(metrics.simulationCalls, 60);
  assert(metrics.peakQueued >= 9);
  assert(turns > 10);
  for (let i = 0; i < 10; i++) {
    const e = await s.read(`p${i}`); assert.equal(e.creditedMs, 24 * H); M.assertLedger(e.state);
  }
});

test('restart loads saved checkpoints without calculating absentees; return resumes the same history', async t => {
  const f = await fixture(t), s = f.store;
  await s.create('p', 71);
  await s.command('p', 65 * 60000, 'first', {});
  await f.close(f.first);
  const reopened = (await f.connect()).store;
  assert.equal(await reopened.recover(12 * H), 0);
  assert.equal((await reopened.read('p')).state.now, 65 * 60000);
  const e = await reopened.command('p', 12 * H, 'second', {});
  const expected = O.fresh(71, M.config, settings);
  M.settle(expected.state, 12 * H, R.streams(expected.random));
  assert.deepEqual(e.state, expected.state); assert.deepEqual(e.random, expected.random);
});

test('a failed chunk rolls back its rewards/RNG and retry preserves completed earlier chunks', async t => {
  let chunks = 0;
  const f = await fixture(t, { beforeCommit: ({ kind }) => {
    if (kind === 'capture' && ++chunks === 2) throw Error('Injected chunk failure');
  } });
  await f.store.create('p', 81);
  await assert.rejects(f.store.command('p', 10.5 * H, 'return', {}), /Injected/);
  assert.equal((await f.store.read('p')).creditedMs, 4 * H);
  const e = await f.store.command('p', 10.5 * H, 'return', {});
  const expected = O.fresh(81, M.config, settings);
  M.settle(expected.state, 10.5 * H, R.streams(expected.random));
  assert.deepEqual(e.state, expected.state); assert.deepEqual(e.random, expected.random);
  const duplicate = await f.store.command('p', 10.5 * H, 'return', {});
  assert.deepEqual(duplicate, e);
});

test('all pre-return income uses the old stats; purchases are never retroactive', async t => {
  const f = await fixture(t), initial = O.fresh(90, M.config, settings);
  initial.state.active = false;
  initial.state.sweat = 6; initial.state.ledger.starterSweat = 6;
  await f.store.create('p', 90, initial);
  let e = await f.store.command('p', 24 * H, 'train', {}, state => {
    assert.equal(state.ledger.passiveSweat, 0);
    M.purchase(state, 'strength'); M.purchase(state, 'strength'); M.purchase(state, 'strength');
  });
  assert.equal(e.state.strength, 3); assert.equal(e.state.sweat, 0);
  e = await f.store.command('p', 25 * H, 'next', {});
  assert.equal(e.state.sweat, 1); assert.equal(e.discardedMs, 0);
  M.assertLedger(e.state);
});
