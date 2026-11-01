// S3 isolation study: post-purchase Iron/STR25, 100HP, no Ice ever equipped.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const M=require('../../services/winter/early-progression'),H=M.HOUR,END=6*24*H;
const scenarios=[
 {id:'stocked-normal',stocked:true,penalty:false},
 {id:'stocked-penalty',stocked:true,penalty:true},
 {id:'iron-half-penalty',stocked:false,penalty:true},
 {id:'iron-half-batch-penalty',stocked:false,penalty:true,starterRed:1555}
];
function run(seed,scenario){
 const c=structuredClone(M.config),s=M.fresh(c);c.coatHp=scenario.startHp||100;
 s.strength=25;s.gymStarterClaimed=true;s.iron=true;s.coat=true;s.playerHp=c.coatHp;
 s.target=3;s.enemyHp=c.snowmen.find(e=>e.tier===3).hp;s.equipped='red';
 // Previous tiers are supplied as already unlocked; previous chapter wallets
 // and prior combat do not enter this chapter's income/expense ledger.
 s.tiers[1].wins=100;s.tiers[2].wins=100;s.red=scenario.stocked?1000000:(scenario.starterRed||0);
 const initialRed=s.red;let x=seed>>>0,y=(seed^0x9e3779b9)>>>0;
 const rng={combat:()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;},
 buttons:()=>{y^=y<<13;y^=y>>>17;y^=y<<5;return(y>>>0)/4294967296;}};
 let penalized=false,nextVisit=4*H,nextSnapshot=H,lastProduction=0,previousWins=0,previousLosses=0,recipe=null,firstLoss=null,upgrade=null;
 const snapshots=[];
 while(s.now<END){
  // Once penalized, all rules stay fixed until the next command; batch safely.
  const boundary=Math.min(nextVisit,nextSnapshot,END);
  const at=scenario.penalty&&!penalized?Math.min(boundary,s.nextPlayerAt,s.nextEnemyAt):boundary;
  c.playerAccuracy=penalized?.35:.7;
  const before=s.tiers[3].losses;
  assert(M.settle(s,at,rng,c).complete);
  if(s.tiers[3].losses>before){
   if(!firstLoss)firstLoss={hours:s.milestones.firstLoss/H,wins:s.tiers[3].wins};
   if(scenario.penalty)penalized=true;
  }
  if(at===nextVisit){
   penalized=false;c.playerAccuracy=.7;
   if(scenario.upgradeHp&&!upgrade&&s.ledger.buttonsEarned>=10+scenario.upgradeCost){
    assert(s.buttons>=scenario.upgradeCost);s.buttons-=scenario.upgradeCost;s.ledger.buttonsSpent+=scenario.upgradeCost;
    c.coatHp=scenario.upgradeHp;upgrade={hours:s.now/H,cost:scenario.upgradeCost,hp:c.coatHp,heldHp:s.playerHp,wins:s.tiers[3].wins};
    // Raise the maximum prospectively; do not heal the ongoing fight.
   }
   while(s.strength<c.statCap&&M.purchase(s,'strength',1,c)){}
   const production=s.ledger.snowProduced-lastProduction;lastProduction=s.ledger.snowProduced;
   if(!scenario.stocked){const qty=Math.floor(Math.min(s.snow,production/2)/c.redSnowCost);if(qty)M.purchase(s,'red',qty,c);}
   // Availability includes paying for this visit's usual Spicy batch first.
   if(!recipe&&s.snow>=c.iceRecipeSnowCost)recipe={hours:s.now/H,wins:s.tiers[3].wins,losses:s.tiers[3].losses,
    strength:s.strength,snow:s.snow,buttons:s.buttons,combatSweat:s.ledger.combatSweat,
    passiveSweat:s.ledger.passiveSweat+s.sweatRemainder/H};
   nextVisit+=4*H;
  }
  if(at===nextSnapshot){
   const t=s.tiers[3],enemy=M.enemy(s,3,c);
   snapshots.push({hours:at/H,wins:t.wins,losses:t.losses,hourWins:t.wins-previousWins,hourLosses:t.losses-previousLosses,
    strength:s.strength,enemyHp:enemy.hp,enemyDamage:enemy.damage,snow:s.snow,buttons:s.buttons,
    combatSweat:s.ledger.combatSweat,passiveSweat:s.ledger.passiveSweat+s.sweatRemainder/H,
    redUsed:t.red,regularUsed:t.regular});
   previousWins=t.wins;previousLosses=t.losses;nextSnapshot+=H;
  }
  // Account for separately supplied ammunition without counting it as snow
  // earned during this chapter or as recipe savings.
  M.assertLedger({...s,ledger:{...s.ledger,redSnow:s.ledger.redSnow+initialRed*c.redSnowCost,
   snowProduced:s.ledger.snowProduced+initialRed*c.redSnowCost}},c);
  assert.equal(initialRed+s.ledger.redSnow/1000-s.red,s.tiers[3].red);
  if(scenario.stopAtRecipe&&recipe)break;
 }
 assert.equal(s.tiers[3].attacks,s.now/3000);
 assert.equal(s.ledger.combatSweat,s.tiers[3].wins*3);
 return {seed,scenario:scenario.id,firstLoss,upgrade,recipe,snapshots,
  ...(scenario.stopAtRecipe?{checkpoint:{state:s,config:c,combatRng:x,buttonRng:y,nextVisit,nextSnapshot,initialRed}}:{})};
}
function main(){
 const out=path.resolve(process.argv[2]||'artifacts/winter-s3-before-ice-2026-10-29');
 if(fs.existsSync(out))throw Error('Choose a new output directory.');fs.mkdirSync(out,{recursive:true});
 const results=[],summary=[],q=(v,p)=>v.length?[...v].sort((a,b)=>a-b)[Math.floor((v.length-1)*p)]:null;
 for(const scenario of scenarios){
  const rows=Array.from({length:128},(_,i)=>run(970001+i,scenario));assert.deepEqual(run(970001,scenario),rows[0]);results.push(...rows);
  const timeline=[1,4,8,12,24,28,48,72,144].map(hours=>{
   const points=rows.map(r=>r.snapshots.find(s=>s.hours===hours)),metrics={};
   for(const key of ['wins','losses','hourWins','strength','enemyHp','enemyDamage','snow','buttons','combatSweat','passiveSweat']){
    const v=points.map(p=>p[key]);metrics[key]={mean:v.reduce((a,b)=>a+b,0)/v.length,p10:q(v,.1),median:q(v,.5),p90:q(v,.9)};
   }return{hours,metrics};
  });
  const recipe={reached:rows.filter(r=>r.recipe).length};
  for(const key of ['hours','wins','losses','strength','snow','buttons','combatSweat']){const v=rows.filter(r=>r.recipe).map(r=>r.recipe[key]);recipe[key]={p10:q(v,.1),median:q(v,.5),p90:q(v,.9)};}
  summary.push({scenario:scenario.id,timeline,recipe});
 }
 const manifest={};for(const file of ['scripts/winter/s3-before-ice.js','services/winter/early-progression.js','config/winter/early-progression.json']){
  const bytes=fs.readFileSync(file),dest=path.join(out,'model',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);manifest[file]=crypto.createHash('sha256').update(bytes).digest('hex');
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results));fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({assumptions:'Starts after Iron and S3 purchases at STR25, 100HP immediately, zero recipe savings. Four-hour Throw/training/crafting visits, passive current diminishing curve ON, accuracy 70% ->35% after defeat until Throw in penalty cases. S3 starts HP320/damage8, persists wins, no switch to S4. Unlimited Spicy cases receive free stock; funded cases spend half new Iron production per visit on Spicy, regular fallback. One funded case starts with 1555 prepaid Spicy; another zero. Recipe availability is 10m bank after current Spicy batch; never actually buy/equip Ice so later milestones show delaying it. Coat already supplied, not priced, so ten-Button coat is approximated as immediate 100HP. Expected Button chance5%, actual seeded drops. Old chapter prices/saving time excluded.',manifest,histories:results.length,replays:scenarios.length,summary},null,2));
 console.log(JSON.stringify(summary.map(s=>({scenario:s.scenario,recipe:s.recipe,timeline:s.timeline.map(t=>({hours:t.hours,wins:t.metrics.wins,losses:t.metrics.losses.median,strength:t.metrics.strength.median,buttons:t.metrics.buttons.median}))})),null,2));
}
if(require.main===module)main();module.exports={run,scenarios};
