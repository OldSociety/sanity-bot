// Pure experimental model. No bot, environment credentials, databases or timers.
const assert=require('node:assert/strict');
const BASE=require('../../config/winter/chapters-2026-10-29.json');
const AUDIT=require('../../config/winter/chapter3-audit-2026-10-29.json');
const {addedHp,passiveRate,HOUR:H}=require('./early-progression');
const profiles={four:[0,5,10,15],hourly:Array.from({length:16},(_,i)=>i),twice:[0,12],daily:[0],
 frequent:Array.from({length:181},(_,i)=>i/12)};
function events(profile){const out=[];for(let d=0;d<=31;d++)for(const h of profiles[profile])out.push(Math.round((d*24+h)*H));return out;}
function fresh(seed,options={}){
 const c={...structuredClone(BASE),fire:{...AUDIT.fire},...options};
 c.shared=options.shared??true;c.defenseMode=options.defenseMode||AUDIT.defenseModel;
 c.defenseUnlock=options.defenseUnlock||AUDIT.defenseUnlock;c.spcRate=options.spcRate??AUDIT.specialPerLevel;
 return{c,p:null,s:{now:0,nextP:3000,nextE:10000,nextDot:Infinity,dotTicks:0,dotAmount:0,corrosion:false,
  rng:{combat:seed>>>0||1,buttons:(seed^0x9e3779b9)>>>0||1},target:1,playerHp:50,enemyHp:80,
  strength:3,accuracy:0,defense:0,special:0,sweat:0,sweatRem:0,snow:0,snowRem:0,buttons:0,
  iron:false,golden:false,necro:false,coat:false,reinforced:false,fireUnlock:false,iceRecipe:false,yellowRecipe:false,
  emporium:0,chapterShop:0,maxHpOverride:0,yieldN:1,yieldD:1,yellowMultiplier:1,belt:false,
  owned:[false,true,false,false,false,false],ammo:{red:0,ice:0,fire:0,yellow:0},equipped:'red',
  yellow:0,yellowRem:0,poison:0,corpses:0,ritualPhase:0,penalized:false,fireBudget:0,
  milestones:{},milestoneStates:{},visits:0,productionAtVisit:0,poisonLost:0,
  tiers:Array.from({length:6},()=>({wins:0,losses:0,attacks:0,hits:0,enemyAttacks:0,enemyHits:0,regular:0,red:0,ice:0,fire:0,yellow:0,immune:0})),
  ledger:{snowProduced:0,ammoSnow:0,ironSnow:0,opponentSnow:0,recipeSnow:0,craftSnow:0,regularSnow:0,
   combatSweat:0,passiveSweat:0,trainingSweat:0,buttonsEarned:0,buttonsSpent:0,yellowProduced:0,yellowSpent:0,
   corpsesEarned:0,corpsesSpent:0,selfDefeats:0,mutualKos:0,enemyDefeats:0,poisonTriggers:0,
   bought:{red:0,ice:0,fire:0,yellow:0}}}};
}
function rnd(s,key){let x=s.rng[key];x^=x<<13;x^=x>>>17;x^=x<<5;s.rng[key]=x>>>0;return(x>>>0)/4294967296;}
function mark(m,name){const{s}=m;if(s.milestones[name]!==undefined)return;s.milestones[name]=s.now;
 s.milestoneStates[name]={snow:s.snow,buttons:s.buttons,strength:s.strength,accuracy:s.accuracy,defense:s.defense,special:s.special,
  corpses:s.corpses,yellow:s.yellow,wins:s.tiers.slice(1).map(t=>t.wins),earnedSweat:s.ledger.combatSweat+s.ledger.passiveSweat};}
function maxHp(m){const{s,c}=m;return Math.max(s.maxHpOverride,s.reinforced?150:s.coat?100:c.playerHp)+(c.defenseMode==='hp'?s.defense:0);}
function ordinaryRate(m){const{s,c,p}=m;return s.necro?c.goldenRate*p.necroOrdinaryMultiplier:s.golden?c.goldenRate:s.iron?c.ironRate:c.stoneRate;}
function enemy(m){const{s,c,p}=m,k=s.tiers[s.target].wins;
 const r=s.target===5?(p?{hp:p.s5Hp,damage:p.s5Damage,sweat:5}:null):c.snowmen.find(r=>r.tier===s.target);
 if(!r||r.hp==null)throw Error('Undefined enemy stats');return{hp:r.hp+addedHp(k),damage:r.damage+Math.floor(k/25),sweat:r.sweat};}
function accrue(m,at){const{s,c,p}=m,dt=at-s.now;if(dt<0)throw Error('Time reversal');
 const n=dt*ordinaryRate(m)+s.snowRem,a=Math.floor(n/1000);s.snow+=a;s.ledger.snowProduced+=a;s.snowRem=n%1000;
 const w=dt*passiveRate(s.strength,c)+s.sweatRem,b=Math.floor(w/H);s.sweat+=b;s.ledger.passiveSweat+=b;s.sweatRem=w%H;
 if(p&&(s.golden||s.necro)){const y=dt*p.yellowPerHour*(s.necro?p.necroYellowMultiplier:1)+s.yellowRem,k=Math.floor(y/H);s.yellow+=k;s.ledger.yellowProduced+=k;s.yellowRem=y%H;}
 s.now=at;
}
function reset(m){const{s}=m;s.playerHp=maxHp(m);s.enemyHp=enemy(m).hp;s.nextE=s.now+10000;s.nextDot=Infinity;s.dotTicks=0;s.corrosion=false;}
function win(m){const{s}=m,t=s.tiers[s.target];t.wins++;const reward=s.target;s.sweat+=reward;s.ledger.combatSweat+=reward;
 mark(m,`firstWinS${s.target}`);if(t.wins===25)mark(m,`wins25S${s.target}`);if(t.wins===100)mark(m,`clearS${s.target}`);}
function defeat(m,self){const{s,p}=m;s.tiers[s.target].losses++;s.penalized=true;mark(m,'firstLoss');
 if(self){s.corpses++;s.ledger.corpsesEarned++;s.ledger.selfDefeats++;s.poison=0;mark(m,'firstCorpse');}
 else{s.ledger.enemyDefeats++;if(p?.selfMode==='fragile'){s.poisonLost+=s.poison;s.poison=0;}}
}
function multiplier(m,ammo){const{s,p}=m;if(s.target===4&&['regular','red','ice'].includes(ammo))return 0;
 if(s.target!==5)return 1;return ammo==='yellow'?1:ammo==='fire'?p.fireMultiplier:p.otherMultiplier;}
function specialMultiplier(m){return 1+m.s.special*m.c.spcRate;}
function settle(m,at){const{s,c,p}=m;if(!Number.isSafeInteger(at)||at<s.now)throw Error('Invalid timestamp');
 while(Math.min(s.nextP,s.nextE,s.nextDot)<=at){
  const t=Math.min(s.nextP,s.nextE,s.nextDot);accrue(m,t);const record=s.tiers[s.target];
  // Fixed tie ordering: player, enemy, delayed outgoing damage. Any KO resets once.
  if(s.nextP===t){
   s.nextP+=3000;let ammo=s.equipped;
   if(ammo!=='regular'&&!s.ammo[ammo])ammo=ammo==='yellow'&&s.belt&&s.ammo.fire?'fire':'regular';
   if(ammo==='regular'){if(s.snow<10)throw Error('Regular supply exhausted');s.snow-=10;s.ledger.ammoSnow+=10;s.ledger.regularSnow+=10;}else s.ammo[ammo]--;
   record.attacks++;record[ammo]++;
   if(s.target>=3&&rnd(s,'buttons')<c.buttonChance){s.buttons++;s.ledger.buttonsEarned++;mark(m,'firstButton');}
   const chance=s.penalized?c.defeatedAccuracy:Math.min(1,c.playerAccuracy+c.accuracyPerLevel*s.accuracy),hit=rnd(s,'combat')<chance,mult=multiplier(m,ammo);
   if(!mult)record.immune++;
   if(hit){record.hits++;const base=ammo==='regular'?2*(1+.06*s.strength):ammo==='red'?10:ammo==='ice'?25:ammo==='fire'?c.fire.damage:p.yellowDamage*s.yellowMultiplier;
    const damage=base*(ammo==='regular'?1:specialMultiplier(m))*mult;s.enemyHp=Math.max(0,s.enemyHp-damage);
    if(ammo==='yellow'&&mult){
     if(p.yellowEffect==='corrosion')s.corrosion=true;
     if(p.yellowEffect==='dot'){s.dotTicks=p.dotTicks;s.dotAmount=p.dotDamage*specialMultiplier(m)*s.yellowMultiplier;if(s.nextDot===Infinity)s.nextDot=s.now+10000;}
    }
   }
   let self=false;
   if(ammo==='yellow'){
    if(p.selfMode==='flat')s.playerHp=Math.max(0,s.playerHp-p.selfDamage);
    else if(p.selfMode==='fraction')s.playerHp=Math.max(0,s.playerHp-Math.ceil(maxHp(m)*p.selfFraction));
    else if(p.selfMode!=='onHit'||hit&&mult){s.poison++;if(s.poison>=p.poisonThrows){s.playerHp=0;s.ledger.poisonTriggers++;}}
    self=s.playerHp<=0;
   }
   const victory=s.enemyHp<=0;if(victory)win(m);if(self){defeat(m,true);if(victory)s.ledger.mutualKos++;}
   if(victory||self)reset(m);
  }else if(s.nextE===t){
   s.nextE+=10000;record.enemyAttacks++;
   const dodge=c.defenseMode==='dodge'?Math.min(.25,s.defense*.0025):0;
   if(rnd(s,'combat')<c.enemyAccuracy*(1-dodge)){record.enemyHits++;
    const armor=c.defenseMode==='armor'?1-Math.min(.2,s.defense*.002):1;
    s.playerHp=Math.max(0,s.playerHp-enemy(m).damage*armor*(s.corrosion?.8:1));
    if(!s.playerHp){defeat(m,false);reset(m);}
   }
  }else{
   s.enemyHp=Math.max(0,s.enemyHp-s.dotAmount);s.dotTicks--;s.nextDot=s.dotTicks?s.now+10000:Infinity;
   if(!s.enemyHp){win(m);reset(m);}
  }
 }
 accrue(m,at);return m;
}
function pay(s,n,key){if(s.snow<n)return false;s.snow-=n;s.ledger[key]+=n;return true;}
function levelSum(s){return s.strength+s.accuracy+s.defense+s.special;}
function eligible(m,skill){const{s,c}=m;if(s[skill]>=100)return false;
 if(skill==='accuracy')return s.strength>=25;
 if(skill==='defense')return c.defenseUnlock==='ACC25'?s.accuracy>=25:s.strength>=25;
 if(skill==='special')return s.strength>=25&&s.accuracy>=25&&s.defense>=25;return true;}
function skill(m,policy){const{s}=m;if(s.strength<25)return'strength';
 if(policy==='spc'){
  if(s.accuracy<25)return'accuracy';if(s.defense<25)return'defense';if(s.special<25)return'special';
  if(s.strength<50)return'strength';return ['special','strength','accuracy','defense'].find(k=>eligible(m,k));
 }
 if(policy==='strength')return ['strength','accuracy','defense','special'].find(k=>eligible(m,k));
 return ['strength','accuracy','defense','special'].filter(k=>eligible(m,k)).sort((a,b)=>(s[a]/(a==='strength'?2:1))-(s[b]/(b==='strength'?2:1)))[0];
}
function train(m,policy){const{s,c}=m;for(let i=0;i<400;i++){
 const k=skill(m,policy);if(!k||!eligible(m,k))break;const cost=c.shared?levelSum(s)+1:s[k]+1;if(s.sweat<cost)break;
 s.sweat-=cost;s.ledger.trainingSweat+=cost;s[k]++;
 if(s.strength===25)mark(m,'strength25');if(eligible(m,'special'))mark(m,'spcEligible');if(s.special===1)mark(m,'spc1');
 }}
function opponent(m,t){const{s,c}=m;if(s.owned[t]||s.tiers[t-1].wins<100)return;
 if(pay(s,c.snowmen[t-1].snowPrice,'opponentSnow')){s.owned[t]=true;mark(m,`purchaseS${t}`);}}
function select(m,t){const{s}=m;if(!s.owned[t])throw Error('Unowned opponent');if(s.target!==t){s.target=t;reset(m);mark(m,`enterS${t}`);}}
function shop(m){const{s,c,p}=m;if(s.ledger.buttonsEarned){while(s.emporium<c.emporium.length){const item=c.emporium[s.emporium];if(s.buttons<item.buttons)break;
 s.buttons-=item.buttons;s.ledger.buttonsSpent+=item.buttons;s[item.id]=true;s.emporium++;mark(m,item.id);}}
 if(p&&s.golden){const items=p.shopItems||AUDIT.shops[p.shop];while(s.chapterShop<items.length){const item=items[s.chapterShop];if(s.buttons<item.buttons)break;
  s.buttons-=item.buttons;s.ledger.buttonsSpent+=item.buttons;s.chapterShop++;if(item.hp&&!c.disableHpShop)s.maxHpOverride=item.hp;
  if(item.yieldNumerator&&!c.disableYieldShop){s.yieldN=item.yieldNumerator;s.yieldD=item.yieldDenominator;}
  if(item.yellowMultiplier)s.yellowMultiplier=item.yellowMultiplier;if(item.fallbackFire&&!c.disableBeltShop)s.belt=true;mark(m,`shop-${item.id}`);
 }}
}
function craft(m,type,budget){const{s,c,p}=m,price=type==='red'?1000:type==='ice'?2000:type==='fire'?c.fire.snowCost:p.yellowSnowCost;
 let count=Math.floor(Math.min(s.snow,budget)/price);
 if(type==='yellow'){
  const batches=Math.min(Math.floor(s.yellow/s.yieldD),Math.floor(count/s.yieldN));count=batches*s.yieldN;
  s.yellow-=batches*s.yieldD;s.ledger.yellowSpent+=batches*s.yieldD;
 }
 if(count<1)return 0;s.snow-=count*price;s.ledger.ammoSnow+=count*price;s.ammo[type]+=count;s.ledger.bought[type]+=count;return count*price;
}
function ritual(m){const{s,p}=m;if(!p||s.necro||!s.yellowRecipe||!s.owned[5])return;
 const needed=p.ritualSteps===1?p.corpseTarget:Math.floor(p.corpseTarget*(s.ritualPhase+1)/p.ritualSteps)-Math.floor(p.corpseTarget*s.ritualPhase/p.ritualSteps);
 const final=s.ritualPhase===p.ritualSteps-1;
 if(s.corpses<needed||final&&(s.tiers[5].wins<p.winRequirement||s.snow<p.craftSnow))return;
 s.corpses-=needed;s.ledger.corpsesSpent+=needed;s.ritualPhase++;mark(m,`ritual${s.ritualPhase}`);
 if(final){assert(pay(s,p.craftSnow,'craftSnow'));s.necro=true;if(p.tradeGolden)s.golden=false;mark(m,'necro');}
}
function visit(m,nextGap,policy,options={}){
 const{s,c,p}=m;s.penalized=false;s.visits++;shop(m);train(m,policy);
 if(!s.iron&&s.strength>=25&&pay(s,c.ironSnowCost,'ironSnow')){s.iron=true;mark(m,'iron');}
 opponent(m,2);opponent(m,3);
 if(!s.iceRecipe&&pay(s,c.iceRecipeSnowCost,'recipeSnow')){s.iceRecipe=true;mark(m,'iceRecipe');}
 opponent(m,4);
 if(s.golden&&!s.yellowRecipe&&pay(s,c.yellowRecipeSnowCost,'recipeSnow')){s.yellowRecipe=true;mark(m,'yellowRecipe');}
 opponent(m,5);
 let desired=p&&s.owned[5]?5:s.owned[4]&&s.fireUnlock?4:s.owned[3]?3:s.owned[2]?2:1;
 if(p&&options.farmTier&&s.yellowRecipe&&s.ledger.corpsesEarned<p.corpseTarget)desired=options.farmTier;
 select(m,desired);
 s.equipped=p&&s.yellowRecipe?'yellow':desired===4?'fire':s.iceRecipe?'ice':'red';
 const production=s.ledger.snowProduced-s.productionAtVisit;s.productionAtVisit=s.ledger.snowProduced;
 let budget=Math.min(production/2,Math.max(0,s.snow-Math.ceil(nextGap/3000)*10));
 if(s.equipped==='yellow'){
  budget-=craft(m,'yellow',budget);
  if(s.belt)craft(m,'fire',budget);
 }else if(options.fireMinBatch&&s.equipped==='fire'){
  s.fireBudget+=production/2;const b=Math.min(s.fireBudget,Math.max(0,s.snow-Math.ceil(nextGap/3000)*10));
  if(Math.floor(b/c.fire.snowCost)>=options.fireMinBatch)s.fireBudget-=craft(m,'fire',b);
 }else craft(m,s.equipped,budget);
 ritual(m);validate(m);return m;
}
function attach(m,p){m.p=structuredClone(p);m.s.chapterStart=m.s.now;m.s.yellow=0;m.s.yellowRem=0;
 m.s.chapterBaseline=structuredClone(m.s.ledger);m.s.chapterStats={strength:m.s.strength,accuracy:m.s.accuracy,defense:m.s.defense,special:m.s.special};
 return m;
}
function validate(m){const{s,c}=m,l=s.ledger,tiers=s.tiers.slice(1);
 assert.equal(s.snow,l.snowProduced-l.ammoSnow-l.ironSnow-l.opponentSnow-l.recipeSnow-l.craftSnow);
 assert.equal(s.sweat,l.combatSweat+l.passiveSweat-l.trainingSweat);assert.equal(s.buttons,l.buttonsEarned-l.buttonsSpent);
 assert.equal(s.yellow,l.yellowProduced-l.yellowSpent);assert.equal(s.corpses,l.corpsesEarned-l.corpsesSpent);
 for(const k of ['red','ice','fire','yellow'])assert.equal(s.ammo[k],l.bought[k]-tiers.reduce((n,t)=>n+t[k],0));
 assert.equal(tiers.reduce((n,t)=>n+t.attacks,0),Math.floor(s.now/3000));
 assert.equal(l.combatSweat,tiers.reduce((n,t,i)=>n+t.wins*(i+1),0));
 if(c.shared)assert.equal(l.trainingSweat,levelSum(s)*(levelSum(s)+1)/2-6);
 else assert.equal(l.trainingSweat,['strength','accuracy','defense','special'].reduce((n,k)=>n+s[k]*(s[k]+1)/2,0)-6);
 assert(s.playerHp>0&&s.playerHp<=maxHp(m)&&s.enemyHp>0&&s.enemyHp<=enemy(m).hp+1e-7);
 for(const k of ['snow','sweat','buttons','yellow','corpses'])assert(Number.isSafeInteger(s[k])&&s[k]>=0);
 return true;
}
module.exports={AUDIT,BASE,H,profiles,events,fresh,settle,visit,attach,validate,enemy,maxHp,ordinaryRate,mark,reset,train,craft,select,levelSum,eligible};
