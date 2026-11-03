const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../services/winter/game/game');
const { screen } = require('../services/winter/game/screens');

test('S3 costs exactly 3000 diamonds in the shop and purchase, with the 100-win gate retained', () => {
  const s = M.fresh('gym'); s.liveRules = true; s.owned[2] = true; s.tiers[2].wins = 99;
  M.change(s, 'diamonds', 3000, 'fixture');
  const options = { shopCurrency: 'diamonds' };
  const render = () => screen({ state: s, action: 'shop' }, 'u');
  const control = () => render().components.flatMap(r => r.components).find(b => b.data.custom_id.includes(':buy-s3:'));
  assert.equal(control().data.label, 'S3 · 3k💎');
  assert.equal(control().data.disabled, true);
  assert.throws(() => M.action(s, 'buy-s3', '1', options), /100 victories/);
  s.tiers[2].wins = 100;
  M.change(s, 'diamonds', -1, 'fixture');
  assert.equal(control().data.disabled, true);
  assert.throws(() => M.action(s, 'buy-s3', '1', options), /diamonds/);
  M.change(s, 'diamonds', 1, 'fixture');
  assert.equal(control().data.disabled, false);
  assert(render().embeds[0].data.fields.some(f => f.name.includes('Snowman 3') && f.value.includes('3k💎')));
  M.action(s, 'buy-s3', '1', options);
  assert.equal(s.wallet.diamonds, 0); assert.equal(s.ledger.sources['S3-purchase:diamonds:spent'], 3000);
  assert.equal(s.owned[3], true); assert.equal(s.chapter, 2); assert.equal(s.active, false);
  assert.throws(() => M.action(s, 'buy-s3', '1', options), /already owned/);
});

test('prior jacket-era saves upgrade once without altering combat, ownership or balances', () => {
  for (const purchased of [false, true]) {
    const s = M.fresh('gym'); s.idleStarted = true; s.owned[3] = purchased;
    s.fingerprint = '531372e46323c1cedf3f7be49806dbe4dee31eedcfccf38f5eaf35b000e02166';
    const before = structuredClone(s); M.settle(s, s.now);
    const { fingerprint, balanceUpgrades, ...after } = s;
    const { fingerprint: previous, ...original } = before;
    assert.deepEqual(after, original); assert.equal(fingerprint, M.fingerprint);
    assert.equal(balanceUpgrades.length, 2); assert.equal(balanceUpgrades[0].id, 's3-price-2026-11-02');
    const once = structuredClone(s); M.settle(s, s.now); assert.deepEqual(s, once);
  }
});
