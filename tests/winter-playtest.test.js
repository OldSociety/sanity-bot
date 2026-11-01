const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');
const M = require('../services/winter/playtest-model');
const { createStore } = require('../services/winter/playtest-store');
const { createRuntime } = require('../services/winter/playtest-runtime');
const { screen } = require('../services/winter/playtest-presentation');
async function fixture(t, options = {}) {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }); t.after(() => db.close());
  let now = 0, id = 0;
  const store = createStore({ sequelize: db, clock: () => now, seed: () => 314159, ...options });
  const run = (action = 'status', extra = {}) => store.execute({ guildId: 'g', userId: 'u', id: String(++id), action, ...extra });
  const start = (extra = {}) => run('diagnostic', { diagnostic: { mode: 'start', speed: 1, bookmark: 'chapter1', stopAt: 'chapter1', reportMinutes: 0, channelId: 'c', ...extra } });
  return { db, store, run, start, at: n => { now = n; }, advance: n => { now += n; } };
}
test('bookmark and shared Gym model: STR1 + 5 Sweat buys precisely STR2 and STR3', () => {
  const s = M.fresh('chapter1', 1); s.gymUnlocked = true;
  M.action(s, 'train'); assert.equal(s.strength, 1); assert.equal(s.wallet.sweat, 5);
  M.action(s, 'train-strength'); assert.equal(s.wallet.sweat, 3);
  M.action(s, 'train-strength'); assert.equal(s.strength, 3); assert.equal(s.wallet.sweat, 0);
  M.action(s, 'train'); assert.equal(s.wallet.sweat, 0);
  M.change(s, 'sweat', 10000, 'fixture'); s.strength = 25; s.accuracy = 1;
  const before = s.wallet.sweat; M.action(s, 'train-strength'); assert.equal(before - s.wallet.sweat, 27);
});
test('Hendrix introduction has exactly one button through two distinct Strength purchases', () => {
  const s = M.fresh('chapter1'); s.gymUnlocked = true; M.action(s, 'train');
  const render = action => screen({ state: s, run: null, action }, '123456789012345678');
  const onlyStrength = output => { assert.equal(output.components.length, 1); assert.equal(output.components[0].components.length, 1); assert.match(output.components[0].components[0].data.custom_id, /:train-strength:1$/); };
  let output = render('train'); onlyStrength(output);
  assert.equal(output.embeds[0].data.description, '_You’ve worked up quite a sweat already. To get started, invest it towards reaching Level 3._');
  assert.equal(s.wallet.sweat, 5); assert.match(output.components[0].components[0].data.label, /2💦/);
  for (const action of ['shop', 'throw', 'kitchen', 'diamonds', 'status', 'help']) onlyStrength(render(action));
  for (const action of ['shop', 'throw', 'buy-spicy', 'train-accuracy', 'equip-red']) assert.throws(() => M.action(s, action), /lessons/);
  assert.throws(() => M.action(s, 'train-strength', 'max'), /once per lesson/);
  M.action(s, 'train-strength', '1'); assert.equal(s.strength, 2); assert.equal(s.wallet.sweat, 3);
  output = render('train-strength'); onlyStrength(output); assert.match(output.components[0].components[0].data.label, /3💦/);
  M.action(s, 'train-strength', '1'); assert.equal(s.strength, 3); assert.equal(s.wallet.sweat, 0);
  output = render('train-strength'); assert(output.components.flatMap(row => row.components).some(b => b.data.label === 'Strength · 4💦'));
  assert.match(output.embeds[0].data.fields.find(f => f.name === 'Lessons complete').value, /\/snow throw/);
});
test('starting commands retain tutorial navigation without unrelated crafting/attack controls', () => {
  const s = M.fresh('chapter0');
  const actions = output => output.components.flatMap(row => row.components).map(b => b.data.custom_id.split(':')[4]);
  for (const action of ['status', 'help', 'shop', 'kitchen', 'train', 'diamonds', 'emporium', 'diagnostic', 'admin', 'hidden', 'slots']) {
    const output = screen({ state: s, run: null, action }, 'u');
    assert.deepEqual(actions(output), action === 'admin' ? [] : ['throw'], `${action} should guide the player to Throw`);
    assert(!(output.embeds[0].data.fields || []).some(f => f.name === 'Throw'), `${action} fell through to Throw`);
  }
  const output = screen({ state: s, run: null, action: 'throw' }, 'u');
  assert.deepEqual(actions(output), ['attack', 'craft', 'craft', 'throw']);
  assert.equal(output.embeds[0].data.title, 'Training Dummy');
  for (const action of ['craft', 'attack']) assert.deepEqual(actions(screen({ state: s, run: null, action }, 'u')), ['attack', 'craft', 'craft', 'throw']);
});
test('unlocked locations restore contextual navigation; status/help never become combat screens', () => {
  const s = M.fresh('gym'); s.iceRecipe = true; s.gymLiftRevealed = true;
  const controls = action => screen({ state: s, run: null, action }, 'u').components.flatMap(r => r.components).map(b => b.data.custom_id.split(':')[4]);
  assert.deepEqual(controls('status'), ['diamonds', 'shop', 'throw']); assert.deepEqual(controls('help'), ['throw', 'shop']);
  assert.deepEqual(controls('train'), ['train-strength', 'lift']);
  for (const action of ['shop', 'buy-spicy', 'buy-ice', 'kitchen', 'diamonds', 'emporium']) {
    for (const control of controls(action)) assert(!['craft', 'attack', 'attack-spicy', 'status'].includes(control), `${action} leaked ${control}`);
  }
  const fresh = M.fresh('chapter0'); fresh.dummyHp = 0;
  assert.deepEqual(screen({ state: fresh, run: null, action: 'throw' }, 'u').components.flatMap(r => r.components).map(b => b.data.custom_id.split(':')[4]), ['shop']);
  const shop = screen({ state: fresh, run: null, action: 'shop' }, 'u');
  assert.deepEqual(shop.components.flatMap(r => r.components).map(b => b.data.custom_id.split(':')[4]), ['shop-help']);
  M.action(fresh, 'shop-help'); M.action(fresh, 'beg'); M.action(fresh, 'buy-snowman');
  const purchased = screen({ state: fresh, run: null, action: 'buy-snowman' }, 'u');
  purchased.embeds[0].toJSON(); assert.deepEqual(purchased.components.flatMap(r => r.components).map(b => b.data.custom_id.split(':')[4]), ['shop', 'throw']);
  assert.match(purchased.embeds[0].data.description, /`\/snow throw`/);
});
test('Gym lessons show only the five starter Sweat while earned Sweat is preserved and restored', () => {
  const s = M.fresh('chapter1'); s.gymUnlocked = true;
  M.change(s, 'sweat', 12, 'combat'); M.action(s, 'train');
  assert.equal(s.wallet.sweat, 5); assert.equal(s.gymLessonReserve, 12); M.validate(s);
  M.change(s, 'sweat', 2, 'combat'); assert.equal(s.wallet.sweat, 5); assert.equal(s.gymLessonReserve, 14); M.validate(s);
  M.action(s, 'train-strength', '1'); assert.equal(s.wallet.sweat, 3); M.validate(s);
  const saved = JSON.parse(JSON.stringify(s)); M.settle(saved, 0); assert.equal(saved.wallet.sweat, 3); assert.equal(saved.gymLessonReserve, 14);
  M.action(saved, 'train-strength', '1'); assert.equal(saved.strength, 3); assert.equal(saved.wallet.sweat, 14); assert.equal(saved.gymLessonReserve, undefined); M.validate(saved);
  M.action(saved, 'train'); assert.equal(saved.wallet.sweat, 14);
});
test('Gym lesson clicks are receipt-deduped and cannot skip the second purchase', async t => {
  const f = await fixture(t); await f.start();
  const [[row]] = await f.db.query('SELECT state FROM WinterPlaytestRuns WHERE id=1');
  const state = JSON.parse(row.state); state.gymUnlocked = true; state.gymEntered = false; state.strength = 0;
  await f.db.query('UPDATE WinterPlaytestRuns SET state=$state WHERE id=1', { bind: { state: JSON.stringify(state) } });
  const enter = await f.run('train'); assert.equal(enter.state.strength, 1); assert.equal(enter.state.wallet.sweat, 5);
  const input = { id: 'first-lesson', kind: 'button', quantity: '1' };
  const first = await f.run('train-strength', input); assert.equal(first.state.strength, 2); assert.equal(first.state.wallet.sweat, 3);
  assert.deepEqual(await f.run('train-strength', input), first);
  const blocked = await f.run('throw'); assert.equal(blocked.outcome, 'rejected'); assert.equal(blocked.state.strength, 2);
  const second = await f.run('train-strength', { kind: 'button', quantity: '1' }); assert.equal(second.state.strength, 3); assert.equal(second.state.wallet.sweat, 0);
  const reenter = await f.run('train'); assert.equal(reenter.state.wallet.sweat, 0);
});
test('continuous retries, fractional accrual, RNG and attack timing match arbitrary captures and >4h gaps', () => {
  const a = M.fresh('gym', 17); M.action(a, 'throw');
  const b = structuredClone(a), end = 26 * 3600000 + 123;
  M.settle(a, end);
  for (let at = 73111; at < end; at += 73111) M.settle(b, at);
  M.settle(b, end); assert.deepEqual(a, b);
  assert.equal(a.tiers[1].attacks, Math.floor(end / 3000)); assert(a.tiers[1].losses > 0);
  assert.equal(a.penalized, true); assert(a.ledger.sources['passive:sweat:gained'] > 0);
  assert.equal(a.snowRemainder, 428); assert.equal(a.sweatRemainder, 123);
});
test('throw restores accuracy without resetting player cadence; supply exhaustion falls back', () => {
  const s = M.fresh('gym', 12); M.change(s, 'red', 2, 'fixture'); M.action(s, 'equip-red'); M.action(s, 'throw');
  M.settle(s, 9101); assert.equal(s.tiers[1].red, 2); assert.equal(s.tiers[1].regular, 1);
  s.penalized = true; const next = s.nextPlayerAt, hp = s.enemyHp; M.action(s, 'throw');
  assert.equal(s.penalized, false); assert.equal(s.nextPlayerAt, next); assert.equal(s.enemyHp, hp);
});
test('passive snowball buttons reflect selected, available and discovered ammunition', () => {
  const s = M.fresh('gym'); M.change(s, 'snow', 100, 'fixture');
  const output = () => screen({ state: s, run: null, action: 'throw' }, 'u');
  const choices = () => output().components.flatMap(r => r.components).filter(b => b.data.custom_id.includes(':equip-'));
  let buttons = choices(); assert.equal(buttons.length, 2); assert.equal(buttons[0].data.style, 3); assert.equal(buttons[0].data.disabled, false);
  assert.equal(buttons[1].data.style, 2); assert.equal(buttons[1].data.disabled, true); assert(!buttons.some(b => b.data.label.includes('Ice')));
  M.change(s, 'red', 2, 'fixture'); M.action(s, 'equip-red');
  buttons = choices(); assert.equal(buttons.find(b => b.data.label.includes('Spicy')).data.style, 3); assert.equal(buttons[0].data.style, 2);
  assert.match(output().embeds[0].data.fields.find(f => f.name === 'Equipped').value, /^\*\*🔴 Spicy\*\*/);
  s.iceRecipe = true; buttons = choices(); assert.equal(buttons.length, 3); assert.equal(buttons[2].data.disabled, true);
  M.change(s, 'ice', 1, 'fixture'); M.action(s, 'equip-ice'); buttons = choices();
  assert.equal(buttons[2].data.style, 3); assert.equal(buttons[2].data.disabled, false); assert.equal(buttons[1].data.style, 2);
});
test('empty ammunition cannot be equipped; fallback retains the preference and resumes on restocking', () => {
  const s = M.fresh('gym', 12);
  assert.throws(() => M.action(s, 'equip-red'), /No ammunition/); assert.throws(() => M.action(s, 'equip-ice'), /not unlocked/);
  assert.throws(() => M.action(s, 'equip-regular'), /No ammunition/);
  M.change(s, 'red', 1, 'fixture'); M.action(s, 'equip-red'); M.action(s, 'throw'); M.settle(s, 6000);
  assert.equal(s.equipped, 'red'); assert.equal(s.tiers[1].red, 1); assert.equal(s.tiers[1].regular, 1);
  const output = screen({ state: s, run: null, action: 'throw' }, 'u');
  const chosen = output.components.flatMap(r => r.components).find(b => b.data.custom_id.includes(':equip-red:'));
  assert.equal(chosen.data.style, 3); assert.equal(chosen.data.disabled, true);
  assert.match(output.embeds[0].data.fields.find(f => f.name === 'Equipped').value, /Currently using ⚪ Regular/);
  const clock = s.nextPlayerAt, hp = s.enemyHp;
  assert.throws(() => M.action(s, 'equip-red'), /No ammunition/); assert.equal(s.nextPlayerAt, clock); assert.equal(s.enemyHp, hp);
  M.change(s, 'red', 1, 'fixture'); M.settle(s, 9000); assert.equal(s.tiers[1].red, 2); assert.equal(s.tiers[1].regular, 1);
});
test('passive equipment selection persists and stale empty-stock controls reject after settlement', async t => {
  const f = await fixture(t); await f.start({ bookmark: 'gym' });
  const [[row]] = await f.db.query('SELECT state FROM WinterPlaytestRuns WHERE id=1'); const state = JSON.parse(row.state);
  M.change(state, 'red', 1, 'fixture'); await f.db.query('UPDATE WinterPlaytestRuns SET state=$state WHERE id=1', { bind: { state: JSON.stringify(state) } });
  await f.run('equip-red'); await f.run('throw'); f.at(6000);
  const stale = await f.run('equip-red', { kind: 'button' }); assert.equal(stale.outcome, 'rejected'); assert.equal(stale.state.equipped, 'regular'); assert.equal(stale.state.tiers[1].regular, 1);
  const reopened = createStore({ sequelize: f.db, clock: () => 9000 });
  const r = await reopened.execute({ guildId: 'g', userId: 'u', id: 'equipment-reopen', action: 'status' });
  assert.equal(r.state.equipped, 'regular'); assert.equal(r.state.tiers[1].regular, 2); assert.equal(r.state.tiers[1].red, 1);
});
test('Stone celebration precedes Chapter0 acknowledgement and atomic diagnostic completion', async t => {
  const f = await fixture(t); await f.start({ bookmark: 'chapter0', stopAt: 'stone' });
  const click = async (a, quantity) => { f.advance(30000); const r = await f.run(a, { kind: 'button', quantity }); assert.equal(r.outcome, 'ok', r.message); return r; };
  for (let n = 0; n < 5; n++) { await click('craft'); await click('attack'); }
  await click('shop-help'); await click('beg'); await click('buy-snowman');
  await click('craft', '10'); for (let n = 0; n < 3; n++) await click('attack');
  for (let n = 0; n < 3; n++) await click('pepper'); await click('mix');
  f.advance(4000000); const gift = await click('shop'); assert.equal(gift.state.wallet.red, 10);
  for (let n = 0; n < 5; n++) await click('attack-spicy');
  await click('diamonds-convert', '1'); await click('buy-sturdy'); await click('throw');
  f.advance(4000000); await click('throw'); await click('train'); await click('train-strength'); await click('train-strength');
  await click('diamonds-convert', '1');
  const unlock = await click('buy-old-stone'); assert.equal(unlock.run.status, 'active'); assert.equal(unlock.state.chapter0Pending, true);
  const celebration = screen(unlock, 'u'); assert.equal(celebration.embeds[0].data.title, 'New Shovel Unlocked!');
  assert.deepEqual(celebration.components.flatMap(r => r.components).map(b => b.data.label), ['End of Chapter 0']);
  assert.equal(await f.store.claimReport(), null);
  const final = await click('end-chapter0');
  assert.equal(final.state.chapter, 1); assert.equal(final.state.tier, 2); assert.equal(final.run.status, 'completed');
  f.advance(99999999); const after = await f.run('throw'); assert.deepEqual(after.state, final.state);
  assert.equal(after.run.gameElapsedMs, final.run.gameElapsedMs);
  const [[row]] = await f.db.query('SELECT result FROM WinterPlaytestRuns'); assert.equal(JSON.parse(row.result).status, 'completed');
  const recap = await f.store.claimReport(); assert.equal(recap.payload.kind, 'run-ended'); assert.equal(recap.payload.status, 'completed');
  assert(recap.payload.timeline.some(e => e.name.includes('Stone shovel'))); assert.equal(await f.store.claimReport(), null);
});
test('manual completion always queues one searchable public recap even with interval reports off', async t => {
  const f = await fixture(t); await f.start(); f.at(3600000);
  const input = { id: 'manual-end', diagnostic: { mode: 'stop' }, raw: { displayName: 'Test Player' } };
  await f.run('diagnostic', input); await f.run('diagnostic', input); await f.run('status');
  const report = await f.store.claimReport(); assert.equal(report.payload.label, 'WINTER-RUN-000001');
  assert.equal(report.payload.kind, 'run-ended'); assert.equal(report.payload.gained.snow, 129600);
  assert.equal(report.payload.realElapsedMs, 3600000); assert.equal(report.payload.displayName, 'Test Player');
  assert.equal(report.payload.counts.reduce((n, r) => n + r.count, 0), 2);
  assert.equal(await f.store.claimReport(), null);
  const { recapMessage } = require('../services/winter/playtest-recap');
  const message = recapMessage(report.payload), embed = message.embeds[0].toJSON();
  assert.match(message.content, /WINTER-RUN-000001/); assert.match(message.content, /Test Player/); assert.match(embed.title, /Stopped manually/);
  assert.equal(message.ephemeral, undefined); assert.equal(message.flags, undefined);
  assert.deepEqual(message.allowedMentions, { parse: [] }); assert.match(JSON.stringify(embed), /129,600/);
  assert(embed.fields.some(x => x.name === 'Resources supplied at the bookmark'));
  assert(embed.fields.some(x => x.name === 'Resources remaining'));
});
test('run-end recap insertion rolls back with the ending transaction', async t => {
  let fail = false; const f = await fixture(t, { beforeCommit: async () => { if (fail) throw Error('rollback-end'); } });
  await f.start(); fail = true;
  await assert.rejects(f.run('diagnostic', { diagnostic: { mode: 'stop' } }), /rollback-end/);
  const [[r]] = await f.db.query('SELECT status FROM WinterPlaytestRuns'); assert.equal(r.status, 'active');
  assert.equal(await f.store.claimReport(), null);
  fail = false; await f.run('diagnostic', { diagnostic: { mode: 'stop' } }); assert.equal((await f.store.claimReport()).payload.kind, 'run-ended');
});
test('starting a replacement run publishes the saved previous run recap', async t => {
  const f = await fixture(t); await f.start(); f.at(1000); await f.start({ speed: 5 });
  const recap = await f.store.claimReport(); assert.equal(recap.runId, 1); assert.equal(recap.payload.status, 'superseded'); assert.equal(recap.payload.realElapsedMs, 1000);
  assert.equal(await f.store.claimReport(), null);
});
test('public recap uses only gains/combat since bookmark and keeps inherited unlocks separate', async t => {
  const f = await fixture(t); await f.start({ bookmark: 'iron' }); await f.run('diagnostic', { diagnostic: { mode: 'stop' } });
  const { payload } = await f.store.claimReport(); assert.equal(payload.startingBalances.snow, 610300); assert.equal(payload.gained.snow, 0);
  assert.equal(payload.tierChanges[1].wins, 0); assert.equal(payload.tiers[1].wins, 103);
  assert(!payload.timeline.some(e => e.name.includes('Iron shovel')));
  assert(payload.inherited.some(name => name.includes('S2 owned')));
});
test('recap keeps exact simulated milestone timing and respects Discord limits with long runs', async t => {
  const { buildRecap, recapMessage } = require('../services/winter/playtest-recap');
  const { summary } = require('../services/winter/playtest-store');
  const base = M.fresh('chapter1'), final = structuredClone(base);
  final.now = 7200000; final.gymUnlocked = true; final.gymEntered = true; final.strength = 25;
  final.milestones = { ...base.milestones, firstLoss: 123000, gym: 4000000, strength25: 7000000 };
  const run = { id: 123, userId: 'u', state: final, baseline: base, status: 'stopped', speed: 5, startedAt: 1000, updatedAt: 1441000, endedAt: 1441000, bookmark: 'chapter1', stopAt: 'chapter1' };
  const logs = [{ beforeState: JSON.stringify(base), afterState: JSON.stringify(final) }];
  const counts = Array.from({ length: 300 }, (_, i) => ({ kind: 'button', action: `example-action-${i}`, count: i + 1, outcome: 'ok' }));
  const recap = buildRecap(run, summary(run), logs, counts, '@everyone');
  assert.equal(recap.timeline.find(e => e.name.includes('first defeat')).gameAt, 123000);
  assert.equal(recap.timeline.find(e => e.name.includes('first defeat')).realElapsedMs, 24600);
  const message = recapMessage(recap), embed = message.embeds[0]; embed.toJSON();
  assert(embed.length <= 6000); assert(embed.data.fields.length <= 25); assert(embed.data.fields.every(f => f.value.length <= 1024));
  assert(message.files.length === 1); assert.match(message.files[0].attachment.toString(), /example-action-299/);
});
test('runtime sends the recap publicly through the durable outbox, never as an ephemeral reply', async t => {
  const f = await fixture(t); await f.start(); await f.run('diagnostic', { diagnostic: { mode: 'stop' } });
  const sent = [], runtime = createRuntime({ store: f.store });
  runtime.start({ isReady: () => true, once: () => {}, channels: { fetch: async () => ({ guildId: 'g', isTextBased: () => true, send: async message => { sent.push(message); return { id: 'public-message' }; } }) } });
  t.after(() => runtime.stop());
  // Start pulses asynchronously; wait for its already-running store queue to drain.
  for (let n = 0; n < 50 && !sent.length; n++) await new Promise(r => setTimeout(r, 10));
  assert.equal(sent.length, 1); assert.match(sent[0].content, /WINTER-RUN-000001/); assert.equal(sent[0].ephemeral, undefined);
  // Finish the in-flight send bookkeeping before reading its durable link.
  for (let n = 0; n < 50; n++) { const [[row]] = await f.db.query('SELECT status,payload FROM WinterPlaytestOutbox'); if (row.status === 'sent') { assert.equal(JSON.parse(row.payload).messageId, 'public-message'); break; } await new Promise(r => setTimeout(r, 10)); }
  await runtime.pulse(); assert.equal(sent.length, 1);
});
test('numbering persists, starts do not overwrite normal/legacy data, and new runs retain previous evidence', async t => {
  const f = await fixture(t);
  await f.db.query('CREATE TABLE WinterPlayers (test TEXT)'); await f.db.query("INSERT INTO WinterPlayers VALUES ('preserve')");
  const normal = await f.run(); const a = await f.start(); f.at(3600000); const b = await f.start({ speed: 5, bookmark: 'gym' });
  assert.equal(b.run.run, a.run.run + 1);
  const reopened = createStore({ sequelize: f.db, clock: () => 3601000 });
  const r = await reopened.execute({ guildId: 'g', userId: 'u', id: 'reopen', action: 'status' }); assert.equal(r.state.now, 5000);
  const [[old]] = await f.db.query('SELECT * FROM WinterPlaytestRuns WHERE id=1'); assert.equal(old.status, 'superseded');
  const [[profile]] = await f.db.query('SELECT state FROM WinterPlaytestProfiles'); assert.deepEqual(JSON.parse(profile.state), normal.state);
  const [[legacy]] = await f.db.query('SELECT * FROM WinterPlayers'); assert.equal(legacy.test, 'preserve');
});
test('exact gross ledger and per-command/button counts persist; duplicates never count or award twice', async t => {
  const f = await fixture(t); await f.start(); f.at(3600000);
  const input = { id: 'same', kind: 'button', quantity: '10' };
  const a = await f.run('diamonds-convert', input), b = await f.run('diamonds-convert', input);
  assert.deepEqual(a, b); assert.equal(a.run.gained.snow, 129600); assert.equal(a.run.spent.snow, 10000);
  assert.equal(a.state.wallet.diamonds, 10); assert.equal(a.counts.find(r => r.action === 'diamonds-convert').count, 1);
  await assert.rejects(f.run('craft', input), /identity mismatch/);
  const [[log]] = await f.db.query("SELECT * FROM WinterPlaytestInteractions WHERE id='same'");
  assert.equal(JSON.parse(log.deltas).gained.snow, 129600); assert.equal(JSON.parse(log.deltas).spent.snow, 10000);
  assert.equal(JSON.parse(log.beforeState).wallet.snow, 0); assert.equal(JSON.parse(log.settledState).wallet.snow, 129600);
});
test('atomic failure rolls back resource changes, interaction and checkpoint together', async t => {
  let fail = false;
  const f = await fixture(t, { beforeCommit: async () => { if (fail) throw Error('injected'); } });
  await f.start(); fail = true; f.at(3600000);
  await assert.rejects(f.run('diamonds-convert', { id: 'rollback', quantity: '10' }), /injected/);
  const [[row]] = await f.db.query('SELECT state FROM WinterPlaytestRuns'); assert.equal(JSON.parse(row.state).wallet.snow, 0);
  const [logs] = await f.db.query("SELECT * FROM WinterPlaytestInteractions WHERE id='rollback'"); assert.equal(logs.length, 0);
  fail = false; const r = await f.run('diamonds-convert', { id: 'rollback', quantity: '10' }); assert.equal(r.state.wallet.diamonds, 10);
});
test('simultaneous commands and captures serialize, credit elapsed time once and preserve rejected attempts', async t => {
  const f = await fixture(t); await f.start(); f.at(3600000);
  const [a, b, c] = await Promise.all([f.run('capture', { kind: 'system' }), f.run('diamonds-convert', { quantity: '10' }), f.run('buy-ice', { quantity: '1' })]);
  assert.equal(a.state.wallet.snow, 129600); assert.equal(b.state.wallet.snow, 119600);
  assert.equal(c.outcome, 'rejected'); assert.equal(c.state.wallet.snow, 119600);
  const [[row]] = await f.db.query('SELECT state FROM WinterPlaytestRuns'); assert.equal(JSON.parse(row.state).ledger.gained.snow, 129600);
});
test('stale/foreign/denied controls are counted without settlement or mutation', async t => {
  const f = await fixture(t); const a = await f.start(); f.at(3600000);
  const stale = await f.run('iron', { kind: 'button', expectedRun: '999' });
  assert.equal(stale.outcome, 'denied'); assert.equal(stale.state.now, 0);
  const r = await f.run('throw', { kind: 'button', denied: 'Not yours.' }); assert.equal(r.outcome, 'denied');
  assert.equal(r.run.run, a.run.run); assert.equal(r.counts.filter(x => x.outcome === 'denied').length, 2);
});
test('scheduled reports run only when due, send total exact changes, and have durable claim-once delivery', async t => {
  const f = await fixture(t); await f.start({ speed: 5, reportMinutes: 1 });
  f.at(59999); assert.deepEqual(await f.store.due(), []);
  f.at(60000); const [due] = await f.store.due(); assert(due);
  await f.run('capture', { kind: 'system', id: `report:${due.id}:${due.lastReportAt}` });
  assert.deepEqual(await f.store.due(), []);
  const report = await f.store.claimReport(); assert.equal(report.payload.gained.snow, 10800); assert.equal(report.payload.gameElapsedMs, 300000);
  assert.equal(await f.store.claimReport(), null); await f.store.delivered(report.id);
  const [[r]] = await f.db.query('SELECT status FROM WinterPlaytestOutbox'); assert.equal(r.status, 'sent');
});
test('saved runs export exact logs and cannot be read by another account', async t => {
  const f = await fixture(t); await f.start(); f.at(1000); await f.run('status'); await f.run('diagnostic', { diagnostic: { mode: 'stop' } });
  const r = await f.run('diagnostic', { diagnostic: { mode: 'export', runId: 1 } });
  assert.equal(r.run.status, 'stopped'); assert(r.export.interactions.length >= 4); assert(r.export.checkpoints.length >= 3);
  const other = await f.run('diagnostic', { userId: 'other', diagnostic: { mode: 'export', runId: 1 } }); assert.equal(other.outcome, 'rejected'); assert.equal(other.export, undefined);
});
test('Iron costs 2m and requires the lift; S3 costs 5m and 100 S2 wins without an extra Iron rule', () => {
  const s = M.fresh('gym'); M.change(s, 'snow', 20000000, 'fixture'); s.strength = 25;
  assert.throws(() => M.action(s, 'iron'), /lift/); M.action(s, 'lift'); M.action(s, 'iron'); assert.equal(s.tier, 3); assert.equal(s.wallet.snow, 18000000);
  s.owned[2] = true; s.tiers[2].wins = 99; assert.throws(() => M.action(s, 'buy-s3'), /100 victories/);
  s.tiers[2].wins = 100; M.action(s, 'buy-s3'); assert.equal(s.wallet.snow, 13000000); assert.equal(s.chapter, 2); assert.equal(s.active, false);
});
test('historical snow-cost simulation retains early Ice; fractional regular damage and per-tier wins persist', () => {
  const s = M.fresh('gym', 42); M.change(s, 'snow', 10000000, 'fixture'); M.action(s, 'buy-ice-recipe'); assert(s.iceRecipe); assert(!s.owned[3]);
  M.action(s, 'throw'); M.settle(s, 3000); if (s.tiers[1].hits) assert(Math.abs(s.enemyHp - (80 - 2.36)) < 1e-9);
  s.tiers[1].wins = 100; M.action(s, 'buy-s2'); M.action(s, 'select-s2'); M.action(s, 'select-s1'); assert.equal(s.enemyHp, 180);
});
test('every screen respects Discord component limits and Mix precedes red Cancel', () => {
  for (const bookmark of ['chapter0', 'chapter1', 'gym', 'iron']) for (const action of ['status', 'shop', 'kitchen', 'train', 'throw', 'diamonds', 'emporium']) {
    const s = M.fresh(bookmark); s.iceRecipe = true;
    const output = screen({ state: s, run: null, action }, '123456789012345678');
    assert(output.components.length <= 5); for (const row of output.components) { assert(row.components.length <= 5); for (const b of row.components) assert(b.data.custom_id.length <= 100); }
    if (action === 'kitchen' && !s.redRecipe && s.roughOwned && s.roughThrows >= 3) { const controls = output.components[0].components; assert.equal(controls[0].data.label, '🌶️'); }
  }
});
test('25lb lift appears on the next Gym visit after STR3 and requires sufficient Strength', () => {
  const s = M.fresh('chapter1'); s.gymUnlocked = true; M.action(s, 'train');
  const show = action => screen({ state: s, run: null, action }, 'u');
  const controls = action => show(action).components.flatMap(r => r.components);
  assert(!controls('train').some(b => b.data.custom_id.includes(':lift:')));
  M.action(s, 'train-strength'); assert(!controls('train-strength').some(b => b.data.custom_id.includes(':lift:')));
  M.action(s, 'train-strength'); assert(!controls('train-strength').some(b => b.data.custom_id.includes(':lift:')));
  M.action(s, 'train'); const lift = controls('train').find(b => b.data.custom_id.includes(':lift:')); assert(lift); assert(!lift.data.disabled);
  assert.equal(M.action(s, 'lift'), "Those scrawny arms can't lift this!"); assert(!s.ironMaterial);
  s.strength = 25; M.action(s, 'lift'); assert(s.ironMaterial); assert(!controls('lift').some(b => b.data.custom_id.includes(':lift:')));
});
test('footer discovers inventories at thresholds, retains zero discoveries and hides regulars after idle starts', () => {
  const s = M.fresh('chapter0'); const footer = () => screen({ state: s, run: null, action: 'status' }, 'u').embeds[0].data.footer.text;
  assert.equal(footer(), 'Available: 10❄️');
  M.action(s, 'craft'); assert.match(footer(), /1⚪/); M.action(s, 'attack'); assert.match(footer(), /0⚪/);
  M.change(s, 'diamonds', 1, 'fixture'); assert.match(footer(), /1💎/); M.change(s, 'diamonds', -1, 'fixture'); assert.match(footer(), /0💎/);
  assert(!footer().includes('💦')); assert(!footer().includes('🔘')); assert(!footer().includes('🔴')); assert(!footer().includes('🔵'));
  s.redRecipe = true; assert.match(footer(), /0🔴/); s.iceRecipe = true; assert.match(footer(), /0🔵/);
  s.owned[1] = true; M.action(s, 'throw'); assert.match(footer(), /0💦/); assert(!footer().includes('⚪'));
  s.active = false; const reopened = JSON.parse(JSON.stringify(s)); M.settle(reopened, 0);
  const saved = screen({ state: reopened, run: null, action: 'shop' }, 'u').embeds[0].data.footer.text; assert(saved.includes('💦')); assert(!saved.includes('⚪'));
  M.change(s, 'buttons', 1, 'fixture'); M.change(s, 'buttons', -1, 'fixture'); assert.match(footer(), /0🔘/);
});
test('fresh and pre-combat pages conceal undiscovered balances and future-currency controls', () => {
  const s = M.fresh('chapter0');
  for (const action of ['status', 'help', 'throw', 'shop', 'kitchen', 'train', 'diamonds', 'emporium']) {
    const output = screen({ state: s, run: null, action }, 'u'), json = JSON.stringify(output);
    for (const emoji of ['💎', '💦', '🔘', '🔴', '🔵']) assert(!json.includes(emoji), `${action} leaked ${emoji}`);
    assert(!output.components.flatMap(r => r.components).some(b => ['Gym', 'Emporium', 'Kitchen', 'Diamond Press'].includes(b.data.label)));
    assert.equal(output.embeds[0].data.footer.text, 'Available: 10❄️');
  }
  const chapter1 = M.fresh('chapter1'); M.change(chapter1, 'diamonds', 1, 'fixture'); M.action(chapter1, 'buy-sturdy');
  const before = screen({ state: chapter1, run: null, action: 'shop' }, 'u').embeds[0].data.footer.text; assert(before.includes('💦'), 'Sturdy purchase starts combat and reveals Sweat immediately');
  M.action(chapter1, 'throw'); const after = screen({ state: chapter1, run: null, action: 'throw' }, 'u').embeds[0].data.footer.text; assert(after.includes('💦')); assert(!after.includes('⚪'));
});
test('Iron bookmark carries the reference checkpoint and reports only new resource gains', async t => {
  const f = await fixture(t); const r = await f.start({ bookmark: 'iron' });
  assert.equal(r.state.wallet.snow, 610300); assert.equal(r.state.wallet.sweat, 4);
  assert.equal(r.state.strength, 25); assert.equal(r.state.tier, 3); assert.equal(r.state.tiers[1].wins, 103); assert.equal(r.state.tiers[2].wins, 12);
  assert.equal(r.state.now, 0); assert.equal(r.state.nextPlayerAt, 3000); assert.equal(r.run.gained.snow || 0, 0);
  f.at(3600000); const after = await f.run(); assert.equal(after.run.gained.snow, 777600);
  assert.equal(after.run.tierChanges[1].wins, 0);
});
test('invalid start settings are audited and preserve the current run', async t => {
  const f = await fixture(t); await f.start();
  const r = await f.start({ speed: 3 }); assert.equal(r.outcome, 'rejected'); assert.equal(r.run.run, 1);
  const badStop = await f.start({ stopAt: 'stone' }); assert.equal(badStop.outcome, 'rejected');
  const [[count]] = await f.db.query("SELECT COUNT(*) AS n FROM WinterPlaytestInteractions WHERE outcome='rejected'"); assert.equal(count.n, 2);
});
test('SQLite runs survive closing and reopening an on-disk connection', async t => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'winter-run-')), file = path.join(folder, 'audit.sqlite');
  let db = new Sequelize({ dialect: 'sqlite', storage: file, logging: false });
  t.after(async () => { if (db) await db.close(); for (const suffix of ['', '-journal', '-wal', '-shm']) if (fs.existsSync(file + suffix)) fs.unlinkSync(file + suffix); fs.rmdirSync(folder); });
  let store = createStore({ sequelize: db, clock: () => 1000, seed: () => 3 });
  await store.execute({ guildId: 'g', userId: 'u', id: 'start', action: 'diagnostic', diagnostic: { mode: 'start', speed: 2, bookmark: 'gym', stopAt: 'chapter1', reportMinutes: 0, channelId: 'c' } });
  await db.close(); db = new Sequelize({ dialect: 'sqlite', storage: file, logging: false });
  store = createStore({ sequelize: db, clock: () => 3601000 });
  const r = await store.execute({ guildId: 'g', userId: 'u', id: 'after-reopen', action: 'status' });
  assert.equal(r.run.run, 1); assert.equal(r.state.now, 7200000); assert.equal(r.run.gained.snow, 259200);
  const [[n]] = await db.query('SELECT COUNT(*) AS n FROM WinterPlaytestInteractions'); assert.equal(n.n, 2);
});
test('handler protects diagnostic controls and records foreign buttons against the actor only', async t => {
  const f = await fixture(t); await f.start();
  const runtime = createRuntime({ store: f.store, isAdmin: () => false });
  const output = [];
  const i = { id: 'foreign', guildId: 'g', channelId: 'c', user: { id: 'u' }, isButton: () => true,
    customId: 'snow:someoneelse:pt:1:iron:1', deferReply: async r => { assert(r.ephemeral); }, editReply: async r => output.push(r) };
  await runtime.handle(i); assert.match(output[0].content, /another player/);
  const [[row]] = await f.db.query("SELECT * FROM WinterPlaytestInteractions WHERE id='foreign'"); assert.equal(row.outcome, 'denied'); assert.equal(row.userId, 'u');
});
