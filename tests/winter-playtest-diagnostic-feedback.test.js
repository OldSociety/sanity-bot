const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');
const { createStore } = require('../services/winter/playtest-store');
const { createRuntime } = require('../services/winter/playtest-runtime');

async function fixture(t) {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }); t.after(() => db.close());
  let now = 0, sequence = 0, output;
  const store = createStore({ sequelize: db, clock: () => now, seed: () => 3 });
  const runtime = createRuntime({ store, isAdmin: () => true }); t.after(() => runtime.stop());
  async function command(values) {
    await runtime.handle({ id: `diagnostic-feedback-${++sequence}`, guildId: 'g', channelId: 'c', user: { id: 'u', username: 'Tester' },
      isButton: () => false, options: { getSubcommand: () => 'diagnostic', getString: key => values[key] ?? null, getInteger: key => values[key] ?? null, data: [] },
      deferReply: async p => assert(p.ephemeral), deleteReply: async () => {}, editReply: async p => { output = p; return { id: `reply-${sequence}` }; } });
    return output;
  }
  return { db, store, runtime, command, at: n => { now = n; } };
}

test('stop-at-Stone alone starts a Chapter0 run and returns an explicit successful diagnostic screen', async t => {
  const f = await fixture(t), output = await f.command({ mode: 'start', stop_at: 'stone' });
  const [[run]] = await f.db.query('SELECT * FROM WinterPlaytestRuns');
  assert.equal(run.bookmark, 'chapter0'); assert.equal(run.stopAt, 'stone'); assert.equal(run.status, 'active');
  assert.equal(output.embeds[0].data.title, 'Winter Wars · Diagnostic mode'); assert.match(output.embeds[0].data.description, /Run #1 started/);
  assert.equal(output.components.length, 0); assert.equal(output.embeds.length, 2);
});

test('every unspecified bookmark starts fresh even after a completed or advanced run; explicit skips remain supported', async t => {
  const f = await fixture(t);
  await f.command({ mode: 'start', bookmark: 'chapter1' }); f.at(60000);
  await f.command({ mode: 'stop' });
  let output = await f.command({ mode: 'start' });
  let [[run]] = await f.db.query('SELECT * FROM WinterPlaytestRuns ORDER BY id DESC LIMIT 1');
  assert.equal(run.id, 2); assert.equal(run.bookmark, 'chapter0'); assert.equal(run.startedAt, 60000);
  let state = JSON.parse(run.state);
  assert.equal(state.now, 0); assert.equal(state.tier, 0); assert.equal(state.wallet.snow, 10);
  assert.equal(state.dummyHp, 5); assert.equal(state.roughOwned, false); assert.equal(state.redRecipe, false); assert.equal(state.oldStone, false); assert.equal(state.strength, 0);
  assert(output.embeds[0].data.fields.some(f => f.name === 'Starting point' && f.value === 'Chapter 0 — fresh tutorial'));
  f.at(120000); await f.command({ mode: 'stop' }); await f.command({ mode: 'start', speed: 2 });
  [[run]] = await f.db.query('SELECT * FROM WinterPlaytestRuns ORDER BY id DESC LIMIT 1'); state = JSON.parse(run.state);
  assert.equal(run.bookmark, 'chapter0'); assert.equal(run.speed, 2); assert.equal(state.now, 0); assert.equal(state.dummyHp, 5);
  output = await f.command({ mode: 'start', bookmark: 'chapter1' });
  [[run]] = await f.db.query('SELECT * FROM WinterPlaytestRuns ORDER BY id DESC LIMIT 1');
  assert.equal(run.bookmark, 'chapter1'); assert.equal(JSON.parse(run.state).tier, 2);
  assert(output.embeds[0].data.fields.some(f => f.name === 'Starting point' && f.value === 'Chapter 1 — Stone shovel'));
});

test('invalid explicit bookmark and stopping without a run show the rejection, with no fabricated recap', async t => {
  const f = await fixture(t);
  let output = await f.command({ mode: 'start', bookmark: 'chapter1', stop_at: 'stone' });
  assert.equal(output.embeds[0].data.title, 'Winter diagnostic — request not applied'); assert.match(output.embeds[0].data.description, /Stone stop point requires the Chapter 0 bookmark/);
  output = await f.command({ mode: 'stop' }); assert.match(output.embeds[0].data.description, /No active diagnostic run/);
  assert(!JSON.stringify(output).includes('Welcome to Winter Wars'));
  const [[runs]] = await f.db.query('SELECT COUNT(*) AS n FROM WinterPlaytestRuns'); assert.equal(runs.n, 0);
  const [[reports]] = await f.db.query('SELECT COUNT(*) AS n FROM WinterPlaytestOutbox'); assert.equal(reports.n, 0);
});

test('actual start then manual stop produces one public searchable recap with periodic reports off', async t => {
  const f = await fixture(t); await f.command({ mode: 'start', stop_at: 'stone', report_minutes: 0 });
  f.at(900000); const output = await f.command({ mode: 'stop' }); assert.match(output.embeds[0].data.description, /Run #1 stopped and saved/);
  const sent = [];
  f.runtime.start({ isReady: () => true, once: () => {}, channels: { fetch: async () => ({ guildId: 'g', isTextBased: () => true, send: async payload => { sent.push(payload); return { id: 'public-recap' }; } }) } });
  for (let n = 0; n < 100; n++) {
    const [[report]] = await f.db.query('SELECT status,payload FROM WinterPlaytestOutbox');
    if (report?.status === 'sent') { assert.equal(JSON.parse(report.payload).messageId, 'public-recap'); break; }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(sent.length, 1); assert.match(sent[0].content, /WINTER-RUN-000001/); assert.equal(sent[0].ephemeral, undefined); assert.equal(sent[0].flags, undefined);
  assert.match(sent[0].embeds[0].data.title, /Stopped manually/); assert(sent[0].embeds[0].data.fields.some(v => v.name === 'Resources gained during this run'));
  await f.command({ mode: 'stop' }); await f.runtime.pulse(); assert.equal(sent.length, 1);
});
