const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');
const M = require('../services/winter/game/game');
const { screen } = require('../services/winter/game/screens');
const { createStore } = require('../services/winter/game/saved-progress');
const controls = out => out.components.flatMap(r => r.components);
function iron() {
  const s = M.fresh('gym', 3); s.liveRules = true; s.strength = 25;
  M.action(s, 'lift'); M.change(s, 'diamonds', 1000, 'fixture');
  M.action(s, 'iron', '1', { shopCurrency: 'diamonds' }); return s;
}

test('first Throw after Iron introduces Azule, persists across returns, and awards the jacket once', async t => {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }); t.after(() => db.close());
  let time = 0, id = 0; const store = createStore({ sequelize: db, clock: () => time }); await store.initialize();
  const s = iron(); s.active = true; s.penalized = true;
  await db.query('INSERT INTO WinterPlaytestProfiles (guildId,userId,state,anchor) VALUES ($g,$u,$s,0)', { bind: { g: 'g', u: 'u', s: JSON.stringify(s) } });
  const run = action => store.execute({ id: `jacket-${++id}`, guildId: 'g', userId: 'u', action });
  const intro = await run('throw'); assert.equal(intro.displayAction, 'emporium');
  assert.equal(intro.state.penalized, true, 'redirect is not a Throw accuracy refresh');
  let out = screen(intro, 'u'); assert.match(out.embeds[0].data.description, /I'm Azule/);
  assert.match(out.embeds[0].data.thumbnail.url, /emporium-badge/);
  assert.deepEqual(controls(out).map(b => b.data.label), ['Jacket · Free']);
  const reopened = await run('status'); assert.equal(reopened.displayAction, 'emporium');
  const claim = await run('buy-jacket'); assert.equal(M.maxHp(claim.state), 100); assert.equal(claim.state.playerHp, 100);
  out = screen(claim, 'u'); assert.match(out.embeds[0].data.description, /There, that's much better/);
  assert.deepEqual(controls(out).map(b => b.data.label), ['Throw']);
  const duplicate = await run('buy-jacket'); assert.equal(duplicate.outcome, 'rejected'); assert.equal(duplicate.state.playerHp, 100);
  const fight = await run('throw'); assert.notEqual(fight.displayAction, 'emporium'); assert.equal(fight.state.penalized, false);
  out = screen(await run('emporium'), 'u'); assert.deepEqual(out.embeds[0].data.fields.map(f => f.name), ['Fire Flower 🌺']);
  assert.equal(out.embeds[0].data.fields[0].value, '10🔘'); assert(!JSON.stringify(out).includes('times the damage'));
  time = 10000; const capture = await run('status'); assert(capture.state.tiers[1].attacks > 0, 'fights continue away from the fight screen');
});

test('jacket increases subsequent full-health battle resets and HP display', () => {
  const s = iron(); M.action(s, 'throw'); M.action(s, 'buy-jacket');
  M.change(s, 'snow', 1000, 'fixture'); M.action(s, 'throw');
  s.playerHp = .1; s.rng = 1; s.nextEnemyAt = 1; M.settle(s, 1);
  assert.equal(s.playerHp, 100); assert.equal(s.tiers[1].losses, 1);
  assert.match(screen({ state: s, action: 'throw' }, 'u').embeds[0].data.fields.find(f => f.name === 'You').value, /100\/100 HP/);
});

test('Fire Flower conceals its effect until purchase, charges 10 once and burns five Spicy per throw', () => {
  const s = iron(); M.action(s, 'throw'); M.action(s, 'buy-jacket');
  assert.throws(() => M.action(s, 'buy-fire-flower'), /buttons/);
  M.change(s, 'buttons', 10, 'fixture'); M.action(s, 'buy-fire-flower'); assert.equal(s.wallet.buttons, 0);
  assert.throws(() => M.action(s, 'buy-fire-flower'), /already own/);
  const out = screen({ state: s, action: 'buy-fire-flower', outcome: 'ok' }, 'u');
  assert.match(out.embeds[0].data.description, /uses 5 Spicy snowballs and deals 5 times/);
  M.change(s, 'red', 9, 'fixture'); M.change(s, 'snow', 1000, 'fixture'); M.action(s, 'equip-red'); M.action(s, 'throw');
  const hp = s.enemyHp; M.settle(s, 3000);
  assert.equal(s.wallet.red, 4); assert.equal(s.tiers[1].red, 5); assert.equal(s.tiers[1].attacks, 1);
  assert.equal(s.enemyHp, hp - 50); assert.equal(s.equipped, 'regular');
  assert.match(screen({ state: s, action: 'throw' }, 'u').embeds[0].data.description, /🔥 Fire Ball/);
  M.change(s, 'red', 1, 'fixture'); assert.equal(s.equipped, 'regular');
  M.action(s, 'equip-red'); assert.equal(s.equipped, 'red');
  s.rng = 12345; const enemyHp = s.enemyHp; M.settle(s, 6000);
  assert.equal(s.lastPlayerAttack.outcome, 'miss'); assert.equal(s.enemyHp, enemyHp);
  assert.equal(s.wallet.red, 0); assert.equal(s.equipped, 'regular');
});

test('pre-Iron players cannot claim jackets or buy Flowers; prior save migration only records eligibility', () => {
  const s = M.fresh('gym'); s.liveRules = true;
  assert.throws(() => M.action(s, 'buy-jacket'), /Meet Azule/);
  assert.throws(() => M.action(s, 'buy-fire-flower'), /jacket first/);
  assert.equal(M.maxHp(s), 50);
  const saved = iron(); saved.idleStarted = true; saved.fingerprint = 'fbba4470c06a66485aae6b27a0de727ade811c3e3c9819b6f2da0c2db79308b3';
  const before = structuredClone(saved); M.settle(saved, 0);
  assert.deepEqual(saved.wallet, before.wallet); assert.equal(saved.playerHp, before.playerHp); assert.equal(saved.enemyHp, before.enemyHp);
  assert.equal(saved.jacketOwned, undefined); const once = structuredClone(saved); M.settle(saved, 0); assert.deepEqual(saved, once);
});
