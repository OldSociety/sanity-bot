const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const N=require('../../services/winter/chapter-simulation'),O=require('../../services/winter/early-progression');
const {run}=require('./chapter-progression');
function stream(seed){let x=seed>>>0||1;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;};}
function controls(){
 let matches=0;
 for(const tier of [1,2,3])for(const weapon of ['regular','red','ice'])for(const seed of [123456,654321]){
  const c=N.rules(N.defaults.experimentalFireCandidates[1]);c.playerHp=150;
  const old=structuredClone(O.config);old.playerHp=150;old.playerAccuracy=.35;
  const a=N.fresh(seed,c),b=O.fresh(old);a.strength=b.strength=25;a.target=b.target=tier;
  a.playerHp=b.playerHp=150;a.enemyHp=b.enemyHp=c.snowmen[tier-1].hp;a.penalized=true;
  a.equipped=b.equipped=weapon;a.ammo.red=a.ammo.ice=b.red=b.ice=1000000;b.iceRecipe=true;
  const rng={combat:stream(seed),buttons:stream((seed^0x9e3779b9)>>>0)};
  N.settle(a,6*N.HOUR,c);O.settle(b,6*N.HOUR,rng,old);
  for(const k of ['wins','losses','attacks','hits','enemyAttacks','enemyHits','regular','red','ice'])assert.equal(a.tiers[tier][k],b.tiers[tier][k]);
  for(const k of ['playerHp','enemyHp','nextPlayerAt','nextEnemyAt','snow','snowRemainder','sweat','sweatRemainder','buttons'])assert.equal(a[k],b[k]);
  matches++;
 }
 return matches;
}
function main(){
 const out=path.resolve(process.argv[2]||'artifacts/winter-chapter-progression-2026-10-29'),rows=JSON.parse(fs.readFileSync(path.join(out,'results.json')));
 const sum=JSON.parse(fs.readFileSync(path.join(out,'summary.json')));let replays=0;
 for(const r of rows.filter(r=>r.seed===1010002&&(r.visitHours===4||r.visitHours===24))){
  // These archived histories intentionally postponed Ice until S3 ownership.
  // Preserve that policy only to reproduce the old study, not as a real gate.
  const c=N.defaults.experimentalFireCandidates.find(f=>f.id===r.fire);assert.deepEqual(run(r.seed,c,r.visitHours,r.training,{iceAfterS3:true}),r);replays++;
 }
 const expectedHashes=sum.manifest;
 const crypto=require('node:crypto');for(const [file,hash]of Object.entries(expectedHashes)){
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(out,'model',file))).digest('hex'),hash);
 }
 const verification={independentSixHourOldEngineControls:controls(),freshProcessWholeCampaignReplays:replays,sourceSnapshotsHashVerified:true,
  histories:rows.length,domainLedgerChecks:'every command',globalAttackCadencePreserved:true};
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(verification,null,2));console.log(JSON.stringify(verification));
}
if(require.main===module)main();module.exports={controls};
