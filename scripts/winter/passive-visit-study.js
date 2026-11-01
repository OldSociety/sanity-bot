// Offline-only pacing experiment. No runtime imports, credentials or live DB.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const M=require('../../services/winter/early-progression'),{gymBaseline}=require('./strength-investment');
const H=M.HOUR, LIMIT=7*24*H;
const visits=[{name:'5-minute proxy',hours:1/12},{name:'Hourly',hours:1},{name:'Every 4h',hours:4},{name:'Every 12h',hours:12},{name:'Daily',hours:24}];
function run(seed,multiplier,visitHours){
 const c=structuredClone(M.config);c.passive.divisor=3/multiplier;
 const s=M.fresh(c),base=gymBaseline(c);s.strength=base.strength;s.sweat=base.sweat;s.gymStarterClaimed=true;s.equipped='red';
 let x=seed>>>0;const random=()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;};
 const rng={combat:random,buttons:()=>.99},records=[];
 const interval=Math.round(visitHours*H);let lastProduction=0;
 for(let at=interval;at<=LIMIT;at+=interval){
  assert(M.settle(s,at,rng,c).complete);
  while(s.strength<25&&M.purchase(s,'strength',1,c)){}
  if(s.strength>=25){M.purchase(s,'lift',1,c);M.purchase(s,'iron',1,c);}
  if(M.unlocked(s,s.target+1,c))M.select(s,s.target+1,c);
  const production=s.ledger.snowProduced-lastProduction;lastProduction=s.ledger.snowProduced;
  // Same spending policy at every visit: half of new production for Spicy,
  // half saved for Iron; do not buy extra Spicy after STR25 is achieved.
  if(s.strength<25){const qty=Math.floor(Math.min(s.snow,production/2)/c.redSnowCost);if(qty)M.purchase(s,'red',qty,c);}
  M.assertLedger(s,c);
  records.push({hours:at/H,strength:s.strength,passiveRate:M.passiveRate(s.strength,c),snow:s.snow,
   sweat:s.sweat,target:s.target,wins:Object.values(s.tiers).map(t=>t.wins),combatSweat:s.ledger.combatSweat,passiveSweat:s.ledger.passiveSweat});
  if(s.iron)break;
 }
 return {seed,multiplier,visitHours,reached:s.iron,strength25Hours:s.milestones.strength25/H,ironHours:s.milestones.iron/H,
  endHours:s.now/H,strength:s.strength,ledger:s.ledger,records};
}
function main(){
 const out=path.resolve(process.argv[2]||'artifacts/winter-passive-visit-study-2026-10-29');
 if(fs.existsSync(out))throw Error('Choose a new evidence directory.');fs.mkdirSync(out,{recursive:true});
 const results=[],summary=[],q=(v,p)=>v.length?[...v].sort((a,b)=>a-b)[Math.floor((v.length-1)*p)]:null;
 for(const multiplier of [1,2,3])for(const visit of visits){
  const rows=Array.from({length:64},(_,i)=>run(801001+i,multiplier,visit.hours));
  assert.deepEqual(run(801001,multiplier,visit.hours),rows[0]);results.push(...rows);
  const hours=rows.filter(r=>r.reached).map(r=>r.ironHours),str=rows.map(r=>r.strength25Hours).filter(Number.isFinite);
  summary.push({multiplier,startingPassive:multiplier,visit:visit.name,visitHours:visit.hours,seeds:rows.length,reached:hours.length,
   strength25Median:q(str,.5),ironP10:q(hours,.1),ironMedian:q(hours,.5),ironP90:q(hours,.9)});
 }
 const manifest={};for(const file of ['config/winter/early-progression.json','services/winter/early-progression.js','scripts/winter/passive-visit-study.js']){
  const bytes=fs.readFileSync(file);manifest[file]=crypto.createHash('sha256').update(bytes).digest('hex');const dest=path.join(out,'model',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);
 }
 const assumptions='Post-Gym STR3, Stone, zero wallet/supplies. Continuous full-health retries. At each visit settle all elapsed time, train up to STR25, lift/buy Iron if affordable, advance to next unlocked tier, buy Spicy with half newly produced snow below STR25. No automatic purchases between visits, no decay, no discarded time, no coat/Accuracy. STR25 training stops to isolate Iron milestone. Passive floor(multiplier*STR/3) through STR25. 7-day limit. Visits scheduled at fixed intervals, zero interaction downtime.';
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results));
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({assumptions,manifest,histories:results.length,replays:summary.length,summary},null,2));
 console.log(JSON.stringify(summary,null,2));
}
if(require.main===module)main();module.exports={run,visits};
