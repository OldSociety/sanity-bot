const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const ROOT=path.resolve(process.argv[2]||path.join(__dirname,'../../artifacts/winter-strength-investment-2026-10-29'));
function reference(tier,weapon,policy,passive,seed,limit,modelRoot){
  const M=require(path.join(modelRoot,'services/winter/early-progression.js'));
  const R=require(path.resolve(__dirname,'../../services/winter/simulation-rng'));
  const C=passive?M.config:{...M.config,passive:{...M.config.passive,divisor:Number.MAX_SAFE_INTEGER}};
  const H=M.HOUR,DAY=24*H,s=M.fresh(C),saved=R.initial(seed),draws=R.streams(saved);
  s.strength=3;s.target=tier;s.enemyHp=s.enemyMaxHp=C.snowmen.find(r=>r.tier===tier).hp;
  const provision=31*DAY/C.playerIntervalMs+1;s.snow=2500000000;s.ledger.snowProduced=s.snow;
  if(weapon==='red'){s.red=provision;s.equipped='red';s.ledger.redSnow=provision*C.redSnowCost;s.snow-=s.ledger.redSnow;}
  if(weapon==='ice'){s.iceRecipe=true;s.ice=provision;s.equipped='ice';s.ledger.iceDiamonds=provision*C.iceDiamonds;
    s.ledger.diamondsCrafted=s.ledger.iceDiamonds;s.ledger.pressedSnow=s.ledger.iceDiamonds*C.diamondSnowCost;s.snow-=s.ledger.pressedSnow;}
  let nextVisit=policy==='daily'?DAY:Infinity;
  const purchases=[];
  while(s.now<limit){
    const rate=M.passiveRate(s.strength,C);
    const nextTraining=policy==='instant'&&s.strength<C.statCap&&rate>0?
      s.now+Math.ceil(((s.strength+1-s.sweat)*H-s.sweatRemainder)/rate):Infinity;
    const at=Math.min(s.nextPlayerAt,s.nextEnemyAt,nextVisit,nextTraining,limit);
    M.settle(s,at,draws,C);
    if(policy==='instant'||at===nextVisit){
      while(s.strength<C.statCap&&s.sweat>=s.strength+1){
        const cost=s.strength+1;
        assert(M.purchase(s,'strength',1,C));
        if(purchases.length<12)purchases.push({at,strength:s.strength,cost,wins:s.tiers[tier].wins});
      }
    }
    if(at===nextVisit)nextVisit+=DAY;
  }
  M.assertLedger(s,C);
  const r=s.tiers[tier];
  return{wins:r.wins,losses:r.losses,shots:r.attacks,hits:r.hits,enemyAttacks:r.enemyAttacks,enemyHits:r.enemyHits,
    playerHp:s.playerHp,enemyHp:s.enemyHp,enemyMaxHp:M.enemy(s,tier,C).hp,nextPlayerAt:s.nextPlayerAt,nextEnemyAt:s.nextEnemyAt,
    strength:s.strength,sweatWhole:s.sweat,sweatRemainder:s.sweatRemainder,combatSweat:s.ledger.combatSweat,
    trainingSpent:s.ledger.trainingSweat,passiveSweat:s.ledger.passiveSweat+s.sweatRemainder/H,rng:saved.combat,purchases};
}
function main(){
  const v=JSON.parse(fs.readFileSync(path.join(ROOT,'verification.json')));
  for(const[f,h]of Object.entries(v.manifest))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,'model',f))).digest('hex'),h);
  const modelRoot=path.join(ROOT,'model'),model=require(path.join(modelRoot,'scripts/winter/strength-investment.js'));
  const all=JSON.parse(fs.readFileSync(path.join(ROOT,'results.json')));
  let replays=0;
  for(const row of model.weapons)for(const tier of[1,2,3,4])for(const passive of[false,true])for(const policy of model.policies){
    const expected=all.find(r=>r.tier===tier&&r.weapon===row.id&&r.passive===passive&&r.policy===policy.id);
    assert.deepEqual(model.run(tier,row.id,policy.id,passive,expected.seed),expected);replays++;
  }
  let specialTimelineMatches=0,fixedModeMatches=0;
  for(const row of all.filter(r=>r.weapon!=='regular'&&r.policy==='fixed'&&!r.passive)){
    for(const variant of all.filter(r=>r.tier===row.tier&&r.weapon===row.weapon&&r.seed===row.seed)){
      assert.deepEqual(variant.timeline.map(p=>p[1]),row.timeline.map(p=>p[1]));specialTimelineMatches++;
    }
  }
  for(const row of all.filter(r=>r.weapon==='regular'&&r.policy==='fixed'&&!r.passive)){
    const other=all.find(r=>r.tier===row.tier&&r.weapon===row.weapon&&r.seed===row.seed&&r.policy==='fixed'&&r.passive);
    assert.deepEqual(row.timeline.map(p=>p[1]),other.timeline.map(p=>p[1]));fixedModeMatches++;
  }
  const nativeCases=[];
  for(const policy of['fixed','daily','instant'])for(const passive of[false,true])nativeCases.push([1,'regular',policy,passive]);
  nativeCases.push([2,'regular','instant',false],[2,'regular','instant',true],[4,'regular','instant',true],
    [1,'ice','instant',true],[3,'red','daily',true]);
  let matches=0;
  for(const[tier,weapon,policy,passive]of nativeCases){
    const actual=all.find(r=>r.tier===tier&&r.weapon===weapon&&r.policy===policy&&r.passive===passive&&r.seed===271828).final;
    const expected=reference(tier,weapon,policy,passive,271828,31*86400000,modelRoot);
    for(const[key,value]of Object.entries(expected)){
      if(key==='purchases')assert.deepEqual(actual.firstPurchases.map(({at,strength,cost,wins})=>({at,strength,cost,wins})),value);
      else if(key==='passiveSweat')assert(Math.abs(actual[key]-value)<1e-8);
      else assert.equal(actual[key],value,`Native mismatch: S${tier}/${weapon}/${policy}/passive=${passive}/${key}`);
    }
    matches++;process.stdout.write(`Native matched S${tier}/${weapon}/${policy}/passive=${passive}\n`);
  }
  fs.writeFileSync(path.join(ROOT,'independent-verification.json'),JSON.stringify({freshProcessReplays:replays,fullMonthNativeMatches:matches,
    specialTimelineMatches,fixedModeMatches,frozenInputsVerified:true},null,2)+'\n');
  process.stdout.write(JSON.stringify({freshProcessReplays:replays,fullMonthNativeMatches:matches,specialTimelineMatches,fixedModeMatches})+'\n');
}
if(require.main===module)main();
module.exports={reference};
