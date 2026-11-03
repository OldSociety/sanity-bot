// Pure offline chapter model. Never imported by the Discord runtime.
const assert=require('node:assert/strict');
const defaults=require('../../config/winter/chapters-2026-10-29.json');
const {passiveRate,HOUR}=require('./early-progression');
const {hpAtDefeats,damageAtDefeats}=require('./snowman-scaling');
function rules(fire){
 const c=structuredClone(defaults);
 if(!fire||!Number.isSafeInteger(fire.damage)||!Number.isSafeInteger(fire.snowCost)||fire.damage<=25||fire.snowCost<=1000)throw Error('Supply an explicitly experimental Fire candidate.');
 c.fire={...fire};return c;
}
function fresh(seed,c){
 return {ruleset:c.id,now:0,nextPlayerAt:c.playerIntervalMs,nextEnemyAt:c.enemyIntervalMs,target:1,playerHp:c.playerHp,enemyHp:hpAtDefeats(c.snowmen[0],0),
  strength:3,accuracy:0,sweat:0,sweatRemainder:0,snow:0,snowRemainder:0,buttons:0,penalized:false,
  iron:false,golden:false,coat:false,reinforced:false,fireUnlock:false,iceRecipe:false,yellowRecipe:false,emporiumIndex:0,
  owned:{1:true,2:false,3:false,4:false,5:false},ammo:{red:0,ice:0,fire:0},equipped:'red',
  tiers:Object.fromEntries([1,2,3,4].map(t=>[t,{wins:0,losses:0,attacks:0,hits:0,enemyAttacks:0,enemyHits:0,regular:0,red:0,ice:0,fire:0,immune:0}])),
  rng:{combat:seed>>>0||1,buttons:(seed^0x9e3779b9)>>>0||1},milestones:{},milestoneStates:{},
  ledger:{snowProduced:0,ammoSnow:0,ironSnow:0,opponentSnow:0,recipeSnow:0,combatSweat:0,passiveSweat:0,trainingSweat:0,buttonsEarned:0,buttonsSpent:0,
   bought:{red:0,ice:0,fire:0},regularSnow:0},visits:0,productionAtVisit:0};
}
function mark(s,name){if(s.milestones[name]!==undefined)return;s.milestones[name]=s.now;s.milestoneStates[name]={snow:s.snow,strength:s.strength,accuracy:s.accuracy,sweat:s.sweat,buttons:s.buttons,target:s.target,wins:Object.values(s.tiers).map(t=>t.wins)};}
function row(c,t){return c.snowmen.find(r=>r.tier===t);}
function enemy(s,c){const r=row(c,s.target);if(!r||r.hp===null)throw Error('This tier has no selected combat stats.');const k=s.tiers[s.target].wins;return{hp:hpAtDefeats(r,k),damage:damageAtDefeats(r,k),sweat:r.sweat,immune:r.immune||[]};}
function hp(s,c){return s.reinforced?150:s.coat?100:c.playerHp;}
function rate(s,c){return s.golden?c.goldenRate:s.iron?c.ironRate:c.stoneRate;}
function accuracy(s,c){return s.penalized?c.defeatedAccuracy:Math.min(1,c.playerAccuracy+s.accuracy*c.accuracyPerLevel);}
function random(s,key){let x=s.rng[key];x^=x<<13;x^=x>>>17;x^=x<<5;s.rng[key]=x>>>0;return(x>>>0)/4294967296;}
function accrue(s,at,c){
 const elapsed=at-s.now;if(elapsed<0)throw Error('Cannot reverse chapter time.');
 const snow=elapsed*rate(s,c)+s.snowRemainder,earned=Math.floor(snow/1000);s.snow+=earned;s.ledger.snowProduced+=earned;s.snowRemainder=snow%1000;
 const sweat=elapsed*passiveRate(s.strength,c)+s.sweatRemainder,passive=Math.floor(sweat/HOUR);s.sweat+=passive;s.ledger.passiveSweat+=passive;s.sweatRemainder=sweat%HOUR;s.now=at;
}
function reset(s,c){s.playerHp=hp(s,c);s.enemyHp=enemy(s,c).hp;s.nextEnemyAt=s.now+c.enemyIntervalMs;}
function settle(s,at,c){
 if(!Number.isSafeInteger(at)||at<s.now)throw Error('Invalid chapter timestamp.');
 while(Math.min(s.nextPlayerAt,s.nextEnemyAt)<=at){
  const t=Math.min(s.nextPlayerAt,s.nextEnemyAt);accrue(s,t,c);const record=s.tiers[s.target];
  if(s.nextPlayerAt<=s.nextEnemyAt){
   s.nextPlayerAt+=c.playerIntervalMs;let ammo=s.equipped;if(ammo!=='regular'&&s.ammo[ammo]===0)ammo='regular';
   if(ammo==='regular'){
    if(s.snow<c.regularSnowCost)throw Error('Baseline shovel should sustain regular fallback.');
    s.snow-=c.regularSnowCost;s.ledger.ammoSnow+=c.regularSnowCost;s.ledger.regularSnow+=c.regularSnowCost;
   }else s.ammo[ammo]--;
   record.attacks++;record[ammo]++;
   if(s.target>=c.buttonMinimumTier&&random(s,'buttons')<c.buttonChance){s.buttons++;s.ledger.buttonsEarned++;mark(s,'firstButton');}
   const e=enemy(s,c),immune=e.immune.includes(ammo);
   if(immune)record.immune++;
   if(random(s,'combat')<accuracy(s,c)){
    record.hits++;const damage=immune?0:ammo==='regular'?c.regularDamage*(1+c.strengthPerLevel*s.strength):ammo==='red'?c.redDamage:ammo==='ice'?c.iceDamage:c.fire.damage;
    s.enemyHp=Math.max(0,s.enemyHp-damage);
    if(s.enemyHp<1){record.wins++;s.sweat+=e.sweat;s.ledger.combatSweat+=e.sweat;mark(s,`firstWinS${s.target}`);if(record.wins===100)mark(s,`clearS${s.target}`);reset(s,c);}
   }
  }else{
   s.nextEnemyAt+=c.enemyIntervalMs;record.enemyAttacks++;
   if(random(s,'combat')<c.enemyAccuracy){record.enemyHits++;s.playerHp=Math.max(0,s.playerHp-enemy(s,c).damage);
    if(s.playerHp<1){record.losses++;s.penalized=true;mark(s,'firstLoss');reset(s,c);}}
  }
 }
 accrue(s,at,c);return s;
}
function pay(s,cost,field){if(s.snow<cost)return false;s.snow-=cost;s.ledger[field]+=cost;return true;}
function buyOpponent(s,t,c){
 const required=t===3&&c.experimentalS3Wins!==undefined?c.experimentalS3Wins:100;
 if(s.owned[t]||!s.tiers[t-1]||s.tiers[t-1].wins<required)return false;
 if(t===3&&required<100&&!s.owned[2])return false;
 if(!pay(s,row(c,t).snowPrice,'opponentSnow'))return false;s.owned[t]=true;mark(s,`purchaseS${t}`);return true;
}
function select(s,t,c){if(!s.owned[t])throw Error('Opponent not purchased.');if(row(c,t).hp===null)throw Error('S5 combat is undefined.');if(s.target!==t){s.target=t;reset(s,c);mark(s,`enterS${t}`);}}
function emporium(s,c){
 if(!s.ledger.buttonsEarned)return;
 while(s.emporiumIndex<c.emporium.length){const item=c.emporium[s.emporiumIndex];if(s.buttons<item.buttons)break;
  s.buttons-=item.buttons;s.ledger.buttonsSpent+=item.buttons;s[item.id]=true;s.emporiumIndex++;mark(s,item.id);
 }
}
function train(s,skill,c){
 if(skill==='accuracy'&&s.strength<c.accuracyUnlockStrength)return false;
 const cost=s[skill]+1;if(cost>c.statCap||s.sweat<cost)return false;s.sweat-=cost;s.ledger.trainingSweat+=cost;s[skill]++;if(skill==='strength'&&s.strength===25)mark(s,'strength25');return true;
}
function craft(s,type,budget,c){
 const cost=type==='red'?c.redSnowCost:type==='ice'?c.iceSnowCost:c.fire.snowCost;
 if(type==='ice'&&!s.iceRecipe||type==='fire'&&!s.fireUnlock)return false;
 const quantity=Math.floor(Math.min(s.snow,budget)/cost);if(quantity<1)return false;
 s.snow-=quantity*cost;s.ledger.ammoSnow+=quantity*cost;s.ammo[type]+=quantity;s.ledger.bought[type]+=quantity;return true;
}
function visit(s,interval,c,training='strength',options={}){
 // Caller settles first. A command never restores accuracy retrospectively.
 s.penalized=false;s.visits++;emporium(s,c);
 for(let i=0;i<2*c.statCap;i++){
  const skill=training==='balanced'&&s.strength>=25&&s.accuracy<Math.min(c.statCap,s.strength-25)?'accuracy':'strength';
  if(!train(s,skill,c))break;
 }
 if(!s.iron&&s.strength>=25&&pay(s,c.ironSnowCost,'ironSnow')){s.iron=true;mark(s,'iron');}
 buyOpponent(s,2,c);buyOpponent(s,3,c);
 const iceAvailable=options.iceAfterS3?s.owned[3]:true;
 if(iceAvailable&&!s.iceRecipe&&pay(s,c.iceRecipeSnowCost,'recipeSnow')){s.iceRecipe=true;mark(s,'iceRecipe');}
 buyOpponent(s,4,c);
 if(s.golden&&!s.yellowRecipe&&pay(s,c.yellowRecipeSnowCost,'recipeSnow')){s.yellowRecipe=true;mark(s,'yellowRecipe');}
 buyOpponent(s,5,c);
 const desired=s.owned[4]&&s.fireUnlock?4:s.owned[3]?3:s.owned[2]?2:1;
 select(s,desired,c);
 s.equipped=desired===4?'fire':s.iceRecipe?'ice':'red';
 const production=s.ledger.snowProduced-s.productionAtVisit;s.productionAtVisit=s.ledger.snowProduced;
 const regularReserve=Math.ceil(interval/c.playerIntervalMs)*c.regularSnowCost;
 if(options.fireMinBatch&&s.equipped==='fire'){
  s.experimentalFireBudget=(s.experimentalFireBudget||0)+production/2;
  const budget=Math.min(s.experimentalFireBudget,Math.max(0,s.snow-regularReserve));
  if(Math.floor(budget/c.fire.snowCost)>=options.fireMinBatch){const before=s.ammo.fire;craft(s,'fire',budget,c);s.experimentalFireBudget-=(s.ammo.fire-before)*c.fire.snowCost;}
 }else craft(s,s.equipped,Math.min(production/2,Math.max(0,s.snow-regularReserve)),c);
 validate(s,c);return s;
}
function validate(s,c){
 const l=s.ledger,tiers=Object.values(s.tiers);
 assert.equal(s.snow,l.snowProduced-l.ammoSnow-l.ironSnow-l.opponentSnow-l.recipeSnow);
 assert.equal(s.sweat,l.combatSweat+l.passiveSweat-l.trainingSweat);
 assert.equal(s.buttons,l.buttonsEarned-l.buttonsSpent);
 for(const type of ['red','ice','fire'])assert.equal(s.ammo[type],l.bought[type]-tiers.reduce((n,t)=>n+t[type],0));
 assert.equal(tiers.reduce((n,t)=>n+t.attacks,0),Math.floor(s.now/c.playerIntervalMs));
 assert.equal(l.combatSweat,tiers.reduce((n,t,i)=>n+t.wins*(i+1),0));
 assert(s.playerHp>0&&s.playerHp<=hp(s,c)&&s.enemyHp>0&&s.enemyHp<=enemy(s,c).hp);
 for(const k of ['snow','sweat','buttons'])assert(Number.isSafeInteger(s[k])&&s[k]>=0);
 return true;
}
module.exports={defaults,rules,fresh,settle,visit,validate,accuracy,enemy,hp,rate,buyOpponent,select,emporium,craft,train,mark,HOUR};
