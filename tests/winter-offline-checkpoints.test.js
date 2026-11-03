const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const M = require('../services/winter/studies/early-progression');
const O = require('../services/winter/studies/offline-checkpoints');
const R = require('../services/winter/studies/simulation-rng');
const G = require('../services/winter/studies/discovery-window');
const H = M.HOUR;
async function fixture(t, options = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'winter-offline-'));
  const file = path.join(dir, 'checkpoint.winter-sim.sqlite');
  const stores = [];
  t.after(async () => {
    for (const s of stores) { if (!s.closed) await s.store.close(); }
    await fs.rm(dir, { recursive: true, force: true });
  });
  async function connect(opts = options) {
    const entry = { store: await O.open(file, opts), closed: false };
    stores.push(entry);
    return entry;
  }
  const entry = await connect();
  return { file, entry, connect, close: async e => { await e.store.close(); e.closed = true; } };
}
function totals(envelope) {
  assert.equal(envelope.state.now, envelope.creditedMs + envelope.discardedMs);
  M.assertLedger(envelope.state);
}

test('no capture before one inactive hour; repeated captures leave activity unchanged', async t => {
  const f = await fixture(t), s = f.entry.store;
  await s.create('p', 42);
  assert.equal((await s.capture('p', H - 1)).state.now, 0);
  let e = await s.capture('p', H);
  assert.equal(e.creditedMs, H);
  assert.equal(e.lastActivityAt, 0);
  assert.equal(e.nextCaptureAt, 2 * H);
  e = await s.capture('p', 2 * H);
  assert.equal(e.creditedMs, 2 * H);
  assert.equal(e.hourlyCaptures, 2);
  assert.equal((await s.journal('p')).length, 2);
  assert.deepEqual(await s.capture('p', 2 * H), e);
  totals(e);
});

test('ten-hour gaps recover as 4+4+2, retaining a partial tail and the exact RNG/combat state', async t => {
  const f = await fixture(t), s = f.entry.store;
  const expected = O.fresh(271828);
  M.settle(expected.state, 10 * H, R.streams(expected.random));
  await s.create('p', 271828);
  const e = await s.capture('p', 10.5 * H);
  assert.deepEqual(e.state, expected.state);
  assert.deepEqual(e.random, expected.random);
  assert.equal(e.nextCaptureAt, 11 * H);
  assert.equal(e.hourlyCaptures, 10);
  const captures = await s.journal('p');
  assert.deepEqual(captures.map(r => r.throughAt - r.fromAt), [4 * H, 4 * H, 2 * H]);
  totals(e);
});

test('commands discard only the unfinished tail before applying purchases and never recover it later', async t => {
  const f = await fixture(t), s = f.entry.store;
  await s.create('p', 43);
  const captured = await s.capture('p', H);
  const at = 100 * 60000;
  const e = await s.command('p', at, 'visit-1', { action: 'visit' }, (state, envelope) => {
    assert.equal(state.now, at);
    assert.equal(envelope.lastActivityAt, at);
    assert.equal(envelope.discardedMs, 40 * 60000);
    assert.equal(state.playerHp, captured.state.playerHp);
    assert.equal(state.enemyHp, captured.state.enemyHp);
    M.purchase(state, 'visit');
  });
  assert.equal(e.state.nextPlayerAt - at, captured.state.nextPlayerAt - H);
  assert.equal(e.state.nextEnemyAt - at, captured.state.nextEnemyAt - H);
  const earned = e.state.ledger.snowProduced;
  await f.close(f.entry);
  const reopened = (await f.connect()).store;
  await reopened.recover(at + H);
  const after = await reopened.read('p');
  assert.equal(after.discardedMs, 40 * 60000);
  assert.equal(after.creditedMs, 2 * H);
  assert.equal(after.state.ledger.snowProduced - earned, M.config.stoneRate * 3600);
  totals(after);
});

test('return at the exact boundary credits that hour before the command; frequent returns earn nothing', async t => {
  const f = await fixture(t), s = f.entry.store;
  await s.create('hourly', 1);
  const e = await s.command('hourly', H, 'hour', {}, state => {
    assert.equal(state.ledger.snowProduced, 129600);
    M.purchase(state, 'visit');
  });
  assert.equal(e.discardedMs, 0);
  assert.equal(e.creditedMs, H);
  await s.create('frequent', 1);
  for (let i = 1; i <= 24; i++) await s.command('frequent', i * 5 * 60000, `v${i}`, {});
  const frequent = await s.read('frequent');
  assert.equal(frequent.creditedMs, 0);
  assert.equal(frequent.discardedMs, 2 * H);
  assert.equal(frequent.state.ledger.snowProduced, 0);
  assert.equal(frequent.state.tiers[1].attacks, 0);
  totals(frequent);
});

test('startup recovery after closing/reopening SQLite matches uninterrupted hourly updates exactly', async t => {
  const f = await fixture(t), s = f.entry.store;
  await s.create('p', 55);
  await s.capture('p', H);
  await f.close(f.entry);
  const reopened = (await f.connect()).store;
  await reopened.recover(12 * H);
  const recovered = await reopened.read('p');
  const expected = O.fresh(55);
  for (let at = H; at <= 12 * H; at += H) O.captureChunk(expected, at);
  assert.deepEqual(recovered.state, expected.state);
  assert.deepEqual(recovered.random, expected.random);
  assert.equal(recovered.creditedMs, 12 * H);
  totals(recovered);
});

test('failed capture rolls back rewards, checkpoint and RNG; retry commits the original outcome', async t => {
  let fail = true;
  const f = await fixture(t, { beforeCommit: ({ kind }) => {
    if (kind === 'capture' && fail) { fail = false; throw Error('Injected write failure'); }
  } });
  const s = f.entry.store, original = await s.create('p', 77);
  await assert.rejects(s.capture('p', H), /Injected/);
  assert.deepEqual(await s.read('p'), original);
  assert.deepEqual(await s.journal('p'), []);
  const e = await s.capture('p', H);
  const expected = O.fresh(77); O.captureChunk(expected, H);
  assert.deepEqual(e.state, expected.state);
  assert.deepEqual(e.random, expected.random);
  assert.equal((await s.journal('p')).length, 1);
});

test('failure in a later recovery chunk preserves prior commits and resumes from that checkpoint', async t => {
  let chunks = 0;
  const f = await fixture(t, { beforeCommit: ({ kind }) => {
    if (kind === 'capture' && ++chunks === 2) throw Error('Injected second chunk failure');
  } });
  const s = f.entry.store;
  await s.create('p', 88);
  await assert.rejects(s.capture('p', 10 * H), /second chunk/);
  assert.equal((await s.read('p')).state.now, 4 * H);
  const e = await s.capture('p', 10 * H);
  const expected = O.fresh(88); O.captureChunk(expected, 10 * H); O.captureChunk(expected, 10 * H); O.captureChunk(expected, 10 * H);
  assert.deepEqual(e.state, expected.state);
  assert.deepEqual(e.random, expected.random);
  assert.equal(e.captureChunks, 3);
  totals(e);
});

test('capture/command races on two independent SQLite connections credit each interval once', async t => {
  const f = await fixture(t), a = f.entry.store, b = (await f.connect()).store;
  await a.create('p', 99);
  await Promise.all([
    a.capture('p', 5 * H),
    b.command('p', 5 * H, 'same-command', { action: 'red' }, state => M.purchase(state, 'red', 1)),
    a.command('p', 5 * H, 'same-command', { action: 'red' }, state => M.purchase(state, 'red', 1)),
  ]);
  const e = await a.read('p');
  assert.equal(e.creditedMs, 5 * H);
  assert.equal(e.state.red, 1);
  assert.equal(e.state.ledger.redSnow, 1000);
  const journal = await a.journal('p');
  assert.equal(journal.filter(r => r.kind === 'command').length, 1);
  assert.equal(journal.filter(r => r.kind === 'capture').reduce((sum, r) => sum + r.throughAt - r.fromAt, 0), 5 * H);
  await assert.rejects(a.command('p', 5 * H, 'same-command', { action: 'different' }), /identity mismatch/);
  totals(e);
});

test('failed prospective command rolls back its discard and receipt, allowing one safe retry', async t => {
  const f = await fixture(t), s = f.entry.store;
  const initial = await s.create('p', 100);
  await assert.rejects(s.command('p', .5 * H, 'broken', {}, state => {
    state.snow += 100; throw Error('Injected command failure');
  }), /command failure/);
  assert.deepEqual(await s.read('p'), initial);
  const result = await s.command('p', .5 * H, 'broken', {}, () => {});
  assert.equal(result.discardedMs, .5 * H);
  assert.deepEqual(await s.command('p', .5 * H, 'broken', {}), result);
  assert.equal((await s.journal('p')).length, 1);
});

test('checkpointing preserves closed discovery windows; captures cannot rearm them', async t => {
  const f = await fixture(t), s = f.entry.store, envelope = O.fresh(101);
  envelope.state.discovery = G.fresh();
  assert(G.throwBrown(envelope.state.discovery, 0, () => 0));
  for (let i = 0; i < 5000; i++) assert.equal(G.throwBrown(envelope.state.discovery, H, () => 0), false);
  await s.create('p', 101, envelope);
  await s.capture('p', 24 * H);
  await f.close(f.entry);
  const reopened = (await f.connect()).store;
  await reopened.recover(48 * H);
  const e = await reopened.read('p');
  assert.deepEqual(e.state.discovery, { pieces: 1, armed: false, lastFoundAt: 0 });
  await reopened.command('p', 48 * H, 'rearm', {}, state => {
    G.interact(state.discovery, state.now);
    assert(G.throwBrown(state.discovery, state.now, () => 0));
  });
  assert.equal((await reopened.read('p')).state.discovery.pieces, 2);
  const gate = G.fresh(); G.throwBrown(gate, 0, () => 0); G.interact(gate, .5 * H);
  assert.equal(gate.armed, false);
});

test('multiple-player recovery is independent; unsafe live database paths are rejected', async t => {
  const f = await fixture(t), s = f.entry.store;
  await s.create('a', 12); await s.create('b', 13);
  assert.equal(await s.recover(8 * H), 2);
  assert.equal((await s.read('a')).creditedMs, 8 * H);
  assert.equal((await s.read('b')).creditedMs, 8 * H);
  assert.notDeepEqual((await s.read('a')).random, (await s.read('b')).random);
  await assert.rejects(O.open('config/prod.sqlite'), /isolated/);
  await assert.rejects(s.command('a', H, 'backwards', {}), /backwards/);
});

test('hourly simulation agrees with native engine on exact-hour visits; outage chunking does not change policy outcomes', async () => {
  const hourly = require('../scripts/winter/hourly-progression');
  const native = require('../scripts/winter/early-progression');
  const scenario = hourly.scenarios.find(s => s.id === 'hourly-red-half');
  const actual = await hourly.run(271828, scenario, { limit: 48 * H });
  const expected = native.run(271828, scenario, 48 * H);
  assert.deepEqual(actual.envelope.state, expected.state);
  const daily = hourly.scenarios.find(s => s.id === 'daily-red-half');
  const recovery = hourly.scenarios.find(s => s.id === 'daily-outage-red-half');
  const uninterrupted = await hourly.run(271828, daily, { limit: 72 * H });
  const recovered = await hourly.run(271828, recovery, { limit: 72 * H });
  assert.deepEqual(recovered.envelope.state, uninterrupted.envelope.state);
  assert.deepEqual(recovered.envelope.random, uninterrupted.envelope.random);
});

test('selected ammunition survives SQLite reopen and falls back during the recovered capture without extra attacks', async t => {
  const f = await fixture(t), s = f.entry.store, envelope = O.fresh(2026);
  O.captureChunk(envelope, 2 * H);
  assert(M.purchase(envelope.state, 'red', 6));
  M.equip(envelope.state, 'red');
  await s.create('p', 2026, envelope);
  await f.close(f.entry);
  const reopened = (await f.connect()).store;
  await reopened.recover(3 * H);
  const actual = await reopened.read('p');
  const expected = structuredClone(envelope);
  O.captureChunk(expected, 3 * H);
  assert.deepEqual(actual.state, expected.state);
  assert.deepEqual(actual.random, expected.random);
  assert.equal(actual.state.red, 0);
  assert.equal(actual.state.equipped, 'red');
  assert.equal(actual.state.tiers[1].red - envelope.state.tiers[1].red, 6);
  assert.equal(actual.state.tiers[1].regular - envelope.state.tiers[1].regular, 1194);
  totals(actual);
});
