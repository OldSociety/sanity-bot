const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../services/winter/playtest-model');
const C = require('../services/winter/chapter-simulation');
const E = require('../services/winter/early-progression');
const A = require('../services/winter/chapter3-audit-model');
const B = require('../services/winter/battle');

function live() {
  const s = M.fresh('gym', 1); s.liveRules = true; s.gymStarterFromVictory = true;
  M.change(s, 'snow', 10000, 'fixture'); M.action(s, 'throw');
  return s;
}

test('fractional enemy HP below one is defeated; exactly one HP survives', () => {
  for (const remainder of [0.01, 0.49, 0.99, 1]) {
    const s = live(); s.enemyHp = 2.36 + remainder;
    M.settle(s, 3000);
    assert.equal(s.tiers[1].wins, remainder < 1 ? 1 : 0);
    assert.equal(s.lastPlayerAttack.victory === true, remainder < 1);
    if (remainder === 1) assert(Math.abs(s.enemyHp - 1) < 1e-8);
  }
});

test('player HP below one loses; exactly one HP survives', () => {
  for (const remainder of [0.01, 0.99, 1]) {
    const s = live(); s.playerHp = 2.4 + remainder; s.nextPlayerAt = 12000; s.nextEnemyAt = 10000;
    M.settle(s, 10000);
    assert.equal(s.tiers[1].losses, remainder < 1 ? 1 : 0);
    assert.equal(s.lastEnemyAttack.defeat === true, remainder < 1);
    assert.equal(s.penalized, remainder < 1);
  }
});

test('tied lethal attack timestamps award the player one win and skip the defeated enemy attack', () => {
  const s = live(); s.playerHp = 1; s.enemyHp = 2.5; s.nextPlayerAt = s.nextEnemyAt = 3000;
  M.settle(s, 3000);
  assert.equal(s.tiers[1].wins, 1); assert.equal(s.tiers[1].losses, 0);
  assert.equal(s.tiers[1].enemyAttacks, 0); assert.equal(s.ledger.sources['combat:sweat:gained'], 1);
  const once = structuredClone(s); M.settle(s, 3000); assert.deepEqual(s, once);
});

test('saved fractional remainders resolve before spending ammo, with simultaneous defeats awarded to the player', () => {
  for (const playerHp of [0.2, 20]) {
    const s = live(); s.enemyHp = 0.2; s.playerHp = playerHp;
    s.fingerprint = '39c6325bee20248f5bcaf72223eb49f03f3764d1bdf30c024b7cdffc8d242ad4';
    const snow = s.wallet.snow, rng = s.rng;
    M.settle(s, 0);
    assert.equal(s.tiers[1].wins, 1); assert.equal(s.tiers[1].losses, 0); assert.equal(s.tiers[1].attacks, 0);
    assert.equal(s.wallet.snow, snow); assert.equal(s.rng, rng);
    assert.equal(s.balanceUpgrades.at(-1).id, 'defeat-threshold-2026-11-02');
    const once = structuredClone(s); M.settle(s, 0); assert.deepEqual(s, once);
  }
});

test('offline chapter and early models use the same fractional defeat boundary and player-first ties', () => {
  const c = C.rules(C.defaults.experimentalFireCandidates[1]); c.playerAccuracy = c.enemyAccuracy = 1;
  const s = C.fresh(1, c); s.snow = 10000; s.enemyHp = 2.5; s.playerHp = 1; s.nextPlayerAt = s.nextEnemyAt = 3000;
  C.settle(s, 3000, c); assert.equal(s.tiers[1].wins, 1); assert.equal(s.tiers[1].enemyAttacks, 0);
  const e = E.fresh(); e.snow = 10000; e.active = true; e.enemyHp = 2.5; e.playerHp = 1; e.nextPlayerAt = e.nextEnemyAt = 3000;
  E.settle(e, 3000, { combat: () => 0, buttons: () => 1 });
  assert.equal(e.tiers[1].wins, 1); assert.equal(e.tiers[1].enemyAttacks, 0);
});

test('delayed outgoing lethal damage wins an exact tie with an enemy attack in the chapter-three model', () => {
  const m = A.fresh(1); m.s.enemyHp = 1.2; m.s.playerHp = 1;
  m.s.dotAmount = 1; m.s.dotTicks = 1; m.s.nextDot = m.s.nextE = 10000; m.s.nextP = 12000;
  A.settle(m, 10000);
  assert.equal(m.s.tiers[1].wins, 1); assert.equal(m.s.tiers[1].losses, 0); assert.equal(m.s.tiers[1].enemyAttacks, 0);
});

test('legacy Winter combat also resolves fractional knockouts and player-first lethal ties', () => {
  const s = B.freshBattle(); s.sturdyOwned = 1; B.startBattle(s, 0);
  s.enemyHp = 2.5; s.playerHp = 1; s.nextPlayerAt = s.nextEnemyAt = 3000;
  const player = { snow: 1000, remainder: 0 };
  B.advanceBattle(player, s, 3000, () => {}, () => 0, B.config, () => 1);
  assert.equal(s.defeated, 1); assert.equal(s.losses, 0); assert.equal(s.enemyAttacks, 0);
  const loser = B.freshBattle(); loser.sturdyOwned = 1; B.startBattle(loser, 0);
  loser.playerHp = 1.5; loser.nextPlayerAt = 12000; loser.nextEnemyAt = 10000;
  B.advanceBattle(player, loser, 10000, () => {}, () => 0, B.config, () => 1);
  assert.equal(loser.phase, 'defeat'); assert.equal(loser.losses, 1);
});
