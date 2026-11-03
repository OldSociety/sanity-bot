const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Sequelize } = require('sequelize');
const M = require('../services/winter/playtest-model');
const { createStore } = require('../services/winter/playtest-store');
const { screen } = require('../services/winter/playtest-presentation');

test('both sides display actual hits and misses from saved rolls without changing combat RNG', () => {
  const s = M.fresh('gym', 12345); s.liveRules = true; M.change(s, 'snow', 100000, 'fixture'); M.action(s, 'throw');
  const player = new Set(), enemy = new Set();
  for (let at = 3000; at <= 180000; at += 3000) {
    M.settle(s, at); const rng = s.rng, out = screen({ state: s, action: 'throw' }, 'u');
    const p = s.lastPlayerAttack; player.add(p.outcome); assert.match(out.embeds[0].data.description, new RegExp(`You: \\*\\*${p.outcome === 'hit' ? 'Hit' : 'Miss'}\\*\\*`));
    if (p.outcome === 'miss') assert.equal(p.damage, 0); else assert(p.damage > 0);
    if (s.lastEnemyAttack) {
      const e = s.lastEnemyAttack; enemy.add(e.outcome);
      assert.match(out.embeds[0].data.fields.find(f => f.name === 'You').value, new RegExp(`Snowman: \\*\\*${e.outcome === 'hit' ? 'Hit' : 'Miss'}\\*\\*`));
    }
    assert.equal(s.rng, rng, 'rendering cannot draw another combat roll');
  }
  assert.deepEqual([...player].sort(), ['hit', 'miss']); assert.deepEqual([...enemy].sort(), ['hit', 'miss']);
});

test('unfunded attacks show waiting rather than a miss, and last-special feedback names the ball actually thrown', () => {
  const waiting = M.fresh('gym', 3); Object.assign(waiting, { liveRules: true, active: true, now: 2999, nextPlayerAt: 3000, nextEnemyAt: 12999 });
  const rng = waiting.rng; M.settle(waiting, 3000); assert.equal(waiting.lastPlayerAttack.outcome, 'waiting'); assert.equal(waiting.tiers[1].attacks, 0); assert.equal(waiting.rng, rng);
  assert.match(screen({ state: waiting, action: 'throw' }, 'u').embeds[0].data.description, /Waiting for enough ❄️ snow/);
  const special = M.fresh('gym', 3); special.liveRules = true; M.change(special, 'red', 1, 'fixture'); M.change(special, 'snow', 1000, 'fixture');
  M.action(special, 'equip-red'); M.action(special, 'throw'); M.settle(special, 3000);
  assert.equal(special.equipped, 'regular'); assert.equal(special.lastPlayerAttack.type, 'red');
  const out = screen({ state: special, action: 'throw' }, 'u'); assert.match(out.embeds[0].data.description, /You: \*\*Hit\*\* · 🔴 Spicy/);
  assert.equal(out.components.flatMap(r => r.components).find(b => b.data.custom_id.includes(':equip-regular:')).data.style, 3);
});

test('normal and accelerated diagnostic fights recover thirteen offline hours from on-disk SQLite exactly once', async t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'winter-restart-'));
  t.after(() => { for (const name of fs.readdirSync(folder)) fs.unlinkSync(path.join(folder, name)); fs.rmdirSync(folder); });
  for (const diagnostic of [false, true]) {
    const file = path.join(folder, diagnostic ? 'diagnostic.sqlite' : 'normal.sqlite');
    let db = new Sequelize({ dialect: 'sqlite', storage: file, logging: false });
    try {
      const start = 1000, gap = 13 * 3600000, speed = diagnostic ? 2 : 1;
      let store = createStore({ sequelize: db, clock: () => start, seed: () => 3 });
      if (diagnostic) await store.execute({ guildId: 'g', userId: 'u', id: 'start', action: 'diagnostic', diagnostic: { mode: 'start', bookmark: 'gym', speed, stopAt: 'none', reportMinutes: 0, channelId: 'c' } });
      else await store.execute({ guildId: 'g', userId: 'u', id: 'create', action: 'status' });
      const saved = M.fresh('gym', 12345); saved.liveRules = true; saved.tutorialCheckpoint = null;
      M.change(saved, 'snow', 100000, 'fixture'); M.change(saved, 'red', 2, 'fixture'); M.action(saved, 'equip-red'); M.action(saved, 'throw');
      if (!diagnostic) saved.profileAnchor = start;
      await db.query(diagnostic ? 'UPDATE WinterPlaytestRuns SET state=$state WHERE id=1' : 'UPDATE WinterPlaytestProfiles SET state=$state WHERE guildId=\'g\' AND userId=\'u\'', { bind: { state: JSON.stringify(saved) } });
      const expected = structuredClone(saved); M.settle(expected, gap * speed); if (!diagnostic) expected.profileAnchor = start + gap;
      await db.close(); db = new Sequelize({ dialect: 'sqlite', storage: file, logging: false });
      store = createStore({ sequelize: db, clock: () => start + gap });
      const request = { guildId: 'g', userId: 'u', id: 'recover', action: 'status' };
      const result = await store.execute(request); assert.deepEqual(result.state, expected); assert.deepEqual(await store.execute(request), result);
      assert.equal(result.state.tiers[1].attacks, Math.floor(gap * speed / 3000)); assert.equal(result.state.tiers[1].red, 2); assert.equal(result.state.equipped, 'regular');
      assert.equal(result.state.ledger.sources['passive:sweat:gained'], 13 * speed); assert(result.state.lastPlayerAttack); assert(result.state.lastEnemyAttack);
      await db.close(); db = new Sequelize({ dialect: 'sqlite', storage: file, logging: false });
      store = createStore({ sequelize: db, clock: () => start + gap });
      assert.deepEqual((await store.execute({ ...request, id: 'reconnect-again' })).state, result.state);
    } finally { await db.close(); }
  }
});
