const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const M=require('../../services/winter/chapter3-audit-model'),H=M.H;
const files=['config/winter/chapters-2026-10-29.json','config/winter/chapter3-audit-2026-10-29.json','services/winter/chapter3-audit-model.js','services/winter/early-progression.js','scripts/winter/chapter3-audit.js'];
function saveModel(out){const manifest={};for(const file of files){const b=fs.readFileSync(file),dest=path.join(out,'model',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,b);manifest[file]=crypto.createHash('sha256').update(b).digest('hex');}return manifest;}
function prepare(seed,profile,policy,options={}){
 const m=M.fresh(seed,options),times=M.events(profile);
 for(let i=1;i<times.length&&times[i]<=31*24*H;i++){
  M.settle(m,times[i]);M.visit(m,(times[i+1]||times[i]+24*H)-times[i],policy,{fireMinBatch:profile==='frequent'?50:undefined});
  if(m.s.golden)return{seed,profile,policy,options,model:m,eventIndex:i};
 }
 return{seed,profile,policy,options,failedEntry:true,model:m};
}
function summaryPoint(m){const{s}=m;return[(s.now-s.chapterStart)/H,s.tiers[5].wins,s.ledger.corpsesEarned,s.strength,s.accuracy,s.defense,s.special,s.buttons,s.poison,s.yellow,M.maxHp(m)];}
function progressVisits(r){
 let levels=Object.values(r.goldStats||{}).reduce((a,b)=>a+b,0),wins=0,corpses=0,dry=0;
 const start=r.entryHours*H;
 for(const point of r.visitPoints||[]){const total=point.slice(3,7).reduce((a,b)=>a+b,0),at=start+point[0]*H;
  const milestone=Object.entries(r.milestones||{}).some(([k,t])=>t===at&&(k.startsWith('shop-')||k.startsWith('ritual')||k==='necro'));
  if(!(total>levels||point[1]>wins||point[2]>corpses||milestone))dry++;
  levels=total;wins=point[1];corpses=point[2];
 }return dry;
}
function continueChapter(entry,p,options={}){
 if(entry.failedEntry)return{seed:entry.seed,profile:entry.profile,policy:entry.policy,package:p.id,failedEntry:true,complete:false,chapterHours:null,eventHours:entry.model.s.now/H};
 const m=structuredClone(entry.model);if(m.s.nextDot===null)m.s.nextDot=Infinity;M.attach(m,p);
 const{s}=m,start=s.now,times=M.events(entry.profile),visits=[],snapshots=[];let nextSnapshot=start+12*H,dry=0,visitsCount=0,wait={corpses:0,combat:0,snow:0,phases:0};
 for(let i=entry.eventIndex+1;i<times.length&&times[i]<=31*24*H;i++){
  const at=times[i];
  while(nextSnapshot<=at){M.settle(m,nextSnapshot);M.validate(m);snapshots.push(summaryPoint(m));nextSnapshot+=12*H;}
  M.settle(m,at);
  const before={levels:M.levelSum(s),wins:s.tiers[5].wins,corpses:s.ledger.corpsesEarned,shop:s.chapterShop,phase:s.ritualPhase};
  M.visit(m,(times[i+1]||at+24*H)-at,entry.policy,options);
  visitsCount++;const prog=M.levelSum(s)>before.levels||s.tiers[5].wins>before.wins||s.ledger.corpsesEarned>before.corpses||s.chapterShop>before.shop||s.ritualPhase>before.phase;
  if(!prog)dry++;visits.push(summaryPoint(m));
  if(s.ledger.corpsesEarned>=p.corpseTarget)M.mark(m,'corpsesReady');
  if(s.tiers[5].wins>=p.winRequirement)M.mark(m,'combatReady');
  if(s.owned[5]&&!s.necro){if(s.ledger.corpsesEarned<p.corpseTarget)wait.corpses++;else if(s.tiers[5].wins<p.winRequirement)wait.combat++;else if(s.snow<p.craftSnow)wait.snow++;else wait.phases++;}
  if(s.necro)break;
 }
 M.validate(m);const end=s.now;
 const result={seed:entry.seed,profile:entry.profile,policy:entry.policy,package:p.id,complete:s.necro,entryHours:start/H,eventHours:end/H,chapterHours:(end-start)/H,
  goldStats:s.chapterStats,stats:{strength:s.strength,accuracy:s.accuracy,defense:s.defense,special:s.special},
  s5Wins:s.tiers[5].wins,s5Losses:s.tiers[5].losses,corpses:s.ledger.corpsesEarned,corpsesSpent:s.ledger.corpsesSpent,
  yellowProduced:s.ledger.yellowProduced,yellowSpent:s.ledger.yellowSpent,yellowUsed:s.tiers.reduce((n,t)=>n+t.yellow,0),yellowRemaining:s.yellow,
  poisonLost:s.poisonLost,mutualKos:s.ledger.mutualKos,enemyDefeats:s.ledger.enemyDefeats-s.chapterBaseline.enemyDefeats,
  chapterSweat:s.ledger.combatSweat+s.ledger.passiveSweat-s.chapterBaseline.combatSweat-s.chapterBaseline.passiveSweat,
  earnedSweat:s.ledger.combatSweat+s.ledger.passiveSweat,chapterButtons:s.ledger.buttonsEarned-s.chapterBaseline.buttonsEarned,
  snow:s.snow,buttons:s.buttons,visits:visitsCount,dryVisits:dry,wait,
  milestones:s.milestones,milestoneStates:s.milestoneStates,snapshots,visitPoints:visits,
  finalState:s,postNecro24h:s.necro?{snow:1296*p.necroOrdinaryMultiplier*86400,yellow:p.yellowPerHour*p.necroYellowMultiplier*24,characterPaths:4}:null};
 result.dryVisits=progressVisits(result);return result;
}
function quantile(v,p){return v.length?[...v].sort((a,b)=>a-b)[Math.floor((v.length-1)*p)]:null;}
function summarize(rows){
 const ok=rows.filter(r=>r.complete),times=ok.map(r=>r.chapterHours),n=rows.length;
 const population=(v,p)=>v.length>Math.floor((n-1)*p)?[...v].sort((a,b)=>a-b)[Math.floor((n-1)*p)]:null;
 const result={package:rows[0].package,profile:rows[0].profile,policy:rows[0].policy,seeds:n,completed:ok.length,
  completionRate:ok.length/n,medianChapterHours:population(times,.5),p10ChapterHours:population(times,.1),p90ChapterHours:population(times,.9),
  medianEventHours:population(ok.map(r=>r.eventHours),.5),byDay24:rows.filter(r=>r.complete&&r.eventHours<=24*24).length,
  conditionalSuccessMedianHours:quantile(times,.5),meanDryVisitFraction:rows.reduce((n,r)=>n+(r.dryVisits||0)/Math.max(1,r.visits||0),0)/n};
 for(const k of ['s5Wins','corpses','poisonLost','yellowUsed','chapterSweat','earnedSweat','snow','chapterButtons']){
  const v=rows.map(r=>r[k]).filter(Number.isFinite);result[k]={p10:quantile(v,.1),median:quantile(v,.5),p90:quantile(v,.9)};
 }
 result.stats={};for(const k of ['strength','accuracy','defense','special'])result.stats[k]=quantile(rows.map(r=>r.stats?.[k]).filter(Number.isFinite),.5);
 result.timeline=[24,48,72,96,120,144,168,240,336].map(h=>{
  const p=rows.map(r=>{const values=r.snapshots?.filter(p=>p[0]<=h);return values?.length?values[values.length-1]:r.complete&&r.chapterHours<=h?[r.chapterHours,r.s5Wins,r.corpses,r.stats.strength,r.stats.accuracy,r.stats.defense,r.stats.special,r.buttons,0,r.yellowRemaining,0]:null;}).filter(Boolean);
  return{hours:h,observed:p.length,medianS5Wins:quantile(p.map(p=>p[1]),.5),medianCorpses:quantile(p.map(p=>p[2]),.5),completed:rows.filter(r=>r.complete&&r.chapterHours<=h).length};
 });return result;
}
function main(){
 const out=path.resolve(process.argv[2]||'artifacts/winter-chapter3-audit-2026-10-29');if(fs.existsSync(out))throw Error('Preserve all prior evidence.');fs.mkdirSync(out,{recursive:true});
 const manifest=saveModel(out);fs.writeFileSync(path.join(out,'preregistered.json'),JSON.stringify({manifest,design:M.AUDIT,start:new Date().toISOString(),stages:['8 packages x3 profiles x3 allocations x32 seeds','every declared one-factor sensitivity','larger confirmation of shortlisted candidates'],cutoffEventDays:31},null,2));
 const entries=[];
 for(const profile of M.AUDIT.visitProfiles)for(const policy of M.AUDIT.trainingPolicies){
  for(let i=0;i<M.AUDIT.screenSeeds;i++)entries.push(prepare(1030001+i,profile,policy));
  console.log(JSON.stringify({stage:'entry',profile,policy,prepared:M.AUDIT.screenSeeds}));
 }
 fs.writeFileSync(path.join(out,'entries.json'),JSON.stringify(entries));const summaries=[];
 for(const p of M.AUDIT.packages){const all=[];
  for(const profile of M.AUDIT.visitProfiles)for(const policy of M.AUDIT.trainingPolicies){
   const group=entries.filter(e=>e.profile===profile&&e.policy===policy).map(e=>continueChapter(e,p));
   assert.deepEqual(continueChapter(entries.find(e=>e.profile===profile&&e.policy===policy),p),group[0]);all.push(...group);
   const sum=summarize(group);summaries.push(sum);console.log(JSON.stringify({stage:'screen',package:p.id,profile,policy,completed:sum.completed,medianDays:sum.medianChapterHours===null?null:sum.medianChapterHours/24,eventDay:sum.medianEventHours===null?null:sum.medianEventHours/24,s5:sum.s5Wins.median}));
  }
  fs.writeFileSync(path.join(out,p.id+'-results.json'),JSON.stringify(all));fs.writeFileSync(path.join(out,'screen-summary.json'),JSON.stringify(summaries,null,2));
 }
 fs.writeFileSync(path.join(out,'screen-complete.json'),JSON.stringify({histories:summaries.reduce((n,s)=>n+s.seeds,0),all72GroupsComplete:summaries.length===72,scenarioReplays:summaries.length},null,2));
}
if(require.main===module)main();module.exports={prepare,continueChapter,summarize,quantile,saveModel,progressVisits};
