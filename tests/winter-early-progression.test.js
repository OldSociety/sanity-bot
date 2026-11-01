const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../services/winter/early-progression');
const { streams, run, scenarios } = require('../scripts/winter/early-progression');
const HOUR = M.HOUR;
const hit = { combat: () => 0, buttons: () => 0 };
const miss = { combat: () => .99, buttons: () => 0 };

test('rising HP increments and cumulative boundaries match the handoff', () => {
  const cases = [[0, 0], [99, 99], [100, 100], [199, 1090], [200, 1100],
    [299, 3080], [300, 3100], [999, 45010], [1000, 45100], [1100, 55100]];
  for (const [k, expected] of cases) assert.equal(M.addedHp(k), expected);
  for (const k of [0, 98, 99, 100, 198, 199, 200, 998, 999, 1000]) {
    assert.equal(M.addedHp(k + 1) - M.addedHp(k), k < 100 ? 1 : 10 * Math.floor(k / 100));
  }
  const s = M.fresh(); s.tiers[1].wins = 1000;
  assert.equal(M.enemy(s).hp, 45180);
  assert.equal(M.enemy(s).damage, 43);
});

test('losses automatically retry at full HP while preserving the global attack grid', () => {
  const c = { ...M.config, playerHp: 1 };
  const s = M.fresh(c);
  M.settle(s, 10000, hit, c);
  assert.equal(s.tiers[1].losses, 1);
  assert.equal(s.playerHp, 1);
  assert.equal(s.enemyHp, 80);
  assert.equal(s.nextPlayerAt, 12000); // Resetting from death would incorrectly give 13000.
  M.settle(s, HOUR, hit, c);
  assert.equal(s.tiers[1].attacks, 1200);
  assert.equal(s.tiers[1].losses, 360);
  assert.equal(s.ledger.combatSweat, 0);
  assert.equal(s.active, true);
  M.assertLedger(s, c);
});

test('player goes first at simultaneous events; a victory cancels the old enemy attack', () => {
  const c = { ...M.config, regularDamage: 100, snowmen: [{ ...M.config.snowmen[0], hp: 100000 }] };
  const s = M.fresh(c);
  M.settle(s, 27000, hit, c);
  s.enemyHp = 1;
  const attacks = s.tiers[1].enemyAttacks;
  M.settle(s, 30000, hit, c);
  assert.equal(s.tiers[1].wins, 1);
  assert.equal(s.tiers[1].enemyAttacks, attacks);
  assert.equal(s.nextPlayerAt, 33000);
  assert.equal(s.nextEnemyAt, 40000);
  assert.equal(s.playerHp, 50);
  assert.equal(s.enemyHp, 100001);
});

test('Button drops include misses and losses on S3; no lower-tier or balance boost', () => {
  const s = M.fresh();
  M.settle(s, 15000, miss);
  assert.equal(s.buttons, 0);
  s.tiers[1].wins = 100; s.tiers[2].wins = 100;
  M.select(s, 3);
  const random = { combat: () => .99, buttons: () => .049 };
  M.settle(s, 21000, random);
  assert.equal(s.tiers[3].hits, 0);
  assert.equal(s.buttons, 2);
  assert.equal(s.active, true);
  M.settle(s, 24000, { combat: () => .99, buttons: () => .05 });
  assert.equal(s.buttons, 2);
});

test('one selected special replaces attacks and falls back to fractional regular damage', () => {
  const s = M.fresh();
  M.settle(s, 63000, miss);
  assert(M.purchase(s, 'red', 2));
  assert(M.equip(s, 'red'));
  s.strength = 3;
  const before = s.enemyHp, regular = s.tiers[1].regular;
  M.settle(s, 72000, hit);
  assert.equal(s.red, 0);
  assert.equal(s.tiers[1].red, 2);
  assert.equal(s.tiers[1].regular - regular, 1);
  assert(Math.abs(s.enemyHp - (before - 20 - 2.36)) < 1e-10);
  assert.equal(s.equipped, 'red');
  M.assertLedger(s);
});

test('settlement is invariant to visits, JSON round trips, duplicate and backward timestamps', () => {
  const whole = M.fresh(), split = M.fresh(), one = streams(42), two = streams(42);
  M.settle(whole, 24 * HOUR, one);
  M.settle(split, 1234567, two);
  const restored = JSON.parse(JSON.stringify(split));
  M.settle(restored, 24 * HOUR, two);
  assert.deepEqual(restored, whole);
  const before = structuredClone(restored);
  M.settle(restored, 24 * HOUR, two);
  M.settle(restored, 1, two);
  assert.deepEqual(restored, before);
  M.assertLedger(restored);
});

test('event budget leaves unprocessed time unsettled and can resume without losing events', () => {
  const whole = M.fresh(), limited = M.fresh(), a = streams(43), b = streams(43);
  M.settle(whole, HOUR, a);
  const result = M.settle(limited, HOUR, b, M.config, 10);
  assert.equal(result.complete, false);
  assert(limited.now < HOUR);
  M.settle(limited, HOUR, b);
  assert.deepEqual(limited, whole);
});

test('passive rate is floored, fractional accrual retained, and purchases are prospective', () => {
  for (const [str, rate] of [[3, 1], [25, 8], [50, 11], [75, 14], [100, 16], [200, 23]]) {
    assert.equal(M.passiveRate(str), rate);
  }
  const s = M.fresh(); s.active = false; s.strength = 3;
  M.settle(s, HOUR / 2, hit);
  assert.equal(s.sweat, 0);
  assert.equal(s.sweatRemainder, HOUR / 2);
  M.settle(s, HOUR, hit);
  assert.equal(s.sweat, 1);
  const prospective = M.fresh(); prospective.active = false;
  M.settle(prospective, 24 * HOUR, hit);
  assert.equal(prospective.sweat, 0);
  prospective.sweat = 6; prospective.ledger.starterSweat = 6;
  assert(M.purchase(prospective, 'strength')); assert(M.purchase(prospective, 'strength')); assert(M.purchase(prospective, 'strength'));
  assert.equal(prospective.sweat, 0);
  M.settle(prospective, 25 * HOUR, hit);
  assert.equal(prospective.sweat, 1);
  M.assertLedger(prospective);
});

test('Iron trade accrues old-rate snow first; Ice requires recipe and explicit diamond conversion', () => {
  const s = M.fresh(); s.active = false;
  s.strength = 25;
  M.settle(s, 10 * HOUR, hit);
  assert.equal(s.snow, 1296000);
  assert(!M.purchase(s, 'iron'));
  assert(M.purchase(s, 'lift'));
  assert(M.purchase(s, 'iron'));
  M.settle(s, 11 * HOUR, hit);
  assert.equal(s.snow, 1073600);
  assert(!M.purchase(s, 'ice'));
  M.settle(s, 24 * HOUR, hit);
  assert(M.purchase(s, 'ice-recipe'));
  assert(!M.purchase(s, 'ice'));
  assert(M.purchase(s, 'diamonds', 2));
  assert(M.purchase(s, 'ice'));
  assert.equal(s.ice, 1);
  assert.equal(s.diamonds, 0);
  M.assertLedger(s);
});

test('snowman wins persist independently and unlock only at the preceding 100 wins', () => {
  const s = M.fresh();
  s.tiers[1].wins = 99;
  assert.equal(M.select(s, 2), false);
  s.tiers[1].wins = 100;
  assert(M.select(s, 2));
  s.tiers[2].wins = 17;
  M.select(s, 1);
  assert.equal(s.enemyHp, 180);
  M.select(s, 2);
  assert.equal(s.enemyHp, 197);
  assert.equal(M.select(s, 5), false);
  assert.equal(M.unlocked(s, 3), false);
});

test('insufficient snow skips attacks on the same grid and never bursts on recovery', () => {
  const c = { ...M.config, stoneRate: 1 };
  const s = M.fresh(c);
  M.settle(s, 9000, miss, c);
  assert.equal(s.tiers[1].attacks, 0);
  assert.equal(s.ledger.skippedAttacks, 3);
  M.settle(s, 12000, miss, c);
  assert.equal(s.tiers[1].attacks, 1);
  assert.equal(s.nextPlayerAt, 15000);
  M.assertLedger(s, c);
});

test('coat charges once, requires discovery and increases future full-health resets', () => {
  const s = M.fresh(); s.buttons = 100; s.ledger.buttonsEarned = 100;
  assert(!M.purchase(s, 'coat'));
  s.milestones.firstButton = 0;
  assert(M.purchase(s, 'coat'));
  assert(!M.purchase(s, 'coat'));
  assert.equal(s.buttons, 0);
  assert.equal(s.playerHp, 50);
  s.tiers[1].wins = 100;
  M.select(s, 2);
  assert.equal(s.playerHp, 100);
  M.assertLedger(s);
});

test('seeded policy replay is exact and the candidate has no runtime import', () => {
  const a = run(271828, scenarios[1], 48 * HOUR);
  assert.deepEqual(a, run(271828, scenarios[1], 48 * HOUR));
  M.assertLedger(a.state);
  const fs = require('node:fs'), path = require('node:path');
  const sources = ['battle.js', 'economy.js', 'runtime.js', 'live.js'];
  for (const file of sources) assert(!fs.readFileSync(path.join(__dirname, '../services/winter', file), 'utf8').includes("require('./early-progression')"));
});
