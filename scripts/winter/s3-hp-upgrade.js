// Price/power experiment only; no live bot imports or activation.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {run}=require('./s3-before-ice');
const cases=[
 {id:'100hp-control',stocked:false,penalty:true,starterRed:1555},
 {id:'150hp-at-200-buttons',stocked:false,penalty:true,starterRed:1555,upgradeHp:150,upgradeCost:200},
 {id:'150hp-from-start-control',stocked:false,penalty:true,starterRed:1555,startHp:150}
];
function main(){
 const out=path.resolve(process.argv[2]||'artifacts/winter-s3-hp-upgrade-2026-10-29');
 if(fs.existsSync(out))throw Error('Preserve old evidence.');fs.mkdirSync(out,{recursive:true});
 const results=[],summary=[],q=(v,p)=>v.length?[...v].sort((a,b)=>a-b)[Math.floor((v.length-1)*p)]:null;
 for(const scenario of cases){
  const rows=Array.from({length:128},(_,i)=>run(970001+i,scenario));assert.deepEqual(run(970001,scenario),rows[0]);results.push(...rows);
  if(scenario.upgradeHp)for(const r of rows){assert(r.upgrade);assert.equal(r.upgrade.cost,200);assert.equal(r.upgrade.hp,150);assert(r.upgrade.heldHp<=100);}
  const timeline=[4,8,12,24,28,48,72,144].map(hours=>{
   const points=rows.map(r=>r.snapshots.find(p=>p.hours===hours)),metrics={};
   for(const key of ['wins','losses','strength','combatSweat','passiveSweat','enemyHp','enemyDamage']){const v=points.map(p=>p[key]);metrics[key]={mean:v.reduce((a,b)=>a+b,0)/v.length,p10:q(v,.1),median:q(v,.5),p90:q(v,.9)};}
   return{hours,metrics,clearedS3:points.filter(p=>p.wins>=100).length};
  });
  const upgrades=rows.map(r=>r.upgrade?.hours).filter(Number.isFinite);
  summary.push({scenario:scenario.id,upgrade:{reached:upgrades.length,p10Hours:q(upgrades,.1),medianHours:q(upgrades,.5),p90Hours:q(upgrades,.9)},timeline,
   recipeMedianHours:q(rows.map(r=>r.recipe.hours),.5),recipeMedianWins:q(rows.map(r=>r.recipe.wins),.5)});
 }
 const manifest={};for(const file of ['scripts/winter/s3-hp-upgrade.js','scripts/winter/s3-before-ice.js','services/winter/studies/early-progression.js','config/winter/studies/early-progression.json']){
  const bytes=fs.readFileSync(file),dest=path.join(out,'model',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);manifest[file]=crypto.createHash('sha256').update(bytes).digest('hex');
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results));fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({assumptions:'Same S3 study as preserved prior: Iron, STR25, 100HP supplied, 1555 prepaid Spicy, zero recipe savings, four-hour Throw/training/ammo visits, current passive, first loss 70%->35% accuracy until Throw. Half new production buys Spicy. Upgrade offered on visits at 210 gross Buttons (10 reserved for initial coat plus 200 upgrade); only 200 deducted, initial coat is supplied with its 10-Button price reserved. No immediate healing: 150 max HP applies to next reset. Never equip Ice or leave S3; 28h recipe availability marks actual pre-Ice window; later times illustrate postponing Ice.',manifest,histories:results.length,scenarioReplays:cases.length,summary},null,2));
 console.log(JSON.stringify(summary.map(s=>({scenario:s.scenario,upgrade:s.upgrade,recipeHours:s.recipeMedianHours,recipeWins:s.recipeMedianWins,timeline:s.timeline.map(t=>({hours:t.hours,wins:t.metrics.wins,losses:t.metrics.losses.median,strength:t.metrics.strength.median,combatSweat:t.metrics.combatSweat.median,clearedS3:t.clearedS3}))})),null,2));
}
if(require.main===module)main();
