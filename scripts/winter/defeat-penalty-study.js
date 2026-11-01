// Offline experiment only. Persisted-state engine; no bot/live database imports.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const M=require('../../services/winter/early-progression'),{gymBaseline}=require('./strength-investment');
const H=M.HOUR,END=24*H;
function run(seed,visitHours,penalty,options={}){
 const c=structuredClone(M.config),s=M.fresh(c),base=gymBaseline(c);
 s.strength=base.strength;s.sweat=base.sweat;s.gymStarterClaimed=true;s.equipped='red';
 let x=seed>>>0;const random=()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;};
 const rng={combat:random,buttons:()=>.99},interval=visitHours*H,end=options.untilStrength25?7*24*H:END;
 let nextVisit=interval,lastProduction=0,penalized=false,lastPlayerAt=0,penalizedMs=0,penaltyActivations=0,resets=0;
 const snapshots=[];
 while(s.now<end){
  const at=Math.min(s.nextPlayerAt,s.nextEnemyAt,nextVisit,end),losses=Object.values(s.tiers).reduce((n,t)=>n+t.losses,0);
  const playerEvent=s.nextPlayerAt===at,elapsed=at-s.now;
  if(penalized)penalizedMs+=elapsed;
  c.playerIntervalMs=penalized&&penalty==='interval6'?6000:3000;
  c.playerAccuracy=penalized&&penalty==='accuracy35'?.35:.7;
  assert(M.settle(s,at,rng,c).complete);
  if(playerEvent){assert(at-lastPlayerAt>=3000);lastPlayerAt=at;}
  const nowLosses=Object.values(s.tiers).reduce((n,t)=>n+t.losses,0);
  if(penalty!=='none'&&!penalized&&nowLosses>losses){
   penalized=true;penaltyActivations++;
   if(penalty==='interval6')s.nextPlayerAt=lastPlayerAt+6000;
   assert(s.nextPlayerAt>s.now);
  }
  if(at===nextVisit){
   // This visit includes Throw: settle first, then reset the penalty.
   if(penalized){resets++;if(penalty==='interval6')s.nextPlayerAt=Math.min(s.nextPlayerAt,at+3000);}
   penalized=false;c.playerIntervalMs=3000;c.playerAccuracy=.7;
   while(s.strength<25&&M.purchase(s,'strength',1,c)){}
   if(s.strength>=25&&!options.untilStrength25){M.purchase(s,'lift',1,c);M.purchase(s,'iron',1,c);}
   if(M.unlocked(s,s.target+1,c))M.select(s,s.target+1,c);
   const produced=s.ledger.snowProduced-lastProduction;lastProduction=s.ledger.snowProduced;
   if(s.strength<25||options.untilStrength25){const qty=Math.floor(Math.min(s.snow,produced/2)/c.redSnowCost);if(qty)M.purchase(s,'red',qty,c);}
   nextVisit+=interval;
   snapshots.push({hours:at/H,strength:s.strength,combatSweat:s.ledger.combatSweat,
    passiveSweat:s.ledger.passiveSweat+s.sweatRemainder/H,target:s.target,wins:Object.values(s.tiers).map(t=>t.wins)});
  }
  // Historical attacks include normal intervals; validate against the global
  // maximum cadence, not the currently slowed interval.
  M.assertLedger(s,{...c,playerIntervalMs:3000});
  if(options.untilStrength25&&s.strength>=25)break;
 }
 const combat=s.ledger.combatSweat,passive=s.ledger.passiveSweat+s.sweatRemainder/H,tiers=Object.values(s.tiers);
 return {seed,visitHours,penalty,combat,passive,total:combat+passive,strength:s.strength,iron:s.iron,
  hours:s.now/H,snow:s.snow,snowProduced:s.ledger.snowProduced,redSnow:s.ledger.redSnow,regularSnow:s.ledger.regularSnow,redRemaining:s.red,
  firstLossHours:s.milestones.firstLoss/H,penalizedHours:penalizedMs/H,penaltyActivations,resets,
  attacks:tiers.reduce((n,t)=>n+t.attacks,0),red:tiers.reduce((n,t)=>n+t.red,0),regular:tiers.reduce((n,t)=>n+t.regular,0),
  wins:tiers.map(t=>t.wins),losses:tiers.reduce((n,t)=>n+t.losses,0),snapshots};
}
function main(){
 const out=path.resolve(process.argv[2]||'artifacts/winter-defeat-penalty-study-2026-10-29');
 if(fs.existsSync(out))throw Error('Preserve earlier evidence.');fs.mkdirSync(out,{recursive:true});
 const results=[],summary=[];
 for(const visitHours of [1,4,12,24]){
  const baseline=Array.from({length:128},(_,i)=>run(940001+i,visitHours,'none'));
  for(const penalty of ['none','interval6','accuracy35']){
   const rows=penalty==='none'?baseline:Array.from({length:128},(_,i)=>run(940001+i,visitHours,penalty));
   assert.deepEqual(run(940001,visitHours,penalty),rows[0]);results.push(...rows);
   const mean=(rows,key)=>rows.reduce((n,r)=>n+r[key],0)/rows.length;
   const metrics=Object.fromEntries(['combat','passive','total','strength','penalizedHours','attacks','red','losses'].map(k=>[k,mean(rows,k)]));
   summary.push({visitHours,penalty,seeds:rows.length,...metrics,
    combatReductionPct:100*(1-mean(rows,'combat')/mean(baseline,'combat')),
    totalReductionPct:100*(1-mean(rows,'total')/mean(baseline,'total'))});
  }
 }
 const manifest={};for(const file of ['scripts/winter/defeat-penalty-study.js','config/winter/early-progression.json','services/winter/early-progression.js']){
  const bytes=fs.readFileSync(file),dest=path.join(out,'model',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);manifest[file]=crypto.createHash('sha256').update(bytes).digest('hex');
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results));
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({assumptions:'24h after post-Gym STR3/Stone start, zero supplies, current passive floor(STR/3). Visits include Throw, training up to STR25, Iron purchase if affordable, next-tier selection and Spicy purchase using half newly produced snow below STR25. Regular fallback. Penalty activates after first defeat since Throw, never stacks, resets only after settlement on next visit. interval6 means attacks every six seconds; accuracy35 means 35% player accuracy. Full-health retries remain. No discarded time, no additional weapons/clothing/Accuracy. Arithmetic means across 128 paired seeds per case; no claim about real player visit-frequency distribution.',manifest,histories:results.length,exactScenarioReplays:12,summary},null,2));
 console.log(JSON.stringify(summary,null,2));
}
if(require.main===module)main();module.exports={run};
