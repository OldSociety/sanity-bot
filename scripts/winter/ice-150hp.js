// Continue genuine S3/150HP/recipe-affordability checkpoints into Ice play.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const M=require('../../services/winter/early-progression'),{run:prelude}=require('./s3-before-ice'),H=M.HOUR;
function prepare(seed){return prelude(seed,{id:'150hp-checkpoint',stocked:false,penalty:true,starterRed:1555,upgradeHp:150,upgradeCost:200,stopAtRecipe:true});}
function run(saved,stocked,advance){
 const cp=structuredClone(saved.checkpoint),s=cp.state,c=cp.config,start=s.now,initialRed=cp.initialRed;
 const startWins=s.tiers[3].wins,startSweat=s.ledger.combatSweat;
 assert.equal(c.coatHp,150);assert(M.purchase(s,'ice-recipe',1,c));s.equipped='ice';
 let x=cp.combatRng,y=cp.buttonRng;const rng={combat:()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;},
 buttons:()=>{y^=y<<13;y^=y>>>17;y^=y<<5;return(y>>>0)/4294967296;}};
 const initialIce=stocked?1000000:0;if(stocked)s.ice=initialIce;
 function craft(budget){
  const reserve=4*H/3000*c.regularSnowCost;
  const quantity=Math.floor(Math.min(Math.max(0,s.snow-reserve),budget)/(c.iceDiamonds*c.diamondSnowCost));
  if(quantity){assert(M.purchase(s,'diamonds',quantity*c.iceDiamonds,c));assert(M.purchase(s,'ice',quantity,c));}
 }
 if(!stocked)craft(Infinity);
 let penalized=false,nextVisit=s.now+4*H,nextSnapshot=s.now+H,lastProduction=s.ledger.snowProduced;
 let clearS3=null,enteredS4=null,clearS4=null;const snapshots=[];
 const initialChapterShots=Object.values(s.tiers).reduce((n,t)=>n+t.attacks,0),iceAtStart=s.ice;
 while(s.now<start+6*24*H){
  const boundary=Math.min(nextVisit,nextSnapshot,start+6*24*H);
  const at=penalized?boundary:Math.min(boundary,s.nextPlayerAt,s.nextEnemyAt);
  c.playerAccuracy=penalized?.35:.7;
  const losses=Object.values(s.tiers).reduce((n,t)=>n+t.losses,0);
  assert(M.settle(s,at,rng,c).complete);
  if(Object.values(s.tiers).reduce((n,t)=>n+t.losses,0)>losses)penalized=true;
  if(clearS3===null&&s.tiers[3].wins>=100)clearS3=(s.milestones.clearS3-start)/H;
  if(clearS4===null&&s.tiers[4].wins>=100)clearS4=(s.milestones.clearS4-start)/H;
  if(at===nextVisit){
   penalized=false;c.playerAccuracy=.7;
   while(s.strength<c.statCap&&M.purchase(s,'strength',1,c)){}
   const produced=s.ledger.snowProduced-lastProduction;lastProduction=s.ledger.snowProduced;
   if(!stocked)craft(produced/2);
   if(advance&&s.target===3&&s.tiers[3].wins>=100){assert(M.select(s,4,c));enteredS4=(s.now-start)/H;}
   nextVisit+=4*H;
  }
  if(at===nextSnapshot){
   snapshots.push({hours:(at-start)/H,target:s.target,strength:s.strength,s3Wins:s.tiers[3].wins,s3Losses:s.tiers[3].losses,
    s4Wins:s.tiers[4].wins,s4Losses:s.tiers[4].losses,combatSweat:s.ledger.combatSweat-startSweat,
    iceUsed:s.tiers[3].ice+s.tiers[4].ice,regularUsed:s.tiers[3].regular+s.tiers[4].regular,
    buttonsEarned:s.ledger.buttonsEarned,snow:s.snow,ice:s.ice});nextSnapshot+=H;
  }
  // Starter Red and unlimited-control Ice are separately supplied endowments.
  const endowedSnow=initialRed*c.redSnowCost+initialIce*c.iceDiamonds*c.diamondSnowCost;
  M.assertLedger({...s,ledger:{...s.ledger,redSnow:s.ledger.redSnow+initialRed*c.redSnowCost,
   pressedSnow:s.ledger.pressedSnow+initialIce*c.iceDiamonds*c.diamondSnowCost,
   diamondsCrafted:s.ledger.diamondsCrafted+initialIce*c.iceDiamonds,
   iceDiamonds:s.ledger.iceDiamonds+initialIce*c.iceDiamonds,snowProduced:s.ledger.snowProduced+endowedSnow}},c);
 }
 assert.equal(Object.values(s.tiers).reduce((n,t)=>n+t.attacks,0)-initialChapterShots,6*24*1200);
 return {seed:saved.seed,scenario:(stocked?'unlimited':'iron-half')+(advance?'-advance':'-stayS3'),startHours:start/H,
  startWins,startStrength:saved.checkpoint.state.strength,iceAtStart,clearS3,enteredS4,clearS4,snapshots};
}
function main(){
 const out=path.resolve(process.argv[2]||'artifacts/winter-ice-150hp-2026-10-29');if(fs.existsSync(out))throw Error('Preserve previous evidence.');fs.mkdirSync(out,{recursive:true});
 const prepared=Array.from({length:128},(_,i)=>prepare(970001+i)),results=[],summary=[];
 const q=(v,p)=>v.length?[...v].sort((a,b)=>a-b)[Math.floor((v.length-1)*p)]:null;
 for(const stocked of [false,true])for(const advance of [false,true]){
  const rows=prepared.map(p=>run(p,stocked,advance));assert.deepEqual(run(prepared[0],stocked,advance),rows[0]);results.push(...rows);
  const timeline=[1,4,8,12,24,48,72,144].map(hours=>{
   const points=rows.map(r=>r.snapshots.find(p=>p.hours===hours)),metrics={};for(const key of ['s3Wins','s4Wins','s4Losses','strength','combatSweat','iceUsed']){
    const v=points.map(p=>p[key]);metrics[key]={mean:v.reduce((a,b)=>a+b,0)/v.length,p10:q(v,.1),median:q(v,.5),p90:q(v,.9)};
   }return{hours,metrics};
  });
  const milestones={};for(const key of ['clearS3','enteredS4','clearS4']){const v=rows.map(r=>r[key]).filter(v=>v!==null);milestones[key]={reached:v.length,p10Hours:q(v,.1),medianHours:q(v,.5),p90Hours:q(v,.9)};}
  summary.push({scenario:rows[0].scenario,milestones,timeline});
 }
 const manifest={};for(const file of ['scripts/winter/ice-150hp.js','scripts/winter/s3-before-ice.js','services/winter/early-progression.js','config/winter/early-progression.json']){
  const bytes=fs.readFileSync(file),dest=path.join(out,'model',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);manifest[file]=crypto.createHash('sha256').update(bytes).digest('hex');}
 fs.writeFileSync(path.join(out,'checkpoints.json'),JSON.stringify(prepared));fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results));
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({assumptions:'Continue all 128 original upgraded-150HP funded/prepaid S3 seeds at actual 28h recipe-affordability checkpoint, preserving state/RNG/timers. Pay 10m recipe; equip Ice at25 damage/2 diamonds. Funded first batch uses remaining snow above a 48k regular reserve; later four-hour visits allocate half fresh Iron output to Ice (no more Spicy). Four-hour Throw/train visits, passive original curve, defeat accuracy35% until Throw, maxHP150. S4 test switches on next visit after100 S3 wins, with no extra S4 purchase fee specified; starts550HP/14damage. Stay tests retain S3. No further gear/Accuracy/special damage/Golden. Six days AFTER Ice acquisition; prior28h excluded from those elapsed times. Unlimited Ice supplied separately is a combat control.',manifest,histories:results.length,replays:4,summary},null,2));
 console.log(JSON.stringify(summary.map(s=>({scenario:s.scenario,milestones:s.milestones,timeline:s.timeline.map(t=>({hours:t.hours,s3:t.metrics.s3Wins,s4:t.metrics.s4Wins,strength:t.metrics.strength.median,iceUsed:t.metrics.iceUsed.median}))})),null,2));
}
if(require.main===module)main();module.exports={prepare,run};
