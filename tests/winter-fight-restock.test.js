const test = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');
const M = require('../services/winter/game/game');
const { screen } = require('../services/winter/game/screens');
const { createRuntime } = require('../services/winter/game/interactions');
const { createStore } = require('../services/winter/game/saved-progress');
const buttons = (out) => out.components.flatMap((r) => r.components);
const ready = () => {
  const s = M.fresh('gym', 12);
  s.liveRules = true;
  return s;
};
const gate = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};

test('exhausted Spicy buys Max with snow and equips it without changing the fight or accuracy', () => {
  const s = ready();
  M.change(s, 'snow', 12345, 'fixture');
  M.change(s, 'diamonds', 9, 'fixture');
  M.action(s, 'throw');
  s.penalized = true;
  const before = [s.target, s.playerHp, s.enemyHp, s.nextPlayerAt, s.nextEnemyAt, s.rng];
  const find = () =>
    buttons(screen({ state: s, action: 'throw' }, 'u')).find((b) =>
      b.data.custom_id.includes(':quick-buy-red:')
    );
  assert.match(find().data.label, /Buy Max/);
  assert.equal(find().data.disabled, false);
  M.action(s, 'quick-buy-red', 'max', { shopCurrency: 'diamonds' });
  assert.deepEqual(
    [s.wallet.snow, s.wallet.red, s.wallet.diamonds, s.equipped],
    [345, 12, 9, 'red']
  );
  assert.equal(s.penalized, true);
  assert.deepEqual([s.target, s.playerHp, s.enemyHp, s.nextPlayerAt, s.nextEnemyAt, s.rng], before);
  assert(!find());
  assert.equal(
    buttons(screen({ state: s, action: 'quick-buy-red' }, 'u')).find((b) =>
      b.data.custom_id.includes(':equip-red:')
    ).data.style,
    3
  );
  assert.throws(() => M.action(s, 'quick-buy-red', 'max'), /Shop/);
  M.validate(s);
});

test('quick buy enforces Max, affordability, recipe and Fire stock requirements; Ice also uses snow', () => {
  const s = ready();
  M.change(s, 'snow', 4999, 'fixture');
  s.fireFlowerOwned = true;
  const before = structuredClone(s.wallet);
  assert.throws(() => M.action(s, 'quick-buy-red', '1'), /Max only/);
  assert.throws(() => M.action(s, 'quick-buy-red', 'max'), /five/);
  assert.deepEqual(s.wallet, before);
  M.change(s, 'snow', 1, 'fixture');
  M.action(s, 'quick-buy-red', 'max');
  assert.deepEqual([s.wallet.red, s.wallet.snow, s.equipped], [5, 0, 'red']);
  M.change(s, 'snow', 6001, 'fixture');
  assert.throws(() => M.action(s, 'quick-buy-ice', 'max'), /recipe/);
  s.iceRecipe = true;
  M.action(s, 'quick-buy-ice', 'max');
  assert.deepEqual([s.wallet.ice, s.wallet.snow, s.equipped], [3, 1, 'ice']);
  M.validate(s);
});

test('quick Max purchase is receipt-deduped and chapter controls are unavailable to ordinary profiles', async (t) => {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
  t.after(() => db.close());
  const store = createStore({ sequelize: db, clock: () => 0 });
  const exec = (id, action, quantity) =>
    store.execute({ id, guildId: 'g', userId: 'u', action, quantity });
  await exec('init', 'status');
  const s = ready();
  M.change(s, 'snow', 10500, 'fixture');
  await db.query('UPDATE WinterPlaytestProfiles SET state=$state', {
    bind: { state: JSON.stringify(s) }
  });
  const a = await exec('buy', 'quick-buy-red', 'max');
  const b = await exec('buy', 'quick-buy-red', 'max');
  assert.deepEqual(a, b);
  assert.equal(a.outcome, 'ok');
  assert.equal(b.state.wallet.red, 10);
  assert.equal((await exec('forged', 'end-chapter0')).outcome, 'rejected');
  s.chapter = 0;
  s.chapter0Pending = true;
  s.tutorialFlow = 2;
  s.tutorialStage = 'chapter0-end';
  await db.query('UPDATE WinterPlaytestProfiles SET state=$state', {
    bind: { state: JSON.stringify(s) }
  });
  const recovered = await exec('recover', 'shop');
  assert.equal(recovered.state.chapter0Pending, false);
  assert.equal(recovered.state.chapter, 1);
  assert(
    !/End of Chapter|Chapter 0 complete|Test saved/.test(JSON.stringify(screen(recovered, 'u')))
  );
});

test('locked Pond remains hidden in diagnostics and ordinary play; Sturdy introduction precedes the fight', () => {
  const s = ready();
  const run = { run: 1, status: 'active', speed: 5, realElapsedMs: 0, gameElapsedMs: 0 };
  for (const context of [undefined, run]) {
    const out = screen({ state: s, action: 'kitchen', run: context }, 'u');
    assert(!JSON.stringify(out).includes('Pond'));
    assert(!JSON.stringify(out).includes('Food donated'));
  }
  s.soupKitchenOwned = true;
  assert(
    buttons(screen({ state: s, action: 'kitchen' }, 'u')).some((b) => b.data.label === 'Pond 🐟')
  );
  const intro = screen({ state: s, action: 'buy-sturdy' }, 'u');
  assert.match(
    intro.embeds[0].data.description,
    /fights will be automatic and continue when you’re offline/
  );
  assert.deepEqual(
    buttons(intro).map((b) => b.data.label),
    ['Throw']
  );
});

test('new clicks acknowledge while earlier delivery is blocked, preserving mutation order', async () => {
  const blocked = gate(),
    deliveryStarted = gate(),
    acks = [],
    actions = [];
  const s = ready();
  const store = {
    execute: async (input) => {
      actions.push(input.id);
      return { state: s, action: input.action };
    }
  };
  const runtime = createRuntime({ store });
  const input = (id) => ({
    id,
    guildId: 'g',
    user: { id: 'u' },
    isButton: () => false,
    options: { getSubcommand: () => 'status' },
    deferReply: async () => {
      acks.push(id);
    },
    editReply: async () => {
      if (id === 'one') {
        deliveryStarted.resolve();
        await blocked.promise;
      }
      return { id };
    }
  });
  const a = runtime.handle(input('one'));
  await deliveryStarted.promise;
  const b = runtime.handle(input('two'));
  await Promise.resolve();
  assert.deepEqual(acks, ['one', 'two']);
  assert.deepEqual(actions, ['one']);
  blocked.resolve();
  await Promise.all([a, b]);
  assert.deepEqual(actions, ['one', 'two']);
});

test('acknowledgments completing out of order cannot reorder purchases', async () => {
  const slow = gate(),
    actions = [];
  const s = ready();
  const runtime = createRuntime({
    store: {
      execute: async (input) => {
        actions.push(input.id);
        return { state: s, action: input.action };
      }
    }
  });
  const input = (id) => ({
    id,
    guildId: 'g',
    user: { id: 'u' },
    isButton: () => false,
    options: { getSubcommand: () => 'status' },
    deferReply: async () => {
      if (id === 'one') await slow.promise;
    },
    editReply: async () => ({ id })
  });
  const a = runtime.handle(input('one')),
    b = runtime.handle(input('two'));
  await Promise.resolve();
  assert.deepEqual(actions, []);
  slow.resolve();
  await Promise.all([a, b]);
  assert.deepEqual(actions, ['one', 'two']);
});

test('a rejected acknowledgment logs its ID and phase without executing a purchase', async (t) => {
  const logs = [];
  t.mock.method(console, 'error', (...args) => logs.push(args));
  const runtime = createRuntime({
    store: { execute: async () => assert.fail('must not mutate after failed acknowledgment') }
  });
  await runtime.handle({
    id: 'expired',
    guildId: 'g',
    user: { id: 'u' },
    isButton: () => false,
    options: { getSubcommand: () => 'shop' },
    deferReply: async () => {
      throw Object.assign(Error('Unknown interaction'), { code: 10062 });
    }
  });
  const record = JSON.parse(logs[0][1]);
  assert.equal(record.id, 'expired');
  assert.equal(record.phase, 'acknowledgment');
  assert.equal(record.code, 10062);
});

test('Fire quick buy accounts for the unused Spicy already in stock', () => {
  const s = ready();
  s.fireFlowerOwned = true;
  M.change(s, 'red', 4, 'fixture');
  M.change(s, 'snow', 1000, 'fixture');
  const buy = buttons(screen({ state: s, action: 'throw' }, 'u')).find((b) =>
    b.data.custom_id.includes(':quick-buy-red:')
  );
  assert.equal(buy.data.disabled, false);
  M.action(s, 'quick-buy-red', 'max');
  assert.deepEqual([s.wallet.snow, s.wallet.red, s.equipped], [0, 5, 'red']);
  M.validate(s);
});
