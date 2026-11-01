const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');
const { createEconomy } = require('../services/winter/economy');
const D = require('../services/winter/diagnostics');
const { createReporter } = require('../services/winter/diagnostic-reporter');
const { createHandler } = require('../services/winter/runtime');
const battle = require('../services/winter/battle');
const { createLive } = require('../services/winter/live');
async function fixture(t, development = true) {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
  t.after(() => db.close());
  let now = 0, n = 0;
  const economy = createEconomy({ sequelize: db, clock: () => now, allowRestart: development, random: () => .99, dropRandom: () => .99 });
  const run = (action = 'status', extra = {}) => economy.execute({ guildId: 'g', userId: 'p', interactionId: `diag-${++n}`, action, ...extra });
  const configure = (mode, extra = {}) => run('diagnostic', { admin: true, diagnostic: { mode, channelId: 'c', ...extra } });
  return { db, economy, run, configure, at: value => { now = value; } };
}

test('1x/2x/5x speed transitions are prospective and stop restores 1x without rewinding', async t => {
  const f = await fixture(t);
  await f.run();
  f.at(1000);
  assert.equal((await f.configure('start', { speed: 2 })).player.snow, 11);
  f.at(2000);
  let r = await f.run();
  assert.equal(r.player.snow, 13); assert.equal(r.now, 3000);
  await f.configure('start', { speed: 5 });
  f.at(3000); r = await f.run();
  assert.equal(r.player.snow, 18); assert.equal(r.now, 8000);
  await f.configure('stop');
  f.at(4000); r = await f.run();
  assert.equal(r.player.snow, 19); assert.equal(r.now, 9000);
  assert.equal(r.diagnostic.speed, 1); assert.equal(r.diagnostic.enabled, false);
  const settings = await f.configure('status');
  assert.equal(settings.now, 9000);
});

test('development diagnostics require admin and validate options before opening any tables', async t => {
  const f = await fixture(t);
  await assert.rejects(f.run('diagnostic', { diagnostic: { mode: 'start', speed: 5, channelId: 'c' } }), /administrators/);
  for (const diagnostic of [{ mode: 'start', speed: 3, channelId: 'c' }, { mode: 'start', reportMinutes: -1, channelId: 'c' },
    { mode: 'start', reportMinutes: 1.5, channelId: 'c' }, { mode: 'stop', speed: 5 }, { mode: 'start' }]) {
    await assert.rejects(f.run('diagnostic', { admin: true, diagnostic }));
  }
  const [tables] = await f.db.query("SELECT name FROM sqlite_master WHERE type='table'");
  assert.equal(tables.length, 0);
  const prod = await fixture(t, false);
  await assert.rejects(prod.configure('start', { speed: 2 }), /administrators/);
  assert.deepEqual(await prod.economy.dueDiagnostics(), []);
  assert.deepEqual(await prod.economy.pendingDiagnosticReports(), []);
});

test('a speed configuration is receipt-deduped; changed configuration cannot reuse its interaction ID', async t => {
  const f = await fixture(t), options = { admin: true, interactionId: 'one', diagnostic: { mode: 'start', speed: 2, channelId: 'c' } };
  const r = await f.run('diagnostic', options);
  f.at(60000);
  assert.deepEqual(await f.run('diagnostic', options), r);
  await assert.rejects(f.run('diagnostic', { ...options, diagnostic: { ...options.diagnostic, speed: 5 } }), /identity mismatch/);
  assert.equal((await f.run()).diagnostic.speed, 2);
});

test('settings and clock anchors survive a fresh economy instance using the same SQLite', async t => {
  const f = await fixture(t);
  await f.configure('start', { speed: 5, reportMinutes: 2 });
  const other = createEconomy({ sequelize: f.db, clock: () => 60000, allowRestart: true });
  const r = await other.execute({ guildId: 'g', userId: 'p', interactionId: 'reopened', action: 'status' });
  assert.equal(r.player.snow, 310); assert.equal(r.now, 300000);
  assert.equal(r.diagnostic.reportMinutes, 2);
});

test('the worker sees game-time attacks due at 5x before their wall-clock timestamp', async t => {
  const f = await fixture(t);
  await f.configure('start', { speed: 5 });
  const state = battle.freshBattle(); state.sturdyOwned = 1; battle.startBattle(state, 0);
  await f.db.query('UPDATE WinterBattles SET active=1,nextAt=3000,state=$state', { bind: { state: JSON.stringify(state) } });
  f.at(599); assert.equal((await f.economy.dueBattles()).length, 0);
  f.at(600); assert.equal((await f.economy.dueBattles()).length, 1);
  const r = await f.run('battle-tick');
  assert.equal(r.battle.throws, 1); assert.equal(r.battle.nextPlayerAt, 6000);
  f.at(1200); assert.equal((await f.economy.dueBattles()).length, 1);
});

test('reports use real minutes and include interval/cumulative net changes without duplicate claims', async t => {
  const f = await fixture(t);
  await f.configure('start', { speed: 5, reportMinutes: 1 });
  f.at(59999); assert.deepEqual(await f.economy.dueDiagnostics(), []);
  f.at(60000); assert.equal((await f.economy.dueDiagnostics()).length, 1);
  await f.run('diagnostic-report', { admin: true });
  const [pending] = await f.economy.pendingDiagnosticReports();
  assert(pending);
  const report = await f.economy.claimDiagnosticReport(pending.id);
  assert.match(JSON.stringify(report.payload), /Snow: \+300 \/ \+300/);
  assert.match(report.payload.embeds[0].description, /1 real minutes · 5 game minutes/);
  assert.deepEqual(report.payload.allowedMentions, { parse: [] });
  assert.equal(await f.economy.claimDiagnosticReport(pending.id), null);
  await f.economy.finishDiagnosticReport(pending.id, true);
  f.at(120000); await f.run('diagnostic-report', { admin: true });
  const [next] = await f.economy.pendingDiagnosticReports();
  assert.match(JSON.stringify((await f.economy.claimDiagnosticReport(next.id)).payload), /Snow: \+300 \/ \+600/);
});

test('one catch-up report replaces missed report intervals; stopping cancels unsent reports', async t => {
  const f = await fixture(t);
  await f.configure('start', { speed: 2, reportMinutes: 1 });
  f.at(600000); await f.run('diagnostic-report', { admin: true });
  assert.equal((await f.economy.pendingDiagnosticReports()).length, 1);
  assert.equal((await f.configure('status')).diagnostic.nextReportAt, 660000);
  await f.configure('stop');
  assert.deepEqual(await f.economy.pendingDiagnosticReports(), []);
  f.at(720000); assert.deepEqual(await f.economy.dueDiagnostics(), []);
});

test('reporting records spent resources and all recorded training/unlock changes as signed nets', () => {
  const receipt = { player: { snow: 1000, diamonds: 2 }, kitchen: { spicy: 5 }, battle: { sweat: 10, buttons: 1, gym: { strength: 0 }, throws: 0, dirtyUnlocked: 0 } };
  const baseline = D.snapshot(receipt);
  receipt.player.snow = 20; receipt.kitchen.spicy = 3; receipt.battle.sweat = 9;
  receipt.battle.gym.strength = 1; receipt.battle.dirtyUnlocked = 1; receipt.battle.throws = 2;
  const payload = D.report({ speed: 2, startedRealAt: 0, startedGameAt: 0, baseline, previous: baseline }, D.snapshot(receipt), 60000, 120000);
  const json = JSON.stringify(payload);
  assert.match(json, /Snow: -980 \/ -980/); assert.match(json, /strength: \+1 \/ \+1/);
  assert.match(json, /dirtyUnlocked: \+1 \/ \+1/); assert.match(json, /Spicy: -2 \/ -2/);
  assert(json.length < 6000);
});

test('report worker serializes pulses and never automatically resends an uncertain send', async t => {
  const f = await fixture(t); await f.configure('start', { speed: 2, reportMinutes: 1 }); f.at(60000);
  let sends = 0;
  const reporter = createReporter({ getEconomy: () => f.economy, getClient: () => ({ channels: { fetch: async () => ({ guildId: 'g', send: async () => { sends++; throw Error('Uncertain send'); } }) } }),
    allowed: () => true, claim: () => () => {}, logger: { error() {} } });
  await Promise.all([reporter.pulse(), reporter.pulse()]);
  await reporter.pulse();
  assert.equal(sends, 1);
  const [[row]] = await f.db.query('SELECT status FROM WinterDiagnosticReports');
  assert.equal(row.status, 'failed');
});

test('diagnostic runtime rejects production/non-admin use and uses only the invoking profile', async () => {
  let calls = 0, payload;
  const interaction = { guildId: 'g', channelId: 'c', id: 'i', user: { id: 'p' }, memberPermissions: { has: () => true },
    options: { getSubcommand: () => 'diagnostic', getString: () => 'start', getInteger: name => name === 'speed' ? 5 : 2 },
    reply: async value => { payload = value; }, deferReply: async () => {}, editReply: async value => { payload = value; } };
  const getEconomy = () => ({ execute: async args => { calls++; assert.equal(args.userId, 'p'); return { diagnostic: { enabled: true, speed: 5, reportMinutes: 2, channelId: 'c' } }; } });
  await createHandler({ getEconomy, authorize: () => null, environment: () => 'production' })(interaction);
  assert.equal(calls, 0); assert.match(payload.content, /administrators/);
  interaction.memberPermissions.has = () => false;
  await createHandler({ getEconomy, authorize: () => null, environment: () => 'development' })(interaction);
  assert.equal(calls, 0);
  interaction.memberPermissions.has = () => true;
  await createHandler({ getEconomy, authorize: () => null, environment: () => 'development' })(interaction);
  assert.equal(calls, 1); assert.match(payload.embeds[0].toJSON().description, /5×/);
});

test('slash definition exposes diagnostics in development and excludes it in production', () => {
  const file = require.resolve('../commands/Winter/Snow'), previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'development'; delete require.cache[file];
    const dev = require(file).data.toJSON();
    const option = dev.options.find(o => o.name === 'diagnostic');
    assert.deepEqual(option.options.find(o => o.name === 'speed').choices.map(c => c.value), [1, 2, 5]);
    process.env.NODE_ENV = 'production'; delete require.cache[file];
    assert(!require(file).data.toJSON().options.some(o => o.name === 'diagnostic'));
  } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; delete require.cache[file]; }
});

test('speed is isolated to one player; a separate normal profile keeps real-time production', async t => {
  const f = await fixture(t);
  await f.configure('start', { speed: 5 });
  await f.run('status', { userId: 'normal' });
  f.at(60000);
  assert.equal((await f.run()).player.snow, 310);
  const ordinary = await f.run('status', { userId: 'normal' });
  assert.equal(ordinary.player.snow, 70);
  assert.equal(ordinary.diagnostic, undefined);
});

test('successful report delivery is marked sent and a changed guild destination cannot receive it', async t => {
  const f = await fixture(t); await f.configure('start', { speed: 2, reportMinutes: 1 });
  let sends = 0, channelGuild = 'g';
  const reporter = createReporter({ getEconomy: () => f.economy,
    getClient: () => ({ channels: { fetch: async () => ({ guildId: channelGuild, send: async payload => { sends++; assert.equal(payload.embeds.length, 1); } }) } }),
    allowed: () => true, claim: () => () => {}, logger: { error() {} } });
  f.at(60000); await reporter.pulse();
  assert.equal(sends, 1);
  assert.equal((await f.db.query('SELECT status FROM WinterDiagnosticReports'))[0][0].status, 'sent');
  channelGuild = 'other'; f.at(120000); await reporter.pulse();
  assert.equal(sends, 1);
  assert.equal((await f.db.query("SELECT count(*) AS n FROM WinterDiagnosticReports WHERE status='failed'"))[0][0].n, 1);
});

test('live cooldown displays follow the accelerated game clock without extra timers', async () => {
  let real = 0, renderedNow;
  const live = createLive({ now: () => real, getEconomy: () => ({ dueBattles: async () => [] }),
    render: (_receipt, _view, options) => { renderedNow = options.now; return { components: [] }; } });
  await live.show({ guildId: 'g', user: { id: 'p' }, editReply: async () => {} },
    { now: 0, realNow: 0, diagnostic: { speed: 5 }, battle: { active: 1, specialReadyAt: 3000 } }, 'fight', true);
  real = 599; await live.pulse(); assert.equal(live.views.get('g:p').cooldown, true);
  real = 600; await live.pulse(); await live.flush();
  assert.equal(live.views.get('g:p').cooldown, false);
  assert.equal(renderedNow, 3000);
});
