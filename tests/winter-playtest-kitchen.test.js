const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');
const { createStore } = require('../services/winter/playtest-store');
const { screen } = require('../services/winter/playtest-presentation');
const M = require('../services/winter/playtest-model');
const { IDS, DIRTY_RECIPE } = require('../services/winter/recipes');
const buttons = out => out.components.flatMap(r => r.components);

test('Gym shows stat levels with cost and native emojis on its buttons', () => {
  const s = M.fresh('gym'); M.action(s, 'train'); M.change(s, 'sweat', 10000, 'fixture');
  let out = screen({ state: s, action: 'train' }, 'u');
  assert.match(out.embeds[0].data.description, /Strength has no effect on specialty weapons/);
  assert.deepEqual(out.embeds[0].data.fields, [{ name: 'STR 💪🏽', value: 'Level 3', inline: true }]);
  let strength = buttons(out).find(b => b.data.custom_id.includes(':train-strength:'));
  assert.equal(strength.data.label, 'Strength · 4💦'); assert.equal(strength.data.emoji.name, '💪🏽');
  const lift = buttons(out).find(b => b.data.custom_id.includes(':lift:')); assert.equal(lift.data.label, '25 lbs'); assert.equal(lift.data.emoji.name, '🏋️');
  assert.deepEqual(buttons(out).slice(-2).map(b => b.data.label), ['Shop', 'Throw']);
  const shop = screen({ state: s, action: 'shop' }, 'u'); assert(buttons(shop).some(b => b.data.label === 'Gym')); assert.equal(buttons(shop).at(-1).data.label, 'Refresh');
  s.strength = 25; s.accuracy = 2; out = screen({ state: s, action: 'train' }, 'u');
  assert.equal(out.embeds[0].data.fields[1].name, 'ACC 🎯'); assert.equal(out.embeds[0].data.fields[1].value, 'Level 2');
  assert(buttons(out).some(b => b.data.label === 'Strength · 28💦')); assert(buttons(out).some(b => b.data.label === 'Accuracy · 28💦' && b.data.emoji.name === '🎯'));
});

test('Kitchen has exactly seven recipe slots, seven white question marks per unknown entry and working ingredient controls', () => {
  const s = M.fresh('gym'), out = screen({ state: s, action: 'kitchen' }, 'u');
  const lines = out.embeds[0].data.fields.find(f => f.name === 'Recipes').value.split('\n');
  assert.equal(lines.length, 7); assert.equal(lines[0], '1. 🌶️🌶️🌶️'); assert(lines.slice(1).every(line => /^\d\. ❔{7}$/.test(line)));
  assert.equal(buttons(out).filter(b => b.data.custom_id.includes(':ingredient:')).length, 5);
  assert.deepEqual(buttons(out).filter(b => !b.data.custom_id.includes(':ingredient:')).map(b => b.data.label), ['Cancel']);
});

test('recipe drafts persist, stay private, enforce seven ingredients and use separate RNG from combat', async t => {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }); t.after(() => db.close());
  let sequence = 0; const store = createStore({ sequelize: db, clock: () => 0, seed: () => 314159 });
  const run = (action, extra = {}) => store.execute({ id: `kitchen-${++sequence}`, guildId: 'g', userId: 'u', action, ...extra });
  const start = await run('diagnostic', { diagnostic: { mode: 'start', bookmark: 'chapter1', speed: 1, stopAt: 'none', reportMinutes: 0, channelId: 'c' } });
  const combatRng = start.state.rng, originalBalances = structuredClone(start.state.wallet);
  const initialOrder = [...IDS]; let receipt = await run('ingredient', { quantity: 'cherry' });
  assert.notDeepEqual(receipt.state.recipeDraft.ingredientOrder, initialOrder); assert.equal(receipt.state.rng, combatRng);
  const reopened = createStore({ sequelize: db, clock: () => 0 });
  receipt = await reopened.execute({ id: 'reopen-draft', guildId: 'g', userId: 'u', action: 'kitchen' }); assert.deepEqual(receipt.state.recipeDraft.ingredients, ['cherry']);
  const other = await run('ingredient', { userId: 'other', quantity: 'pepper' }); assert.equal(other.outcome, 'rejected'); assert.equal(other.state.recipeDraft, undefined);
  for (let n = 1; n < 7; n++) receipt = await run('ingredient', { quantity: 'cherry' });
  const full = screen(receipt, 'u'), ingredientButtons = buttons(full).filter(b => b.data.custom_id.includes(':ingredient:'));
  assert(ingredientButtons.every(b => b.data.disabled)); assert.deepEqual(buttons(full).slice(-2).map(b => b.data.label), ['Mix', 'Cancel']); assert.deepEqual(buttons(full).slice(-2).map(b => b.data.style), [3, 4]);
  const rejected = await run('ingredient', { quantity: 'pepper' }); assert.equal(rejected.outcome, 'rejected'); assert.equal(rejected.state.recipeDraft.ingredients.length, 7);
  receipt = await run('mix'); assert.match(receipt.message, /did not unlock/); assert.deepEqual(receipt.state.recipeDraft.ingredients, []); assert.deepEqual(receipt.state.wallet, originalBalances); assert.equal(receipt.state.rng, combatRng);
  assert.equal(screen(receipt, 'u').embeds[0].data.title, 'Kylax’s Kitchen 🌶️');
  await run('ingredient', { quantity: 'garlic' }); const cancelled = await run('recipe-cancel'); assert.deepEqual(cancelled.state.recipeDraft.ingredients, []); assert.equal(screen(cancelled, 'u').components.length, 0);
  assert.equal(buttons(screen(await run('kitchen'), 'u')).filter(b => b.data.custom_id.includes(':ingredient:')).length, 5);
});

test('defined recipe combinations report duplicates and persist new discoveries in the book and diagnostic recap', async t => {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }); t.after(() => db.close());
  const store = createStore({ sequelize: db, clock: () => 0, seed: () => 7 }); let sequence = 0;
  const run = (action, extra = {}) => store.execute({ id: `discover-${++sequence}`, guildId: 'g', userId: 'u', action, ...extra });
  await run('diagnostic', { diagnostic: { mode: 'start', bookmark: 'chapter1', speed: 1, stopAt: 'none', reportMinutes: 0, channelId: 'c' } });
  for (const ingredient of DIRTY_RECIPE) await run('ingredient', { quantity: ingredient });
  const discovery = await run('mix', { id: 'discover-once' }); assert.equal(discovery.state.dirtyRecipeUnlocked, true); assert.match(discovery.message, /discovered/);
  assert.deepEqual(await run('mix', { id: 'discover-once' }), discovery);
  const book = screen(discovery, 'u').embeds[0].data.fields.find(f => f.name === 'Recipes').value;
  assert.equal(book.split('\n')[1], '2. 🍆🧄🥑🧄🌶️'); assert.equal(book.split('\n').filter(line => line.includes('❔'.repeat(7))).length, 5);
  for (const ingredient of DIRTY_RECIPE) await run('ingredient', { quantity: ingredient }); assert.match((await run('mix')).message, /already know/);
  for (let n = 0; n < 3; n++) await run('ingredient', { quantity: 'pepper' }); const repeated = await run('mix'); assert.match(repeated.message, /already know.*Spicy/); assert.equal(screen(repeated, 'u').embeds[0].data.title, 'Kylax’s Kitchen 🌶️');
  await run('diagnostic', { diagnostic: { mode: 'stop' } }); const recap = await store.claimReport(); assert(recap.payload.timeline.some(event => event.name === 'Dirty Snowball recipe discovered'));
});
