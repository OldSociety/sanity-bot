// Correction audit: retain every 100-win gate, but permit pre-S3 Ice purchases.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {run,summarize}=require('./chapter-progression'),M=require('../../services/winter/chapter-simulation');
function main(){
 const out=path.resolve(process.argv[2]||'artifacts/winter-chapter-ice-availability-2026-10-29');if(fs.existsSync(out))throw Error('Preserve prior evidence.');fs.mkdirSync(out,{recursive:true});
 const results=[],summary=[];
 const cases=[...M.defaults.experimentalFireCandidates.map(f=>({fire:f,visitHours:4})),...[1,12,24].map(h=>({fire:M.defaults.experimentalFireCandidates[1],visitHours:h}))];
 for(const scenario of cases){const {fire,visitHours}=scenario;
  const rows=Array.from({length:32},(_,i)=>run(1010001+i,fire,visitHours,'strength'));assert.deepEqual(run(1010001,fire,visitHours,'strength'),rows[0]);
  results.push(...rows);const sum=summarize(rows);summary.push(sum);console.log(JSON.stringify({fire:fire.id,visitHours,milestones:sum.milestones}));
 }
 const manifest={};for(const file of ['config/winter/chapters-2026-10-29.json','services/winter/chapter-simulation.js','scripts/winter/chapter-progression.js','scripts/winter/chapter-ice-availability.js']){
  const bytes=fs.readFileSync(file),dest=path.join(out,'model',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);manifest[file]=crypto.createHash('sha256').update(bytes).digest('hex');}
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results));fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({correction:'Retain100 predecessor wins and all locked prices. Prior study delayed Ice recipe until S3 ownership, an unagreed policy that must not be treated as a required gate. Corrected policy buys Ice once Iron is held and10m is affordable, including while fighting S2. Fire candidates remain experimental. Other chapter study assumptions unchanged.',manifest,histories:results.length,replays:summary.length,summary},null,2));
}
if(require.main===module)main();
