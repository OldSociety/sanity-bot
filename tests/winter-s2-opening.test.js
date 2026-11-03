const test = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');
const M = require('../services/winter/playtest-model');
const E = require('../services/winter/early-progression');
const C = require('../services/winter/chapter-simulation');
const A = require('../services/winter/chapter3-audit-model');
const { createStore } = require('../services/winter/playtest-store');
const OLD = 'ba42c4ce39e3a310ad73a44fea4f6e1ef8c414ab4d7881ddf91f328908a2f8cc';

test('S2 opening ends exactly at 25 completed wins in every chapter consumer', () => {
  const s = M.fresh('gym'); s.target = 2;
  const c = C.rules(C.defaults.experimentalFireCandidates[1]), sim = C.fresh(42, c); sim.target = 2;
  const audit = A.fresh(42); audit.s.target = 2;
  for (const [wins, hp, damage] of [[0,124,2.4],[1,124.8,2.4],[24,143.2,2.4],[25,144,4.8],[49,163.2,4.8],[50,164,5.6],[99,203.2,6.4],[100,204,7.2]]) {
    s.tiers[2].wins = sim.tiers[2].wins = audit.s.tiers[2].wins = wins;
    for (const enemy of [M.enemy(s), E.enemy(s, 2, M.rules), C.enemy(sim, c), A.enemy(audit)]) {
      assert.equal(enemy.hp, hp); assert.equal(enemy.damage, damage);
    }
  }
});

test('unlock gives a distinct easier S2 while other tiers retain their scaling', () => {
  const s = M.fresh('gym'); s.tiers[1].wins = 100;
  assert.deepEqual(M.enemy(s), { hp: 144, damage: 5.6, sweat: 1 });
  M.action(s, 'buy-s2'); M.action(s, 'select-s2');
  assert.equal(s.enemyHp, 124); assert.deepEqual(M.enemy(s), { hp: 124, damage: 2.4, sweat: 2 });
  assert.equal(s.tiers[1].wins, 100); assert.equal(s.tiers[2].wins, 0);
  const c = C.rules(C.defaults.experimentalFireCandidates[1]), sim = C.fresh(7, c);
  for (const [tier, baseHp, baseDamage] of [[3,320,8],[4,550,14]]) {
    sim.target = tier; sim.tiers[tier].wins = 100;
    assert.equal(C.enemy(sim,c).hp, baseHp + 100); assert.equal(C.enemy(sim,c).damage, baseDamage + 4);
  }
});

test('the 25th victory resets the next opponent to 144HP and 4.8 damage, pays once', () => {
  const s = M.fresh('gym', 1); s.liveRules = true; s.gymUnlocked = true;
  s.target = 2; s.owned[2] = true; s.tiers[2].wins = 24; s.enemyHp = 1;
  M.change(s, 'snow', 100, 'fixture'); M.action(s, 'throw');
  M.settle(s, 3000);
  assert.equal(s.tiers[2].wins, 25); assert.equal(s.wallet.sweat, 2);
  assert.equal(s.enemyHp, 144); assert.equal(M.enemy(s).damage, 4.8);
  const exact = structuredClone(s); M.settle(s,3000); assert.deepEqual(s, exact);
});

test('known old S2 saves retain damage dealt, resources, timers and counters; upgrade once', () => {
  const s = M.fresh('gym'); s.target = 2; s.tiers[2].wins = 12; s.enemyHp = 150; s.fingerprint = OLD; s.idleStarted = true;
  const before = structuredClone(s); M.settle(s, s.now);
  assert.equal(s.enemyHp, 91.6); assert.equal(s.fingerprint, M.fingerprint);
  assert.equal(s.balanceUpgrades.length, 6);
  const { fingerprint, enemyHp, balanceUpgrades, ...rest } = s;
  const { fingerprint: oldFingerprint, enemyHp: oldHp, ...original } = before;
  assert.deepEqual(rest, original);
  const once = structuredClone(s); M.settle(s,s.now); assert.deepEqual(s,once);
  const nearKo = structuredClone(before); nearKo.enemyHp = 10; M.settle(nearKo,nearKo.now);
  assert.equal(nearKo.enemyHp,1); assert.equal(nearKo.tiers[2].wins,12);
});

test('S1 save upgrade preserves damage already dealt and unknown rules still fail closed', () => {
  const s = M.fresh('gym'); s.enemyHp = 43; s.fingerprint = OLD; M.settle(s,0);
  assert.equal(s.enemyHp,27); assert.equal(s.balanceUpgrades.length,6);
  s.fingerprint = 'unrecognized'; const before = structuredClone(s);
  assert.throws(() => M.settle(s,0), /incompatible/); assert.deepEqual(s,before);
});

test('historical Iron bookmark keeps provenance and inherits both HP adjustments', () => {
  const bookmark = require('../config/winter/playtest-bookmarks.json').iron;
  const s = M.fresh('iron');
  assert.equal(bookmark.balanceHash, '79a292d802104b28667dc6ba33f044548c33401f7612a2ff179cf0d114467250');
  assert(Math.abs(s.enemyHp - (bookmark.state.enemyHp - 25 - 33.4)) < 1e-9);
  assert.deepEqual(s.wallet,bookmark.state.wallet); assert.deepEqual(s.tiers,bookmark.state.tiers);
  assert.equal(s.balanceUpgrades[0].id,'s2-opening-2026-11-01'); M.validate(s);
});

test('persisted old profile upgrades transactionally; retried interaction cannot upgrade or reward twice', async t => {
  const db = new Sequelize({dialect:'sqlite',storage:':memory:',logging:false}); t.after(()=>db.close());
  const store = createStore({sequelize:db,clock:()=>0,seed:()=>42}); await store.initialize();
  const s = M.fresh('gym'); s.liveRules = true; s.gymUnlocked = true; s.gymEntered = true;
  s.target = 2; s.owned[2] = true; s.enemyHp = 170; s.fingerprint = OLD;
  await db.query('INSERT INTO WinterPlaytestProfiles (guildId,userId,state,anchor) VALUES ($g,$u,$s,0)',{bind:{g:'g',u:'u',s:JSON.stringify(s)}});
  const input = {guildId:'g',userId:'u',id:'opening-test',action:'status'};
  const result = await store.execute(input); assert.equal(result.state.enemyHp,114);
  assert.equal(result.state.balanceUpgrades.length,6);
  assert.deepEqual(await store.execute(input), result);
  const [rows] = await db.query('SELECT state FROM WinterPlaytestProfiles');
  const persisted = JSON.parse(rows[0].state); assert.equal(persisted.fingerprint,M.fingerprint);
  assert.equal(persisted.balanceUpgrades.length,6); assert.deepEqual(persisted.wallet,s.wallet);
});
