const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRuntime } = require('../services/winter/playtest-runtime');
const { createControls } = require('../services/winter/playtest-controls');
const { screen } = require('../services/winter/playtest-presentation');
const M = require('../services/winter/playtest-model');

function fixture() {
  let now = 0, sequence = 0;
  const requests = [], messages = [], controls = createControls({ clock: () => now, ttl: 1000 });
  const state = M.fresh();
  const store = { execute: async request => { requests.push(request); return { action: request.action, state, admin: true, message: request.denied || '', outcome: request.denied ? 'denied' : 'ok' }; } };
  const runtime = createRuntime({ store, controls, isAdmin: () => true });
  function interaction(action = 'throw', customId, message) {
    const log = { deleted: 0, edits: [], replies: [], updates: 0, id: `message-${++sequence}` }; messages.push(log);
    return { id: `interaction-${sequence}`, guildId: 'g', channelId: 'c', user: { id: 'u' }, message,
      customId, isButton: () => Boolean(customId), options: { getSubcommand: () => action, data: [] },
      deferReply: async p => log.replies.push(p), deferUpdate: async () => { log.updates++; },
      editReply: async p => { log.edits.push(p); return { id: message?.id || log.id }; },
      deleteReply: async () => { log.deleted++; }, log };
  }
  const button = (i, action) => i.log.edits.at(-1).components.flatMap(r => r.components).find(b => b.data.custom_id.split(':')[4] === action).data.custom_id;
  return { runtime, interaction, button, requests, messages, controls, state, at: n => { now = n; } };
}

test('new commands close the preceding private screen; stale clicks are audited without acting', async () => {
  const f = fixture(), first = f.interaction(); await f.runtime.handle(first);
  const old = f.button(first, 'craft'); const second = f.interaction(); await f.runtime.handle(second);
  assert.equal(first.log.deleted, 1);
  const stale = f.interaction(null, old, { id: first.log.id }); await f.runtime.handle(stale);
  assert.match(f.requests.at(-1).denied, /expired/); assert.equal(stale.log.updates, 0); assert(stale.log.replies[0].ephemeral);
  assert.equal(second.log.deleted, 0);
});

test('valid buttons update in place and rotate tokens; duplicate clicks and forged actions cannot act', async () => {
  const f = fixture(), first = f.interaction(); await f.runtime.handle(first);
  const old = f.button(first, 'craft'), click = f.interaction(null, old, { id: first.log.id }); await f.runtime.handle(click);
  assert.equal(click.log.updates, 1); assert.equal(f.requests.at(-1).denied, null); assert.equal(first.log.deleted, 0);
  assert.notEqual(f.button(click, 'craft'), old);
  let cleared = 0;
  for (const id of [old, f.button(click, 'craft').replace(':craft:', ':grant-sweat:')]) {
    const forged = f.interaction(null, id, { id: first.log.id }); forged.webhook = { editMessage: async () => { cleared++; } };
    await f.runtime.handle(forged); assert.match(f.requests.at(-1).denied, /expired/);
  }
  assert.equal(cleared, 0, 'duplicate clicks must leave the latest controls on that message intact');
});

test('expiry removes controls even without a connected reporting client; restart rejects previous tokens', async () => {
  const f = fixture(), first = f.interaction(); await f.runtime.handle(first); const id = f.button(first, 'craft');
  f.at(1000); await f.runtime.pulse(); assert.equal(first.log.deleted, 1);
  const expired = f.interaction(null, id, { id: first.log.id }); await f.runtime.handle(expired); assert.match(f.requests.at(-1).denied, /expired/);
  assert.equal(createControls().accepts(expired), false);
  let cleared;
  const orphan = f.interaction(null, 'snow:u:pt:normal:craft:1', { id: 'before-restart' });
  orphan.webhook = { editMessage: async (id, payload) => { cleared = { id, payload }; } };
  await f.runtime.handle(orphan); assert.deepEqual(cleared, { id: 'before-restart', payload: { components: [] } });
});

test('failed deletion falls back to removing components; foreign clicks leave owner screen intact', async () => {
  const f = fixture(), first = f.interaction(); await f.runtime.handle(first);
  const foreign = f.interaction(null, f.button(first, 'craft'), { id: first.log.id }); foreign.user = { id: 'other' };
  await f.runtime.handle(foreign); assert.match(f.requests.at(-1).denied, /another player/); assert.equal(first.log.deleted, 0);
  first.deleteReply = async () => { throw Error('cannot delete'); };
  await f.runtime.handle(f.interaction('status')); assert.deepEqual(first.log.edits.at(-1), { components: [] });
});

test('simultaneous clicks serialize and only the first uses the displayed controls', async () => {
  const f = fixture(), first = f.interaction(); await f.runtime.handle(first);
  const id = f.button(first, 'craft'); await Promise.all([1, 2].map(() => f.runtime.handle(f.interaction(null, id, { id: first.log.id }))));
  assert.equal(f.requests.filter(r => r.action === 'craft' && !r.denied).length, 1);
});

test('disabled controls cannot be forged; reset IDs fit Discord limits and Cancel closes Kitchen', async () => {
  const f = fixture();
  const first = f.interaction('throw'); await f.runtime.handle(first);
  const disabled = f.button(first, 'attack'), click = f.interaction(null, disabled, { id: first.log.id });
  await f.runtime.handle(click); assert.match(f.requests.at(-1).denied, /expired/);
  f.state.restartToken = 'x'.repeat(36);
  const reset = screen({ state: f.state, action: 'restart', admin: true }, '1'.repeat(20)); f.controls.decorate(reset);
  assert(reset.components[0].components.every(b => b.data.custom_id.length <= 100));
  f.state.roughOwned = true; f.state.roughThrows = 3;
  const cancelled = screen({ state: f.state, action: 'recipe-cancel' }, 'u'); assert.equal(cancelled.components.length, 0);
  f.state.gymEntered = true; f.state.gymUnlocked = true; f.state.strength = 100; f.state.accuracy = 100; f.state.wallet.sweat = 100000;
  const gym = screen({ state: f.state, action: 'train' }, 'u');
  assert(gym.components.flatMap(r => r.components).filter(b => b.data.custom_id.includes(':train-')).every(b => b.data.disabled));
});
