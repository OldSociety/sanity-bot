// Chapter-one snow budget at STR25; the price of Iron is deliberately unpaid.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {run}=require('./defeat-penalty-study');
function main(){
 const out=path.resolve(process.argv[2]||'artifacts/winter-iron-snow-budget-2026-10-29');
 if(fs.existsSync(out))throw Error('Preserve existing evidence.');fs.mkdirSync(out,{recursive:true});
 const results=[],summary=[],q=(v,p)=>[...v].sort((a,b)=>a-b)[Math.floor((v.length-1)*p)];
 for(const visitHours of [1,4,12,24])for(const penalty of visitHours===4?['none','accuracy35']:['accuracy35']){
  const rows=Array.from({length:64},(_,i)=>run(940001+i,visitHours,penalty,{untilStrength25:true}));
  assert.deepEqual(run(940001,visitHours,penalty,{untilStrength25:true}),rows[0]);results.push(...rows);
  for(const r of rows){assert.equal(r.strength,25);assert(!r.iron);assert.equal(r.snowProduced,r.hours*129600);assert.equal(r.snowProduced-r.redSnow-r.regularSnow,r.snow);assert.equal(r.redSnow,(r.red+r.redRemaining)*1000);}
  const metrics={};for(const key of ['hours','snowProduced','redSnow','regularSnow','snow','redRemaining','combat','passive']){
   const values=rows.map(r=>r[key]);metrics[key]={mean:values.reduce((a,b)=>a+b,0)/values.length,p10:q(values,.1),median:q(values,.5),p90:q(values,.9)};
  }
  const affordability={};for(const price of [1000000,2000000,2500000,3000000,4000000])affordability[price]=rows.filter(r=>r.snow>=price).length;
  summary.push({visitHours,penalty,seeds:rows.length,metrics,affordability});
 }
 const manifest={};for(const file of ['scripts/winter/iron-snow-budget.js','scripts/winter/defeat-penalty-study.js','services/winter/studies/early-progression.js','config/winter/studies/early-progression.json']){
  const bytes=fs.readFileSync(file),dest=path.join(out,'model',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);manifest[file]=crypto.createHash('sha256').update(bytes).digest('hex');
 }
 const assumptions='Stone STR3, zero starting currency/ammo. Passive floor(STR/3); continuous retries; after first defeat per Throw window accuracy 70% to 35%, until next scheduled Throw. Manual training/next-tier selection at visits. Half each interval new production buys whole Spicy at 1,000 snow, including final STR25 visit; remaining snow also funds regular fallback at 10 snow/attack. Stop at first STR25 visit before paying any Iron price. Final ammo batch is allocated to honor the half-production spending assumption. No Ice, coat, stat purchases other than STR, tutorial time or prior savings. Current rules are simulation candidates only.';
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results));fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({assumptions,manifest,histories:results.length,exactReplays:summary.length,summary},null,2));console.log(JSON.stringify(summary,null,2));
}
if(require.main===module)main();
