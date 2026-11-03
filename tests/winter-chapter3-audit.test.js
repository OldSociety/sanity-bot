const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../services/winter/studies/chapter3-audit-model');
function setup(index=0){const m=M.fresh(123);m.s.golden=true;m.s.reinforced=true;m.s.playerHp=150;m.s.owned[5]=true;m.s.target=5;
 M.attach(m,M.AUDIT.packages[index]);m.s.enemyHp=M.enemy(m).hp;m.s.yellowRecipe=true;m.s.equipped='yellow';return m;}
function supply(m,n){const{s}=m;s.yellow+=n;s.ledger.yellowProduced+=n;s.snow+=n*m.p.yellowSnowCost;s.ledger.snowProduced+=n*m.p.yellowSnowCost;M.craft(m,'yellow',Infinity);}
test('shared training prices any allocation by total levels; tutorial remains2+3',()=>{
 const m=M.fresh(1);m.s.sweat=10000;m.s.ledger.combatSweat=10000; // Training arithmetic fixture, not a combat-ledger fixture.
 M.train(m,'spc');assert(m.s.special>0);const total=M.levelSum(m.s);assert.equal(m.s.ledger.trainingSweat,total*(total+1)/2-6);
 assert.equal(75*76/2-6,2844);assert.equal(76*77/2-6,2920);
});
test('persistent poison produces one corpse per10 throws even on misses',()=>{
 const m=setup();m.c.playerAccuracy=0;m.c.defeatedAccuracy=0;
 m.s.enemyHp=1e9;m.p.s5Hp=1e9;m.p.s5Damage=0;supply(m,20);M.settle(m,60000);
 assert.equal(m.s.ledger.corpsesEarned,2);assert.equal(m.s.poison,0);assert.equal(m.s.tiers[5].yellow,20);assert.equal(m.s.tiers[5].hits,0);M.validate(m);
});
test('persistent exposure survives ordinary defeats and Throw',()=>{
 const m=setup();m.s.poison=6;m.s.playerHp=1;m.s.nextP=12000;m.s.nextE=10000;m.s.now=9000;
 // Do not validate artificial cadence fixture; verify death semantics directly.
 M.settle(m,10000);assert.equal(m.s.ledger.enemyDefeats,1);assert.equal(m.s.poison,6);assert.equal(m.s.ledger.corpsesEarned,0);
});
test('actual flat HP sacrifice needs more Yellow at higher HP',()=>{
 const a=setup(4),b=setup(4);a.p.s5Damage=b.p.s5Damage=0;a.p.s5Hp=b.p.s5Hp=1e9;a.s.enemyHp=b.s.enemyHp=1e9;
 b.s.maxHpOverride=250;b.s.playerHp=250;supply(a,40);supply(b,40);M.settle(a,120000);M.settle(b,120000);
 assert.equal(a.s.ledger.corpsesEarned,5);assert.equal(b.s.ledger.corpsesEarned,3);
});
test('fractional HP sacrifice is normalized across150 and250HP absent enemy damage',()=>{
 const a=setup(3),b=setup(3);a.p.s5Damage=b.p.s5Damage=0;a.p.s5Hp=b.p.s5Hp=1e9;a.s.enemyHp=b.s.enemyHp=1e9;
 b.s.maxHpOverride=250;b.s.playerHp=250;supply(a,40);supply(b,40);M.settle(a,120000);M.settle(b,120000);
 assert.equal(a.s.ledger.corpsesEarned,4);assert.equal(b.s.ledger.corpsesEarned,4);
});
test('zero-damage Yellow attempts still consume ammo, advance poisoning and earn Buttons',()=>{
 const m=setup();m.p.yellowDamage=0;m.c.buttonChance=1;supply(m,10);M.settle(m,30000);
 assert.equal(m.s.buttons,10);assert.equal(m.s.ledger.corpsesEarned,1);assert.equal(m.s.tiers[5].wins,0);
});
test('Throw restores accuracy without clearing persistent exposure',()=>{
 const m=setup();m.s.poison=6;m.s.penalized=true;M.visit(m,4*M.H,'strength');
 assert.equal(m.s.poison,6);assert(!m.s.penalized);
});
test('Fire fallback belt uses stocked Fire without adding Yellow exposure',()=>{
 const m=setup();m.s.belt=true;m.s.fireUnlock=true;m.s.rng.combat=1;m.s.snow=4000;m.s.ledger.snowProduced=4000;
 M.craft(m,'fire',4000);M.settle(m,3000);assert.equal(m.s.tiers[5].fire,1);assert.equal(m.s.poison,0);assert.equal(m.s.enemyHp,870);M.validate(m);
});
test('three Kitchen phases consume the declared corpses once and final craft trades Golden',()=>{
 const m=setup();m.p.ritualSteps=3;m.p.winRequirement=100;m.s.tiers[5].wins=100;m.s.ledger.combatSweat=500;m.s.sweat=500;
 m.s.corpses=360;m.s.ledger.corpsesEarned=360;m.s.snow=100000000;m.s.ledger.snowProduced=100000000;m.s.productionAtVisit=100000000;
 m.s.iron=true;m.s.iceRecipe=true;
 M.visit(m,4*M.H,'strength');assert.equal(m.s.ritualPhase,1);assert.equal(m.s.corpses,240);assert(!m.s.necro);
 M.visit(m,4*M.H,'strength');assert.equal(m.s.ritualPhase,2);assert.equal(m.s.corpses,120);
 M.visit(m,4*M.H,'strength');assert(m.s.necro);assert(!m.s.golden);assert.equal(m.s.ledger.craftSnow,25000000);assert.equal(m.s.ledger.corpsesSpent,360);
 M.visit(m,4*M.H,'strength');assert.equal(m.s.ledger.craftSnow,25000000);M.validate(m);
});
test('SPC eligibility needs all three25s and DEF unlock is an explicit candidate',()=>{
 const m=setup();m.s.strength=25;m.s.accuracy=25;m.s.defense=24;assert(!M.eligible(m,'special'));
 m.s.defense=25;assert(M.eligible(m,'special'));m.c.defenseUnlock='ACC25';m.s.accuracy=24;assert(!M.eligible(m,'defense'));
});
test('return-progress metric includes corpses and victories earned during the absence',()=>{
 const {progressVisits}=require('../scripts/winter/chapter3-audit');
 const r={entryHours:0,goldStats:{strength:25,accuracy:0,defense:0,special:0},milestones:{},
  visitPoints:[[1,0,1,25,0,0,0],[2,0,1,25,0,0,0],[3,1,1,25,0,0,0]]};
 assert.equal(progressVisits(r),1);
});
test('whole yield recipes retain unused yellow and never create free snow',()=>{
 const m=setup();m.s.yieldN=3;m.s.yieldD=2;m.s.yellow=5;m.s.ledger.yellowProduced=5;
 m.s.snow=24000;m.s.ledger.snowProduced=24000;M.craft(m,'yellow',24000);
 assert.equal(m.s.ammo.yellow,6);assert.equal(m.s.yellow,1);assert.equal(m.s.ledger.yellowSpent,4);M.validate(m);
});
test('mutual KO awards the player a win without a defeat or corpse, with one reset',()=>{
 const m=setup();m.s.poison=9;m.s.enemyHp=.01;m.s.accuracy=100;m.s.rng.combat=1;supply(m,1);M.settle(m,3000);
 assert.equal(m.s.ledger.corpsesEarned,0);assert.equal(m.s.tiers[5].losses,0);assert.equal(m.s.tiers[5].wins,1);assert.equal(m.s.ledger.mutualKos,1);assert.equal(m.s.playerHp,150);
});
test('poison self-defeat resets accuracy but cannot be doubled by same-time replay',()=>{
 const m=setup();supply(m,10);M.settle(m,30000);const saved=structuredClone(m);M.settle(m,30000);
 assert.deepEqual(m,saved);assert(m.s.penalized);
});
test('normal defeats award no corpses and a fragile recipe loses exposure',()=>{
 const m=setup(6);m.s.poison=6;m.s.playerHp=1;m.s.nextP=12000;m.s.nextE=10000;m.s.now=9000;
 M.settle(m,10000);assert.equal(m.s.poison,0);assert.equal(m.s.poisonLost,6);assert.equal(m.s.ledger.corpsesEarned,0);
});
test('DOT ticks are chronological, refresh without delaying the next tick, and clear on defeat',()=>{
 const m=setup(6);m.s.accuracy=100;m.p.s5Damage=0;m.s.rng.combat=1;supply(m,4);M.settle(m,12000);
 assert(m.s.nextDot<=22000);const b=structuredClone(m);M.settle(m,60000);for(let t=b.s.now+1000;t<=60000;t+=1000)M.settle(b,t);
 assert.deepEqual(m,b);
});
test('JSON checkpoint replays resource accrual, poisoning, both RNG streams and timers',()=>{
 const m=setup();supply(m,100);M.settle(m,45000);const restored=JSON.parse(JSON.stringify(m));
 // JSON null encodes inactive Infinity timers; normalize persisted timer sentinel.
 if(restored.s.nextDot===null)restored.s.nextDot=Infinity;
 M.settle(m,6*M.H);M.settle(restored,6*M.H);assert.deepEqual(m,restored);M.validate(m);
});
test('Golden yellow accrual is prospective and exact across chunks',()=>{
 const a=setup(),b=structuredClone(a);M.settle(a,24*M.H);for(let t=M.H;t<=24*M.H;t+=M.H)M.settle(b,t);
 assert.deepEqual(a,b);assert.equal(a.s.ledger.yellowProduced,18*24);M.validate(a);
});
