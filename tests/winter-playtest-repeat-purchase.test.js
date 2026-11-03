const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../services/winter/playtest-model');
const { screen } = require('../services/winter/playtest-presentation');
const controls = out => out.components.flatMap(r => r.components);

test('three consecutive Spicy batches retain the full Shop and remaining affordable controls', () => {
  const s = M.fresh('gym'); M.change(s, 'diamonds', 300, 'fixture');
  for (let batch = 1; batch <= 3; batch++) {
    M.action(s, 'buy-spicy', '100', { shopCurrency: 'diamonds' });
    const out = screen({ state: s, action: 'buy-spicy', outcome: 'accepted' }, 'u');
    assert.match(out.embeds[0].data.title, /Shop/);
    assert.match(out.embeds[0].data.description, /You purchased 🔴 Spicy Snowballs/);
    assert(out.embeds[0].data.fields.some(f => f.name.includes('Spicy Snowballs')));
    assert.equal(s.wallet.red, batch * 100);
    assert.equal(s.wallet.diamonds, 300 - batch * 100);
    assert.equal(controls(out).at(-1).data.label, 'Refresh');
    assert.equal(controls(out).some(b => b.data.label.includes('×100')), batch < 3);
    assert(controls(out).some(b => b.data.label === 'Throw'));
  }
});

test('Iron display, affordability and actual spending agree at one thousand diamonds', () => {
  const s = M.fresh('gym'); s.strength = 25; s.gymEntered = true; s.ironMaterial = true;
  M.change(s, 'diamonds', 999, 'fixture');
  const render = () => screen({ state: s, action: 'shop' }, 'u');
  const iron = () => controls(render()).find(b => b.data.custom_id.includes(':iron:'));
  assert.equal(iron().data.disabled, true);
  assert.throws(() => M.action(s, 'iron', '1', { shopCurrency: 'diamonds' }), /diamonds/);
  M.change(s, 'diamonds', 1, 'fixture');
  assert.equal(iron().data.disabled, false); assert.equal(iron().data.label, 'Iron Shovel · 1k💎');
  M.action(s, 'iron', '1', { shopCurrency: 'diamonds' });
  assert.equal(s.wallet.diamonds, 0); assert.equal(s.tier, 3);
  assert.equal(M.rules.ironSnowCost, 1000000);
});

test('the pre-price-change save upgrades once without changing combat or awarding refunds', () => {
  const s = M.fresh('gym');
  s.idleStarted = true;
  s.fingerprint = 'ec5ec7db74902b44b55f927bd7119cce1d22e046b0ee352ca37e263c207200bf';
  const before = structuredClone(s); M.settle(s, s.now);
  const { fingerprint, balanceUpgrades, ...rest } = s;
  const { fingerprint: old, ...original } = before;
  assert.deepEqual(rest, original); assert.equal(fingerprint, M.fingerprint);
  assert.equal(balanceUpgrades.length, 4); assert.equal(balanceUpgrades[0].id, 'iron-price-2026-11-02');
  const once = structuredClone(s); M.settle(s, s.now); assert.deepEqual(s, once);
});
