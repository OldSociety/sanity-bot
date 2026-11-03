const test = require('node:test');
const assert = require('node:assert/strict');
const Study = require('../scripts/winter/regular-only-month');
const N = require('../services/winter/chapter-simulation');
const Live = require('../services/winter/playtest-model');
test('regular-only study matches development Chapter1 state/RNG through hourly purchases and training', () => {
  for (const seed of [7, 17, 31]) {
    const { c, s } = Study.setup(seed), live = Live.fresh('gym', seed); Live.action(live, 'throw');
    for (let hour = 1; hour <= 288; hour++) {
      N.settle(s, hour * Study.H, c); Live.settle(live, hour * Study.H);
      Study.operate(s, c, Study.policies[1]); Live.action(live, 'throw');
      while (live.strength < 100 && live.wallet.sweat >= live.strength + 1) Live.action(live, 'train-strength');
      if (live.strength >= 25 && !live.ironMaterial) Live.action(live, 'lift');
      if (live.ironMaterial && live.tier === 2 && live.wallet.snow >= Live.rules.ironSnowCost) Live.action(live, 'iron');
      if (!live.owned[2] && live.tiers[1].wins >= 100) { Live.action(live, 'buy-s2'); Live.action(live, 'select-s2'); }
      if (!live.owned[3] && live.tiers[2].wins >= 100 && live.wallet.snow >= Live.rules.snowmen[2].snowPrice) { Live.action(live, 'buy-s3'); break; }
      for (const [key, value] of Object.entries({ snow: s.snow, sweat: s.sweat })) assert.equal(live.wallet[key], value);
      for (const key of ['strength', 'target', 'playerHp', 'enemyHp', 'nextPlayerAt', 'nextEnemyAt', 'snowRemainder', 'sweatRemainder', 'penalized']) assert.equal(live[key], s[key], `${seed}/${hour}/${key}`);
      assert.equal(live.rng, s.rng.combat);
      for (const tier of [1, 2]) for (const [key, value] of Object.entries(live.tiers[tier])) assert.equal(value, s.tiers[tier][key]);
    }
  }
});
test('31-day run conserves real-funded regular supply, cadence, Sweat and zero special ammo', () => {
  const r = Study.run(20261030, Study.policies[2]);
  assert.equal(Object.values(r.tiers).reduce((n, t) => n + t.attacks, 0), 31 * 28800);
  assert.equal(r.ledger.ammoSnow, 31 * 28800 * 10);
  assert.equal(r.ledger.combatSweat, Object.entries(r.tiers).reduce((n, [tier, t]) => n + Number(tier) * t.wins, 0));
  assert.equal(r.summary.sweat, r.ledger.combatSweat + r.ledger.passiveSweat - r.ledger.trainingSweat);
  assert.equal(r.summary.maxHp, 50); assert.equal(r.summary.strength, 100);
});
test('S4 is a hard regular-only wall even with guaranteed hits and capped Strength', () => {
  const { c, s } = Study.setup(123); s.strength = 100; s.owned[4] = true; N.select(s, 4, c); c.playerAccuracy = c.defeatedAccuracy = 1;
  N.settle(s, Study.H * 24, c);
  assert.equal(s.tiers[4].wins, 0); assert.equal(s.tiers[4].immune, 28800); assert.equal(s.enemyHp, 550);
  assert(s.tiers[4].losses > 0);
});
test('seeded histories and effective-wall detection replay exactly', () => {
  const a = Study.run(20261030, Study.policies[1]), b = Study.run(20261030, Study.policies[1]);
  assert.deepEqual(a, b);
  if (a.wallHour !== null) {
    const total = i => a.history[i].wins.reduce((n, x) => n + x, 0);
    for (let hour = a.wallHour; hour <= 744 - 72; hour++) assert(total(hour + 72) - total(hour) < 3);
  }
});
