const test = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');
const M = require('../services/winter/game/game');
const { createStore } = require('../services/winter/game/saved-progress');
const { screen } = require('../services/winter/game/screens');

test('S3 diagnostic accrues Buttons on throws and keeps combat RNG independent', () => {
  const s = M.fresh('s3', 1); s.liveRules = true;
  assert.equal(s.tier, 3); assert.equal(s.target, 3); assert.equal(s.playerHp, 100);
  assert.equal(s.wallet.snow, 0); assert.equal(s.wallet.red, 0); assert.equal(s.strength, 25);
  M.action(s, 'throw', undefined, { shopCurrency: 'diamonds' });
  M.settle(s, 3600000);
  assert.equal(s.tiers[3].attacks, 1200); assert.equal(s.wallet.buttons, 64);
  assert.equal(s.ledger.sources['S3-throw:buttons:gained'], 64);
  assert(s.milestones.firstButton >= 0); M.validate(s);
  M.action(s, 'select-s1'); M.action(s, 'select-s3'); assert.equal(s.target, 3);
  const out = screen({ state: s, action: 'throw', run: null }, 'u');
  assert.match(out.embeds[0].data.title, /Snowman 3/);
  assert(screen({state:s,action:'snowmen'},'u').components.flatMap(r => r.components).some(b => b.data.custom_id.includes(':select-s3:')));
});

test('S3 run remains active, records S3 progress and stops cleanly', async t => {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }); t.after(() => db.close());
  let now = 0, id = 0; const store = createStore({ sequelize: db, clock: () => now, seed: () => 1 });
  const exec = (action, extra = {}) => store.execute({ id: `s3-${++id}`, guildId: 'g', userId: 'u', action, ...extra });
  await exec('diagnostic', { diagnostic: { mode: 'start', speed: 1, bookmark: 's3', stopAt: 'none', reportMinutes: 0, channelId: 'c' } });
  await exec('throw'); now = 3600000;
  const progress = await exec('throw'); assert.equal(progress.run.status, 'active'); assert.equal(progress.state.tiers[3].attacks, 1200); assert.equal(progress.state.wallet.buttons, 64);
  const stopped = await exec('diagnostic', { diagnostic: { mode: 'stop' } }); assert.equal(stopped.run.status, 'stopped');
  assert.equal(stopped.run.tierChanges[3].attacks, 1200); assert.equal(stopped.run.gained.buttons, 64);
});

test('S3 shop groups Spicy, unnamed recipes, and locked S4', () => {
  const s = M.fresh('s3', 1); s.liveRules = true;
  const out = screen({ state: s, action: 'shop', run: null }, 'u');
  const fields = Object.fromEntries(out.embeds[0].data.fields.map(f => [f.name, f.value]));
  assert.match(fields.Snowballs, /Spicy Snowballs/);
  assert.match(fields.Recipes, /Recipe #1.*10k💎/); assert.match(fields.Recipes, /Recipe #2.*Unavailable/); assert.match(fields.Recipes, /Recipe #3.*Unavailable/);
  assert.match(fields.Snowmen, /Snowman 4/);
  const actions = out.components.flatMap(row => row.components).map(b => b.data.custom_id);
  assert(actions.some(id => id.includes(':buy-spicy:')));
  assert(actions.some(id => id.includes(':buy-ice-recipe:')));
  const s4 = out.components.flatMap(row => row.components).find(b => b.data.custom_id.includes(':buy-s4:'));
  assert(s4.data.disabled); assert.match(s4.data.label, /8k💎/);
  assert(!actions.some(id => /:buy-(?:yellow|necro):/.test(id)));
  M.change(s, 'diamonds', 10002, 'fixture'); M.action(s, 'buy-ice-recipe', undefined, { shopCurrency: 'diamonds' });
  M.action(s, 'buy-ice', '1', { shopCurrency: 'diamonds' }); assert.equal(s.wallet.ice, 1);
  const after = screen({ state: s, action: 'shop', run: null }, 'u');
  assert.match(after.embeds[0].data.fields.find(f => f.name === 'Snowballs').value, /Ice Snowballs/);
  assert(after.components.flatMap(row => row.components).some(b => b.data.custom_id.includes(':buy-ice:')));
});

test('purchased Ice recipe leaves the Shop while Ice ammunition remains available', () => {
  const s = M.fresh('s3', 1); s.liveRules = true;
  M.change(s, 'diamonds', 10002, 'fixture');
  M.action(s, 'buy-ice-recipe', '1', { shopCurrency: 'diamonds' });
  const out = screen({ state: s, action: 'shop' }, 'u');
  const fields = Object.fromEntries(out.embeds[0].data.fields.map(f => [f.name, f.value]));
  assert(!fields.Recipes.includes('Recipe #1'));
  assert.match(fields.Recipes, /Recipe #2.*Unavailable/);
  assert.match(fields.Snowballs, /Ice Snowballs.*2💎/);
  const controls = out.components.flatMap(r => r.components);
  assert(!controls.some(b => b.data.custom_id.includes(':buy-ice-recipe:')));
  assert(controls.some(b => b.data.custom_id.includes(':buy-ice:') && !b.data.disabled));
});

test('5x S3 diagnostic matches 1x after the same amount of game time', async t => {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }); t.after(() => db.close());
  let now = 0, sequence = 0;
  const store = createStore({ sequelize: db, clock: () => now, seed: () => 123 });
  const run = (userId, action, extra = {}) => store.execute({ id: `speed-${++sequence}`, guildId: 'g', userId, action, ...extra });
  for (const [user, speed] of [['slow', 1], ['fast', 5]]) {
    await run(user, 'diagnostic', { diagnostic: { mode: 'start', speed, bookmark: 's3', stopAt: 'none', reportMinutes: 0, channelId: 'c' } });
    await run(user, 'throw');
  }
  now = 60000; const fast = await run('fast', 'throw');
  now = 300000; const slow = await run('slow', 'throw');
  assert.equal(fast.run.gameElapsedMs, 300000); assert.equal(fast.run.realElapsedMs, 60000);
  assert.deepEqual(fast.state, slow.state);
  assert.equal(fast.state.tiers[3].attacks, 100);
  assert.equal(fast.state.ledger.sources['gathering:snow:gained'], 64800);
  assert(fast.state.wallet.buttons > 0);
});

test('Emporium offers one item in order and applies both upgrades once', () => {
  const s = M.fresh('s3', 2); s.liveRules = true;
  const act = name => M.action(s, name, undefined, { shopCurrency: 'diamonds' });
  const offers = () => screen({ state: s, action: 'emporium', run: null }, 'u').embeds[0].data.fields.map(f => f.name);
  M.change(s, 'buttons', 7210, 'fixture');
  assert(offers().includes('Fire Flower 🌺')); assert(!offers().includes('Reinforced Jacket'));
  assert.throws(() => act('buy-reinforced-jacket'), /unavailable/);
  act('buy-fire-flower'); assert(offers().includes('Reinforced Jacket')); assert(!offers().includes('Golden Shovel'));
  M.settle(s, 10000); assert.equal(s.wallet.snow, 2160);
  s.playerHp = 70; act('buy-reinforced-jacket'); assert.equal(M.maxHp(s), 150); assert.equal(s.playerHp, 70);
  assert(offers().includes('Soup Kitchen')); assert(!offers().includes('Golden Shovel')); assert.throws(() => act('buy-reinforced-jacket'), /already owned/);
  assert.throws(() => act('buy-golden-shovel'), /unavailable/); act('buy-soup-kitchen');
  assert(offers().includes('Golden Idol')); assert.throws(() => act('buy-soup-kitchen'), /already supported/);
  act('buy-golden-idol'); assert.equal(s.tier, 3); assert.equal(s.goldenIdolOwned, true);
  act('buy-golden-shovel'); assert.equal(s.tier, 4); assert.equal(M.rate(s), 1296); assert.equal(s.wallet.buttons, 0);
  M.settle(s, 20000); assert.equal(s.wallet.snow, 15120); assert.throws(() => act('buy-golden-shovel'), /already owned/);
  assert(!offers().includes('Golden Shovel')); M.validate(s);
});
