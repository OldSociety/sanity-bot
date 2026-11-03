// Offline candidate only: unlimited Spicy, fixed S1 versus immediate tier unlocks.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const M = require('../../services/winter/studies/early-progression');
const { gymBaseline } = require('./strength-investment');
const { createHash } = require('node:crypto');
const H=M.HOUR, limit=31*24*H;
function run(seed, passive, advanceTier, productionFunded=false) {
  const c=structuredClone(M.config);
  if(!passive)c.passive={divisor:1e12,breakpoint:1e12,exponent:.5};
  const s=M.fresh(c), base=gymBaseline(c);
  s.strength=base.strength;s.sweat=base.sweat;s.gymStarterClaimed=true;s.red=productionFunded?0:1000000;s.equipped='red';
  let x=seed>>>0;const random=()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;};
  const rng={combat:random,buttons:()=>.99};
  while(s.now<limit&&s.strength<25){
    const rate=M.passiveRate(s.strength,c);
    const nextTraining=rate?s.now+Math.ceil(((s.strength+1-s.sweat)*H-s.sweatRemainder)/rate):Infinity;
    const nextSupply=productionFunded&&!s.red?s.now+Math.max(1,Math.ceil(((c.redSnowCost-s.snow)*1000-s.snowRemainder)/c.stoneRate)):Infinity;
    const at=Math.min(s.nextPlayerAt,s.nextEnemyAt,nextTraining,nextSupply,limit);
    assert(at>s.now);
    assert(M.settle(s,at,rng,c).complete);
    if(productionFunded&&s.snow>=c.redSnowCost)M.purchase(s,'red',Math.floor(s.snow/c.redSnowCost),c);
    while(s.strength<25&&M.purchase(s,'strength',1,c)){}
    if(advanceTier&&s.strength<25&&M.unlocked(s,s.target+1,c))M.select(s,s.target+1,c);
  }
  const tiers=Object.values(s.tiers), shots=tiers.reduce((n,t)=>n+t.attacks,0);
  assert.equal(shots,Math.floor(s.now/c.playerIntervalMs));
  assert.equal(s.ledger.combatSweat+s.ledger.passiveSweat-s.ledger.trainingSweat,s.sweat);
  if(!productionFunded)assert.equal(1000000-s.red,shots);
  if(s.strength===25)assert.equal(s.ledger.trainingSweat,319);
  return {seed,passive,advanceTier,productionFunded,reached:s.strength===25,hours:s.now/H,strength:s.strength,target:s.target,
    wins:tiers.map(t=>t.wins),losses:tiers.reduce((n,t)=>n+t.losses,0),shots,
    redRemaining:s.red,sweatRemaining:s.sweat,redUsed:tiers.reduce((n,t)=>n+t.red,0),regularUsed:tiers.reduce((n,t)=>n+t.regular,0),
    ammoSnow:productionFunded?s.ledger.redSnow+s.ledger.regularSnow:shots*c.redSnowCost,combatSweat:s.ledger.combatSweat,passiveSweat:s.ledger.passiveSweat+s.sweatRemainder/H};
}
function main(){
 const out=path.resolve(process.argv[2]||'artifacts/winter-spicy-strength25-2026-10-29');
 if(fs.existsSync(out))throw Error('Preserve existing evidence; choose a new directory.');
 fs.mkdirSync(out,{recursive:true});
 const results=[],summary=[],q=(a,p)=>[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)*p)];
 for(const advanceTier of [false,true])for(const passive of [false,true]){
   const rows=Array.from({length:128},(_,i)=>run(762001+i,passive,advanceTier));
   assert.deepEqual(run(762001,passive,advanceTier),rows[0]);results.push(...rows);
   const reached=rows.filter(r=>r.reached), metrics={};
   for(const key of ['hours','shots','ammoSnow','combatSweat','passiveSweat','strength','losses']){
    const values=(reached.length?reached:rows).map(r=>r[key]);
    metrics[key]={p10:q(values,.1),median:q(values,.5),p90:q(values,.9)};
   }
   summary.push({route:advanceTier?'Advance when unlocked':'Stay S1',passive,reached:reached.length,total:rows.length,metrics});
 }
 const hashes={};for(const file of ['config/winter/studies/early-progression.json','services/winter/studies/early-progression.js','scripts/winter/spicy-strength25.js']){
  const bytes=fs.readFileSync(file);hashes[file]=createHash('sha256').update(bytes).digest('hex');
  const dest=path.join(out,'model',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results));
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({assumptions:'Post-Gym STR3/zero Sweat; 50HP; 70% accuracy; unlimited fixed-10 Spicy; instant STR purchases; zero interaction delay; no coat/accuracy/recipe/shovel purchases; 31-day limit; 128 seeds per case. Tier changes reset the fight at the existing global attack cadence.',hashes,summary},null,2));
 console.log(JSON.stringify(summary,null,2));
}
if(require.main===module)main();module.exports={run};
