const { test } = require('node:test');
const assert = require('node:assert/strict');
const { trial } = require('../scripts/winter/weapon-comparison');
test('fixed unlimited Regular defeats S1 after 40 hits; damage and full-health resets reconcile', () => {
  const s = trial(1, 'regular', 1, { random: () => 0 }).advance(120000);
  assert.equal(s.wins, 1); assert.equal(s.shots, 40); assert.equal(s.usefulDamageOut, 80);
  assert.equal(s.rawDamageOut, 80); assert.equal(s.hpLost, 33); assert.equal(s.playerHp, 50);
  assert.equal(s.enemyHp, 81); assert.equal(s.nextPlayerAt, 123000); assert.equal(s.nextEnemyAt, 130000);
});
test('Ice overkill is excluded from useful damage while actual incoming HP is counted', () => {
  const s = trial(1, 'ice', 1, { random: () => 0 }).advance(12000);
  assert.equal(s.wins, 1); assert.equal(s.shots, 4);
  assert.equal(s.rawDamageOut, 100); assert.equal(s.usefulDamageOut, 80); assert.equal(s.hpLost, 3);
});
test('losses retry with unchanged global cadence; fatal overkill does not inflate actual HP lost', () => {
  const s = trial(4, 'regular', 1, { random: () => 0 }).advance(40000);
  assert.equal(s.losses, 1); assert.equal(s.hpLost, 50); assert.equal(s.rawDamageIn, 56);
  assert.equal(s.shots, 13); assert.equal(s.nextPlayerAt, 42000); assert.equal(s.playerHp, 50);
});
test('sampling does not change the trajectory and unlimited weapons never exhaust', () => {
  const a = trial(2, 'red', 42), b = trial(2, 'red', 42);
  a.advance(3600000); a.advance(7200000);
  assert.deepEqual(a.snapshot(), b.advance(7200000));
  assert.equal(a.snapshot().shots, 2400);
});
test('first-defeat mode stops at the actual defeat timestamp and never resumes or heals', () => {
  const stopped = trial(4, 'regular', 1, { random: () => 0, stopOnFirstLoss: true });
  const s = stopped.advance(86400000);
  assert.equal(s.now, 40000); assert.equal(s.stoppedAt, 40000);
  assert.equal(s.losses, 1); assert.equal(s.playerHp, 0); assert.equal(s.shots, 13);
  assert.deepEqual(stopped.advance(31*86400000), s);
  const retry = trial(4, 'regular', 1, { random: () => 0 }).advance(80000);
  assert.equal(retry.losses, 2); assert.equal(retry.shots, 26);
});
