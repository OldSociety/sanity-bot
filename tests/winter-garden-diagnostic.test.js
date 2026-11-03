const test = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');
const M = require('../services/winter/playtest-model');
const { createStore } = require('../services/winter/playtest-store');
const { screen } = require('../services/winter/playtest-presentation');

test('Pond tug-of-war catches weighed fish and donates without changing combat or currency', () => {
  const s = M.fresh('s3', 1); const rng = s.rng, wallet = structuredClone(s.wallet);
  assert.throws(() => M.action(s, 'garden-open'), /diagnostic/);
  const act = (name, q) => M.action(s, name, q, { diagnostic: true });
  act('garden-open'); assert.throws(() => act('garden-cast', 'invalid'), /spot/);
  act('garden-cast', 'shallows'); act('garden-reel'); act('garden-reel');
  assert.deepEqual([s.garden.progress, s.garden.tension], [2, 4]);
  s.garden.rng = 0x12345678; act('garden-slack'); assert.equal(s.garden.tension, 1);
  assert.match(act('garden-reel'), /You caught .+ weighs \d+\.\d lbs/);
  const weight = s.garden.heldTenths; assert(weight > 0); act('garden-donate');
  assert.equal(s.foodDonatedTenths, weight); assert.equal(s.garden.heldTenths, 0);
  assert.equal(s.rng, rng); assert.deepEqual(s.wallet, wallet); M.validate(s);
  assert.throws(() => act('garden-donate'), /Catch a fish/);
  act('garden-cast', 'deep'); act('garden-reel'); act('garden-reel');
  assert.match(act('garden-reel'), /snapped/); assert.equal(s.garden.missed, 1);
});

test('legacy unweighed fish are preserved and never invented as pounds', () => {
  const s = M.fresh('s3', 2);
  s.garden = { phase: 'waiting', rng: 12, held: 1, caught: 3, donated: 2, missed: 0, collection: { Trout: 3 } };
  const act = (name, q) => M.action(s, name, q, { diagnostic: true });
  act('garden-open'); assert.equal(s.garden.phase, 'idle'); assert.equal(s.garden.unweighedHeld, 1);
  assert.match(act('garden-donate'), /not weighed/); assert.equal(s.foodDonatedTenths, 0);
  assert.equal(s.garden.donated, 3); assert.equal(s.garden.collection.Trout, 3);
});

test('Kitchen and Pond preserve weighted donations, action replay and ongoing combat', async t => {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }); t.after(() => db.close());
  let i = 0, now = 0; const store = createStore({ sequelize: db, clock: () => now, seed: () => 5 });
  const run = (action, quantity, id = `pond-${++i}`) => store.execute({ id, guildId: 'g', userId: 'u', action, quantity });
  await store.execute({ id: 'start', guildId: 'g', userId: 'u', action: 'diagnostic', diagnostic: { mode: 'start', speed: 1, bookmark: 's3', stopAt: 'none', reportMinutes: 0, channelId: 'c' } });
  await run('throw'); now = 60000;
  const kitchen = await run('kitchen'); const payload = screen(kitchen, 'u');
  assert.equal(kitchen.state.tiers[3].attacks, 20); assert.equal(kitchen.state.active, true);
  assert(payload.components.flatMap(r => r.components).some(b => b.data.custom_id.includes(':garden-open:') && b.data.label === 'Pond 🐟'));
  assert.equal(payload.embeds[0].data.fields.at(-1).value, '**0.0 lbs**');
  const open = await run('garden-open'); const pond = screen(open, 'u'); assert.equal(pond.embeds[0].data.title, 'Pond 🐟');
  assert.deepEqual(pond.components[0].components.map(b => b.data.label), ['Shallows', 'Reeds', 'Deep Water']);
  assert(pond.components[0].components[0].data.custom_id.includes(':garden-cast:shallows'));
  await run('garden-cast', 'shallows'); await run('garden-reel'); await run('garden-reel');
  now += 3600000;
  const resume = await run('garden-open'); assert.deepEqual([resume.state.garden.progress, resume.state.garden.tension], [2, 4]);
  assert.equal(resume.state.tiers[3].attacks, 1220);
  // A broken line is possible, so retry complete fights until a catch occurs.
  let current = await run('garden-slack');
  for (let tries = 0; tries < 30 && !current.state.garden.held; tries++) {
    if (current.state.garden.phase === 'idle') current = await run('garden-cast', 'shallows');
    if (current.state.garden.tension >= 4) current = await run('garden-slack');
    else current = await run('garden-reel');
  }
  assert.equal(current.state.garden.held, 1);
  const before = current.state.garden.heldTenths;
  const donated = await run('garden-donate', undefined, 'same-donation');
  const replay = await run('garden-donate', undefined, 'same-donation');
  assert.equal(donated.state.foodDonatedTenths, before); assert.equal(replay.state.foodDonatedTenths, before);
  const updated = screen(await run('kitchen'), 'u');
  assert.equal(updated.embeds[0].data.fields.at(-1).value, `**${(before / 10).toFixed(1)} lbs**`);
});
