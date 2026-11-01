const {test}=require('node:test'),assert=require('node:assert/strict');
const {trial,gymBaseline}=require('../scripts/winter/strength-investment');
const H=3600000;
test('completed Gym tutorial starts at STR3 with no Sweat; fourth S1 victory funds STR4',()=>{
  const t=trial(1,'regular','instant',false,1,{random:()=>0});
  t.advance(H);
  const s=t.snapshot(),first=s.firstPurchases[0];
  assert.equal(first.cost,4);assert.equal(first.strength,4);assert.equal(first.wins,4);
  assert.equal(first.combatSweat,4);assert.equal(first.passiveSweat,0);
});
test('Gym baseline comes from two purchases with the 5 Sweat gift rather than an automatic STR3 grant',()=>{
  assert.deepEqual(gymBaseline(),{entryStrength:1,gift:5,purchases:[
    {strength:2,cost:2,remainingSweat:3},{strength:3,cost:3,remainingSweat:0}],strength:3,sweat:0});
});
test('Gym tutorial entry never changes an existing claimed gift or paid Strength',()=>{
  const {enterGym}=require('../services/winter/gym');
  const old={gymVisited:1,gymStarterClaimed:1,sweat:6,gym:{strength:0}};
  assert.equal(enterGym(old),'');assert.equal(old.sweat,6);assert.equal(old.gym.strength,0);
  const trained={gymVisited:1,gymStarterClaimed:1,sweat:17,gym:{strength:25}};
  assert.equal(enterGym(trained),'');assert.equal(trained.sweat,17);assert.equal(trained.gym.strength,25);
});
test('fixed policy banks all Sweat and stays STR3; daily spends only after day ends',()=>{
  const fixed=trial(1,'regular','fixed',true,42);fixed.advance(2*24*H);
  assert.equal(fixed.snapshot().strength,3);assert.equal(fixed.snapshot().trainingSpent,0);
  const daily=trial(1,'regular','daily',true,42);
  assert.equal(daily.advance(24*H-1).strength,3);
  assert(daily.advance(24*H).strength>3);
  assert.equal(daily.snapshot().firstPurchases[0].at,24*H);
});
test('passive thresholds purchase immediately and apply the old rate prospectively',()=>{
  const t=trial(4,'regular','instant',true,42,{random:()=>.99});
  assert.equal(t.advance(4*H-1).strength,3);
  const at=t.advance(4*H);assert.equal(at.strength,4);assert.equal(at.trainingSpent,4);
  assert.equal(at.passiveSweat,4);assert.equal(at.sweat,0);
  assert.equal(t.advance(9*H).strength,5);
  const later=t.advance(15*H);assert.equal(later.strength,6);assert.equal(later.passiveSweat,15);
  assert.equal(t.advance(16*H).passiveSweat,17);
});
test('sample interval does not change purchase timing, ledger, RNG or combat',()=>{
  for(const policy of ['fixed','daily','instant'])for(const passive of [false,true]){
    const a=trial(1,'regular',policy,passive,123),b=trial(1,'regular',policy,passive,123);
    a.advance(1234567);a.advance(5*24*H);
    assert.deepEqual(a.snapshot(),b.advance(5*24*H));
  }
});
test('training STR cannot change fixed-damage Spicy and Ice combat',()=>{
  for(const weapon of ['red','ice']){
    const a=trial(1,weapon,'fixed',false,321).advance(3*24*H);
    const b=trial(1,weapon,'instant',true,321).advance(3*24*H);
    for(const key of ['wins','losses','hits','shots','rng','damageDealt','hpLost']) assert.equal(a[key],b[key]);
    assert(b.strength>a.strength);
  }
});
