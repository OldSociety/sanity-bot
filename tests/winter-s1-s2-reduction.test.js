const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../services/winter/playtest-model');
const E = require('../services/winter/early-progression');
const C = require('../services/winter/chapter-simulation');
const A = require('../services/winter/chapter3-audit-model');
const { hpAtDefeats, damageAtDefeats } = require('../services/winter/snowman-scaling');
const OPENING = '4e22df0938d4135ff66717cb7d4711d48b5c08bc381128a2869d77fcad792033';
const close = (actual, expected) => assert(Math.abs(actual-expected)<1e-8, `${actual} != ${expected}`);

test('S1 and S2 HP/damage remain exactly 80% of the previous curves including growth changes', () => {
  const s=M.fresh('gym'),c=C.rules(C.defaults.experimentalFireCandidates[1]),sim=C.fresh(3,c),audit=A.fresh(3);
  for(const tier of [1,2]) {
    const baseline={...M.rules.snowmen[tier-1]};delete baseline.statPercent;
    s.target=sim.target=audit.s.target=tier;
    for(let wins=0;wins<=1000;wins++) {
      s.tiers[tier].wins=sim.tiers[tier].wins=audit.s.tiers[tier].wins=wins;
      const expectedHp=hpAtDefeats(baseline,wins)*.8,expectedDamage=damageAtDefeats(baseline,wins)*.8;
      for(const enemy of [M.enemy(s),E.enemy(s,tier,M.rules),C.enemy(sim,c),A.enemy(audit)]) {
        close(enemy.hp,expectedHp);close(enemy.damage,expectedDamage);
      }
    }
  }
});

test('new fights and retried opponents initialize from reduced HP, with fractional damage retained', () => {
  assert.equal(M.fresh('gym').enemyHp,64);
  const c=C.rules(C.defaults.experimentalFireCandidates[1]);assert.equal(C.fresh(1,c).enemyHp,64);assert.equal(A.fresh(1).s.enemyHp,64);
  assert.equal(E.fresh({...E.config,snowmen:M.rules.snowmen.slice(0,4)}).enemyHp,64);
  const s=M.fresh('gym',1);s.liveRules=true;M.change(s,'snow',1000,'fixture');M.action(s,'throw');M.settle(s,10000);
  assert.equal(s.lastEnemyAttack.outcome,'hit');assert.equal(s.lastEnemyAttack.damage,2.4);close(s.playerHp,47.6);
  s.playerHp=.1;s.rng=1;s.nextEnemyAt=s.now+1;
  M.settle(s,s.now+1);assert.equal(s.tiers[1].losses,1);assert.equal(s.enemyHp,64);assert.equal(s.playerHp,50);
});

test('Endurance reduces actual incoming hits by 0.5% per level', () => {
  for (const level of [0, 1, 50, 100]) {
    const s = M.fresh('gym', 1); s.liveRules = true; s.defense = level;
    M.change(s, 'snow', 1000, 'fixture'); M.action(s, 'throw'); M.settle(s, 10000);
    const expected = 2.4 * (1 - level * 0.005);
    assert.equal(s.lastEnemyAttack.outcome, 'hit');
    close(s.lastEnemyAttack.damage, expected); close(s.playerHp, 50 - expected);
  }
});

test('current live saves upgrade once at either tier without losing prior combat damage or resources', () => {
  for(const [tier,wins] of [[1,0],[1,100],[2,0],[2,21],[2,25],[2,100]]) {
    const s=M.fresh('gym');s.target=tier;s.tiers[tier].wins=wins;s.idleStarted=true;
    s.fingerprint=OPENING;
    const oldMax=(tier===1?80:155)+E.addedHp(wins);s.enemyHp=oldMax-20;
    const before=structuredClone(s);M.settle(s,s.now);
    close(s.enemyHp,oldMax*.8-20);assert.equal(s.balanceUpgrades.length,5);
    assert.equal(s.balanceUpgrades[0].id,'s1-s2-reduction-2026-11-01');
    assert.deepEqual(s.wallet,before.wallet);assert.deepEqual(s.ledger,before.ledger);assert.deepEqual(s.tiers,before.tiers);
    assert.equal(s.rng,before.rng);assert.equal(s.nextPlayerAt,before.nextPlayerAt);assert.equal(s.nextEnemyAt,before.nextEnemyAt);assert.equal(s.playerHp,before.playerHp);
    const once=structuredClone(s);M.settle(s,s.now);assert.deepEqual(s,once);
    const low=structuredClone(before);low.enemyHp=1;M.settle(low,low.now);assert.equal(low.enemyHp,1);assert.deepEqual(low.tiers,before.tiers);
    const fraction=structuredClone(before);fraction.enemyHp=.2;M.upgradeOpeningBalance(fraction);assert.equal(fraction.enemyHp,.2);
  }
});

test('later tiers and historical profiles without an override retain their original curves', () => {
  for(const [tier,hp,damage] of [[3,320,8],[4,550,14]]) for(const wins of [0,25,100,200]) {
    const row=M.rules.snowmen[tier-1];assert.equal(hpAtDefeats(row,wins),hp+E.addedHp(wins));assert.equal(damageAtDefeats(row,wins),damage+Math.floor(wins/25));
  }
  const s=E.fresh();assert.equal(s.enemyHp,E.config.snowmen[0].hp);
  for(const row of E.config.snowmen) assert.equal(row.statPercent,undefined);
  const audit=A.fresh(1);audit.s.target=5;A.attach(audit,A.AUDIT.packages[0]);assert.equal(A.enemy(audit).hp,900);assert.equal(A.enemy(audit).damage,22);
});
