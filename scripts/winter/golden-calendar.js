// Corrected 100-win route with real overnight gaps; offline only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const M=require('../../services/winter/studies/chapter-simulation'),H=M.HOUR;
const patterns=[
 {id:'four-short-visits',hours:[0,5,10,15],label:'Four daily visits, 5h/5h/5h/9h gaps'},
 {id:'hourly-awake',hours:Array.from({length:16},(_,i)=>i),label:'Hourly while awake, 9h overnight gap'},
 {id:'five-minute-awake-stockpile',hours:Array.from({length:181},(_,i)=>i/12),label:'Five-minute awake proxy, 9h overnight gap; save Fire batches50',fireMinBatch:50},
 {id:'twice-daily',hours:[0,12],label:'Two daily visits, 12h apart'}
];
function run(seed,pattern){
 const c=M.rules(M.defaults.experimentalFireCandidates[1]),s=M.fresh(seed,c),events=[];
 for(let day=0;day<=c.durationDays;day++)for(const h of pattern.hours)events.push(Math.round((day*24+h)*H));
 for(let i=1;i<events.length;i++){
  const at=events[i];if(at>c.durationDays*24*H)break;
  M.settle(s,at,c);M.visit(s,(events[i+1]||at+24*H)-at,c,'strength',{fireMinBatch:pattern.fireMinBatch});
  if(s.golden)break;
 }
 assert(s.golden);return{seed,pattern:pattern.id,state:s};
}
function main(){
 const out=path.resolve(process.argv[2]||'artifacts/winter-golden-calendar-2026-10-29');if(fs.existsSync(out))throw Error('Preserve prior evidence.');fs.mkdirSync(out,{recursive:true});
 const results=[],summary=[],q=(v,p)=>[...v].sort((a,b)=>a-b)[Math.floor((v.length-1)*p)];
 for(const pattern of patterns){
  const rows=Array.from({length:64},(_,i)=>run(1020001+i,pattern));assert.deepEqual(run(1020001,pattern),rows[0]);results.push(...rows);
  const metrics={};for(const name of ['iron','iceRecipe','enterS3','fireUnlock','golden']){
   const v=rows.map(r=>r.state.milestones[name]/H);metrics[name]={p10Hours:q(v,.1),medianHours:q(v,.5),p90Hours:q(v,.9)};
  }summary.push({pattern:pattern.id,label:pattern.label,seeds:64,metrics});
 }
 const manifest={};for(const file of ['config/winter/game/balance.json','services/winter/studies/chapter-simulation.js','scripts/winter/golden-calendar.js']){
  const bytes=fs.readFileSync(file),dest=path.join(out,'model',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);manifest[file]=crypto.createHash('sha256').update(bytes).digest('hex');}
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results));fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({assumptions:'Post-tutorial Stone/STR3 at hour0, four visits correspond08:00/13:00/18:00/23:00, active schedules08:00 through23:00,9h overnight. Retain100 predecessor wins; Ice purchasable duringS2; current passive/STR-only training, half-production ammo, accuracy penalty, actual coats/recipe purchases, experimental Fire40/4000. Five-minute proxy uses experimental50-ball stockpiling. Golden is7210 cumulative Buttons, no challenger diversions or unknown Yellow/S5 combat. Clock excludes pre-Stone tutorial time. Date estimates shift by actual start time.',manifest,histories:results.length,replays:patterns.length,summary},null,2));
 console.log(JSON.stringify(summary,null,2));
}
if(require.main===module)main();module.exports={run,patterns};
