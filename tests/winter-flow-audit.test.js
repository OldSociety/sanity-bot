const test = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');
const M = require('../services/winter/game/game');
const { createStore } = require('../services/winter/game/saved-progress');
const { screen } = require('../services/winter/game/screens');
const brown = require('../services/winter/game/brown-snowballs');

function readyForS3() {
  const s = M.fresh('gym', 1);
  s.liveRules = true;
  s.strength = 25;
  s.tiers[1].wins = 100;
  M.action(s, 'buy-s2', '1', { shopCurrency: 'diamonds' });
  s.tiers[2].wins = 100;
  M.change(s, 'diamonds', 22000, 'flow-fixture');
  M.action(s, 'lift');
  M.action(s, 'iron', '1', { shopCurrency: 'diamonds' });
  M.action(s, 'throw');
  M.action(s, 'buy-jacket');
  return s;
}

test('ordinary profiles continue from Iron and S3 through the supported shops, Pond, Golden and secret recipe', () => {
  // Funded UI/purchase traversal, not a balance or pacing simulation.
  const s = readyForS3();
  const act = (name, q) => M.action(s, name, q, { shopCurrency: 'diamonds' });
  act('buy-s3');
  assert.equal(s.s3Diagnostic, undefined);
  assert.equal(s.target, 3);
  assert(s.tiers[3]);
  assert(!screen({ state: s, action: 'throw' }, 'u').embeds[0].data.fields.some(f => f.name === 'Test saved'));
  act('throw');
  M.settle(s, 30000);
  assert.equal(s.tiers[3].attacks, 10);
  assert(screen({ state: s, action: 'throw' }, 'u').embeds[0].data.fields.some(f => f.name === 'Next goal' && f.value.includes('Snowman 4')));
  assert.throws(() => act('garden-open'), /Soup Kitchen/);
  M.change(s, 'buttons', 7210, 'flow-fixture');
  act('buy-fire-flower');
  act('buy-reinforced-jacket');
  s.tiers[3].wins = 100;
  act('buy-s4');
  act('buy-ice-recipe');
  assert.equal(s.wallet.diamonds, 0);
  act('select-s4');
  assert.equal(s.target, 4);
  act('buy-soup-kitchen');
  assert(screen({ state: s, action: 'kitchen' }, 'u').components.flatMap(r => r.components).some(b => b.data.custom_id.includes(':garden-open:')));
  act('garden-open');
  assert.equal(screen({ state: s, action: 'garden-open' }, 'u').embeds[0].data.title, 'Pond 🐟');
  act('buy-golden-idol');
  act('buy-golden-shovel');
  assert.equal(s.tier, 4);
  assert.equal(s.wallet.buttons, 0);
  for (const ingredient of brown.recipe) act('ingredient', ingredient);
  assert.match(act('mix'), /N'norah'c/);
  M.validate(s);
});

test('diagnostic stop points remain explicit: Chapter1 freezes at S3, none continues', async t => {
  for (const stopAt of ['chapter1', 'none']) {
    const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    t.after(() => db.close());
    const store = createStore({ sequelize: db, clock: () => 0, seed: () => 1 });
    await store.execute({ id: 'start', guildId: 'g', userId: 'u', action: 'diagnostic', diagnostic: { mode: 'start', speed: 1, bookmark: 'chapter1', stopAt, reportMinutes: 0, channelId: 'c' } });
    await db.query('UPDATE WinterPlaytestRuns SET state=$state WHERE id=1', { bind: { state: JSON.stringify(readyForS3()) } });
    const result = await store.execute({ id: 's3', guildId: 'g', userId: 'u', action: 'buy-s3' });
    assert.equal(result.run.status, stopAt === 'none' ? 'active' : 'completed');
    const next = await store.execute({ id: 'continue', guildId: 'g', userId: 'u', action: 'throw' });
    assert.equal(next.state.active, stopAt === 'none');
  }
});

test('previous ordinary S3 checkpoint gains access without losing currencies or healing its current fight', () => {
  const s = readyForS3();
  s.owned[3] = true;
  s.chapter = 2;
  s.fingerprint = '0ae40ab4e466f1838d1c1d71b3506336d0eb58bc77340ce6d4e8fb3a9fa0e4cd';
  s.playerHp = 43;
  s.enemyHp = 17;
  const before = structuredClone(s);
  M.settle(s, s.now);
  assert(s.tiers[3]);
  assert.equal(s.playerHp, 43);
  assert.equal(s.enemyHp, 17);
  assert.equal(s.target, before.target);
  assert.equal(s.rng, before.rng);
  assert.deepEqual(s.wallet, before.wallet);
  assert.equal(s.balanceUpgrades.at(-1).id, 'chapter-two-flow-2026-11-03');
});
