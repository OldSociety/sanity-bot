const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const M=require('../../services/winter/chapter3-audit-model'),R=require('./chapter3-audit');
function candidates(){
 const shopItems=[{id:'potency',buttons:600,yellowMultiplier:1.25},{id:'yield',buttons:1200,yieldNumerator:3,yieldDenominator:2}];
 const a={...structuredClone(M.AUDIT.packages[0]),id:'focused-ritual',name:'Focused persistent ritual',winRequirement:100,ritualSteps:3,shopItems,
  necroOrdinaryMultiplier:3,necroYellowMultiplier:4};
 const b={...structuredClone(M.AUDIT.packages[3]),id:'focused-blood',name:'Focused actual HP sacrifice',corpseTarget:420,ritualSteps:3,shopItems,
  necroOrdinaryMultiplier:3,necroYellowMultiplier:4};
 const c={...structuredClone(M.AUDIT.packages[1]),id:'focused-scarce',name:'Focused scarce corrosion',corpseTarget:210,winRequirement:100,shopItems,
  necroOrdinaryMultiplier:3,necroYellowMultiplier:4};
 return[a,b,c];
}
function main(){
 const root=path.resolve(process.argv[2]||'artifacts/winter-chapter3-audit-2026-10-29'),out=path.join(root,'confirmation');if(fs.existsSync(out))throw Error('Preserve confirmation evidence.');fs.mkdirSync(out);
 const plans=candidates();fs.writeFileSync(path.join(out,'plan.json'),JSON.stringify({status:'Data-informed refinement, not original preregistration or owner-approved values',seeds:64,seedStart:1040001,candidates:plans,rationale:'Screening ablations found little progress from HP/belt, but clear combat benefit from potency and harvest benefit from yield. Confirm three identities with two functional items and three Kitchen milestones; retain100 S5 victories, no S10 requirement.'},null,2));
 const entries=[];for(const profile of M.AUDIT.visitProfiles)for(const policy of M.AUDIT.trainingPolicies){for(let i=0;i<64;i++)entries.push(R.prepare(1040001+i,profile,policy));console.log(JSON.stringify({stage:'confirmation-entry',profile,policy}));}
 fs.writeFileSync(path.join(out,'entries.json'),JSON.stringify(entries));const summaries=[];
 for(const p of plans){const all=[];for(const profile of M.AUDIT.visitProfiles)for(const policy of M.AUDIT.trainingPolicies){
  const inputs=entries.filter(e=>e.profile===profile&&e.policy===policy),rows=inputs.map(e=>R.continueChapter(e,p));assert.deepEqual(R.continueChapter(inputs[0],p),rows[0]);
  all.push(...rows);const sum=R.summarize(rows);summaries.push(sum);console.log(JSON.stringify({stage:'confirm',package:p.id,profile,policy,completed:sum.completed,days:sum.medianChapterHours===null?null:sum.medianChapterHours/24,eventDay:sum.medianEventHours===null?null:sum.medianEventHours/24,s5:sum.s5Wins.median}));
 }fs.writeFileSync(path.join(out,p.id+'-results.json'),JSON.stringify(all));fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summaries,null,2));}
 const manifest={};for(const file of ['services/winter/chapter3-audit-model.js','config/winter/chapter3-audit-2026-10-29.json','config/winter/chapters-2026-10-29.json','config/winter/early-progression.json','services/winter/early-progression.js','scripts/winter/chapter3-audit.js','scripts/winter/chapter3-confirmation.js']){
  const b=fs.readFileSync(file),dest=path.join(out,'model',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,b);manifest[file]=crypto.createHash('sha256').update(b).digest('hex');}
 fs.writeFileSync(path.join(out,'complete.json'),JSON.stringify({manifest,histories:64*27,scenarioReplays:27,groups:summaries.length,allGroupsComplete:summaries.length===27},null,2));
}
if(require.main===module)main();module.exports={candidates};
