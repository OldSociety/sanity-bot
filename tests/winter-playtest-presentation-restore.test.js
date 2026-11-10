const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { Sequelize } = require('sequelize');
const M = require('../services/winter/game/game');
const { screen } = require('../services/winter/game/screens');
const { screen: original } = require('../services/winter/presentation');
const { createStore } = require('../services/winter/game/saved-progress');
const { createRuntime } = require('../services/winter/game/interactions');

function assertArtwork(output, name) {
  assert(output.embeds[0].data.thumbnail?.url.includes(name), `expected ${name} thumbnail`);
  const attachment = output.files.find(f => `attachment://${f.name}` === output.embeds[0].data.thumbnail.url);
  assert(attachment, 'thumbnail must have a matching attachment'); assert(fs.existsSync(attachment.attachment));
  assert.deepEqual(output.attachments, [], 'clear previous screen attachments on update');
}

test('original tutorial presentation and artwork are reused with current economy prices', () => {
  const s = M.fresh();
  const render = (action, extra = {}) => screen({ state: s, action, ...extra }, 'u');
  let output = render('throw'); assert.equal(output.embeds[0].data.title, 'Training Dummy'); assertArtwork(output, 'dummy');
  assert.equal(output.embeds[0].data.description, 'Practice your aim! Each throw uses 1 ⚪️ and deals 1 damage.\n\n**5/5 HP**\n🟩🟩🟩🟩🟩');
  s.dummyHp = 0; output = render('attack'); assertArtwork(output, 'broken-dummy');
  assert.equal(output.embeds[0].data.description, '_You broke it! What were you thinking?! You better use `/snow shop` to replace it._');
  output = render('shop'); assertArtwork(output, 'shop-badge'); assert(output.embeds[0].data.description.includes('_Welcome to my shop. Here you will find all the things you’ll need to win your war._'));
  M.action(s, 'shop-help'); output = render('shop-help'); assert.equal(output.embeds[0].data.title, 'Congratulations!'); assert.match(output.embeds[0].data.description, /I can’t fix the dummy/);
  M.action(s, 'beg'); output = render('beg'); assert.match(output.embeds[0].data.description, /Fine! I’ll show you how it’s done/);
  M.action(s, 'buy-snowman'); output = render('buy-snowman'); assertArtwork(output, 'snowman'); assert.match(output.embeds[0].data.description, /`\/snow throw`/);
  s.roughThrows = 3; s.roughHp = 47; output = render('throw'); assert.match(output.embeds[0].data.description, /This is going to take forever/);
  output = render('kitchen'); assertArtwork(output, 'kitchen-badge'); assert.match(output.embeds[0].data.description, /Hey there! First time\? Don’t worry, cooking is easy/);
  for (let n = 0; n < 3; n++) M.action(s, 'pepper');
  assert.equal(render('pepper').components[0].components[0].data.label, 'Mix');
  M.action(s, 'mix'); assert.equal(render('mix').embeds[0].data.title, 'New Snowball Unlocked!');
  output = render('shop'); assert(output.embeds[0].data.fields.some(f => f.name.includes('Spicy Snowballs') && f.value === '**1,000❄️ each**'));
  assert(!output.components.flatMap(r => r.components).some(b => /buy-recipe|battle-special|test-kill/.test(b.data.custom_id)));
});

test('restored Gym and combat show current state without legacy queue, accuracy or damage values', () => {
  const s = M.fresh('gym'); M.change(s, 'snow', 10000, 'fixture'); M.action(s, 'throw'); M.settle(s, 90000);
  let output = screen({ state: s, action: 'throw' }, 'u'); assertArtwork(output, 'snowman');
  s.enemyHp = 50.32; s.tiers[1].wins = 1;
  output = screen({ state: s, action: 'throw' }, 'u');
  assert.equal(output.embeds[0].data.title, 'Sturdy Snowman');
  assert.equal(output.embeds[0].data.description, 'Defeated: 1\n\n**50/65 HP**\n🟥🟥🟥🟥🟥🟥🟥🟥⬛⬛');
  assert.deepEqual(output.embeds[0].data.fields.map(f => f.name), ['You', 'Next attacks', 'Next goal']);
  assert.match(output.embeds[0].data.fields[1].value, /^Equipped: /);
  assert.equal(s.enemyHp, 50.32);
  assert(output.embeds[0].data.fields.find(f => f.name === 'You').value.includes('/50 HP'));
  assert(!JSON.stringify(output).includes('Special queue'));
  output = screen({ state: s, action: 'train' }, 'u'); assertArtwork(output, 'gym-badge'); assert.match(output.embeds[0].data.description, /Strength has no effect on specialty weapons/);
  s.strength = 25; s.accuracy = 2; s.ironMaterial = true; M.change(s, 'sweat', 10000, 'fixture');
  output = screen({ state: s, action: 'train' }, 'u'); assert.equal(output.embeds[0].data.fields[0].value, 'Level 25'); assert(output.components.flatMap(r => r.components).some(b => b.data.label === 'Strength · 28💦'));
  output = screen({ state: s, action: 'shop' }, 'u'); assert(!JSON.stringify(output).includes('1m❄️'));
  assert(output.embeds[0].data.fields.some(f => f.value === '**1k💎** + Iron material'));
});

test('legacy renderer default remains unchanged by optional development balance projection', () => {
  const receipt = { player: { userId: 'u', tier: 1, snow: 10000, snowballs: 0, diamonds: 1 }, progress: { dummyHp: 0, diamondsUnlocked: true }, shopProgress: { helped: true, snowmanOwned: true, snowmanHp: 47 }, kitchen: { spicyUnlocked: true }, battle: {} };
  const before = original(receipt, 'shop');
  original(receipt, 'shop', { battleConfig: { ...require('../services/winter/battle').config, spicySnowCost: 1000 } });
  assert.deepEqual(original(receipt, 'shop'), before);
  assert(before.embeds[0].data.fields.some(f => f.name.includes('Spicy Snowballs') && f.value === '**100❄️**'));
});

test('full development tutorial works through restored buttons, including two Gym lessons', async t => {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }); t.after(() => db.close());
  let now = 0, seq = 0, output, currentMessage;
  const store = createStore({ sequelize: db, clock: () => now, seed: () => 314159 });
  const runtime = createRuntime({ store, isAdmin: () => false });
  async function invoke(action, customId) {
    const interaction = { id: `restore-${++seq}`, guildId: 'g', channelId: 'c', user: { id: 'u' },
      options: { getSubcommand: () => action, data: [] }, customId, message: customId ? { id: currentMessage } : undefined,
      isButton: () => Boolean(customId), deferReply: async () => {}, deferUpdate: async () => {}, deleteReply: async () => {},
      editReply: async payload => { output = payload; currentMessage ||= 'tutorial-message'; return { id: currentMessage }; } };
    await runtime.handle(interaction);
    assert(!output.content?.includes('could not finish'), JSON.stringify(output));
    return output;
  }
  async function click(action, quantity) {
    const control = output.components.flatMap(r => r.components).find(b => b.data.custom_id.split(':')[4] === action && (quantity === undefined || b.data.custom_id.split(':')[5] === quantity));
    assert(control, `missing ${action}:${quantity} on ${output.embeds[0].data.title}`); assert(!control.data.disabled, `${action} is disabled`);
    return invoke(null, control.data.custom_id);
  }
  await invoke('throw'); assert.equal(output.embeds[0].data.title, 'Welcome to Winter Wars ❄️');
  await click('throw'); await click('craft', '1'); await click('attack'); now += 40000; await click('throw'); await click('craft', 'max');
  for (let n = 0; n < 4; n++) await click('attack');
  assertArtwork(output, 'broken-dummy'); await click('shop'); await click('shop-help'); await click('shop'); await click('diamonds'); await click('beg'); await click('shop'); await click('buy-snowman'); await click('throw');
  now += 5000; await click('throw'); await click('craft', 'max'); for (let n = 0; n < 3; n++) await click('attack');
  assert.match(output.embeds[0].data.description, /This is going to take forever/);
  await click('kitchen'); for (let n = 0; n < 3; n++) await click('pepper'); await click('mix'); await click('shop');
  await click('throw');
  for (let n = 0; n < 5; n++) await click('attack-spicy');
  assertArtwork(output, 'melted-snowman'); await click('shop'); now += 3600000; await click('diamonds'); await click('diamonds-convert', '1'); await click('shop'); await click('buy-sturdy'); await click('throw');
  now += 6 * 3600000; await click('throw'); assert.equal(output.embeds[0].data.title, 'Your first victory!'); await click('train');
  assertArtwork(output, 'gym-badge'); assert.equal(output.components.flatMap(r => r.components).length, 1);
  await click('train-strength'); assert.equal(output.components.flatMap(r => r.components).length, 1); await click('train-strength');
  assert.deepEqual(output.components.flatMap(r => r.components).map(b => b.data.label), ['Shop']);
  await click('shop'); assert.deepEqual(output.components.flatMap(r => r.components).map(b => b.data.label), ['Old Skipping Stone · 1💎', '💎 Exchange', 'Refresh']);
  await click('diamonds'); await click('diamonds-convert', '1'); await click('shop'); await click('buy-old-stone'); assertArtwork(output, 'shop-badge'); await click('shop'); await click('throw'); await invoke('gym');
  assert(output.components.flatMap(r => r.components).some(b => b.data.custom_id.includes(':lift:') && b.data.emoji.name === '🏋️'));
  const saved = await store.execute({ id: 'final-check', guildId: 'g', userId: 'u', action: 'status' });
  assert.equal(saved.state.strength, 3); assert.equal(saved.state.tier, 2); assert.equal(saved.state.gymLessonReserve, undefined); M.validate(saved.state);
});
