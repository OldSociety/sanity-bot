const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const B = require('../../services/winter/battle');
const G = require('../../services/winter/gym');
const C = B.config;
const out = path.resolve(__dirname, '../../artifacts/winter-gym-weights-2026-10-27');
fs.mkdirSync(out, { recursive: true });
function rng(seed) { let x=seed|0; return () => {x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;}; }
function simulate(seed,hours,mode,days=31) {
  const s=B.freshBattle(), p={snow:0,remainder:0,productionRate:C.stoneRate}, k={spicy:0};
  Object.assign(s,{sturdyOwned:1,trainUnlocked:1});
  const random=rng(seed),drop=rng(seed+99999);
  let last=0,now=0,ironAt=null,mittenAt=null,fireAt=null,outfitAt=null,spentAmmo=0,regularCost=0,losses=0;
  const accrue=at=>{at=Math.floor(at);const n=Math.max(0,at-last)*p.productionRate+p.remainder;p.snow+=Math.floor(n/1000);p.remainder=n%1000;last=at;};
  function purchases() {
    if (!s.mittensOwned && s.buttons>=C.mittenCost) {s.buttons-=C.mittenCost;s.mittensOwned=1;mittenAt=now;}
    if (mode!=='regular' && !s.fireFlowerOwned && s.buttons>=C.fireFlowerCost) {s.buttons-=C.fireFlowerCost;s.fireFlowerOwned=1;fireAt=now;}
    if (!s.outfitOwned && s.buttons>=C.outfitCost) {s.buttons-=C.outfitCost;s.outfitOwned=1;outfitAt=now;}
    while(s.gym.strength<25 && s.sweat>=s.gym.strength+1) G.buyLevels(s,'strength');
    if (!s.weightStage && s.gym.strength>=25) G.liftWeight(s);
    if(!s.ironShovelOwned && s.weightStage && p.snow>=C.ironSnowCost) {
      p.snow-=C.ironSnowCost;s.ironMaterial=0;s.ironShovelOwned=1;p.productionRate=C.ironRate;ironAt=now;
    }
  }
  for(let day=0;day<days && ironAt===null;day++) {
    now=day*86400000;accrue(now);purchases();B.startBattle(s,now);
    const end=now+hours*3600000;
    while(now<end && ironAt===null) {
      purchases();
      if(!s.active) {
        losses+=Number(s.phase==='defeat');s.buttonIntroPending=0;
        now=Math.min(end,now+60000);accrue(now);if(now>=end)break;B.startBattle(s,now);
      }
      if(mode!=='regular' && (mode==='continuous' || s.throws%4===0) && !s.queue.length) {
        const amount=s.fireFlowerOwned?C.fireFlowerAmmo:1;
        const needed=Math.max(0,amount-k.spicy), cost=needed*C.spicySnowCost;
        if(p.snow>=cost) {p.snow-=cost;spentAmmo+=cost;k.spicy+=needed;B.enqueue(s,'spicy',k);}
      }
      const next=Math.min(s.nextPlayerAt,s.nextEnemyAt,end), before=p.snow;
      const producedBefore=last;
      B.advanceBattle(p,s,next,accrue,random,C,drop,false,k);
      // Accounting independently of purchased ammo, using accrued gross production.
      regularCost+=Math.max(0,before+Math.floor((Math.floor(next)-producedBefore)*p.productionRate/1000)-p.snow);
      now=next;
    }
    if(s.active){s.active=0;s.phase='paused';s.pauseAt=now;}
  }
  return {ironHours:ironAt===null?null:ironAt/3600000,mittenHours:mittenAt===null?null:mittenAt/3600000,fireHours:fireAt===null?null:fireAt/3600000,outfitHours:outfitAt===null?null:outfitAt/3600000,victories:s.defeated,strength:s.gym.strength,sweat:s.sweat,buttons:s.buttons,snow:p.snow,ammoSnow:spentAmmo,regularSnow:regularCost,losses};
}
const mean=(xs,key)=>xs.reduce((n,x)=>n+x[key],0)/xs.length;
const median=xs=>{if(!xs.length)return null;xs.sort((a,b)=>a-b);return xs[Math.floor(xs.length/2)];};
const results=[];
for(const hours of [.5,3,12])for(const mode of ['regular','mixed','continuous']) {
  const runs=Array.from({length:60},(_,i)=>simulate(271828+i,hours,mode));
  const reached=runs.filter(r=>r.ironHours!==null);
  const result={hoursPerDay:hours,mode,n:runs.length,ironBy72h:runs.filter(r=>r.ironHours!==null&&r.ironHours<=72).length,ironBy31d:reached.length,earliestHours:reached.length?Math.min(...reached.map(r=>r.ironHours)):null,medianHours:median(reached.map(r=>r.ironHours)),meanVictories:mean(runs,'victories'),meanStrength:mean(runs,'strength'),meanSnow:mean(runs,'snow'),meanAmmoSnow:mean(runs,'ammoSnow'),meanRegularSnow:mean(runs,'regularSnow'),medianMittensHours:median(runs.filter(r=>r.mittenHours!==null).map(r=>r.mittenHours)),medianFireHours:median(runs.filter(r=>r.fireHours!==null).map(r=>r.fireHours)),runs};
  results.push(result);console.log(JSON.stringify({...result,runs:undefined}));
}
const sources=['services/winter/battle.js','services/winter/gym.js','config/winter/combat.json','scripts/winter/weights-balance.js'];
const sourceHashes=Object.fromEntries(sources.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
fs.writeFileSync(path.join(out,'simulation.json'),JSON.stringify({seeds:'271828..271887',nativeEngine:true,assumptions:'Stone start, zero snow, no test grants or guaranteed test drops; 60-second restart after defeat/discovery; 31 days maximum; sessions start every24h; instant purchases and queue refill; no gambling; buy Mittens then Fire Flower for special policies then outfit; train only STR25; grow enemy HP1/victory; base5% Button per hit,75% while zero. Iron requires325 victory Sweat,25lb lift,Stone and1m snow.',sourceHashes,results},null,2));
let report='# Iron progression with growing snowmen\n\n60 seeds per scenario; native Winter combat engine. Sessions start every24h, run up to31 days. Stone/zero-snow start; onboarding excluded. No development shortcuts, no Slots gambling. Restarts cost60 seconds; purchases and special queue refill assume immediate player inputs. Iron requires STR25 (325 Sweat),25lb lift,Stone and1m snow. Accuracy/dodge/speed are left untrained to prioritize Iron.\n\n|Hours/day|Attacks|Iron by72h /60|Iron by31d /60|Earliest hours|Median reached hours|Mean wins at stop|Mean ammo snow|\n|---:|---|---:|---:|---:|---:|---:|---:|\n';
for(const r of results)report+='|'+[r.hoursPerDay,r.mode,r.ironBy72h,r.ironBy31d,r.earliestHours?.toFixed(2)??'Not reached',r.medianHours?.toFixed(2)??'Not reached',r.meanVictories.toFixed(1),r.meanAmmoSnow.toFixed(0)].join('|')+'|\n';
report+='\nMixed queues one special per four throws. Continuous queues at every opportunity. After Fire Flower, each special spends five Spicy ammunition and deals50 base damage. Mittens and outfit purchases increase maximum HP without healing the current run. Growing enemy HP, hit accuracy and losses are native. These estimates depend strongly on active inputs and ammo spending. No stats or rewards were tuned to force a target. Full seed records, clothing timings and source hashes are in simulation.json.\n';
fs.writeFileSync(path.join(out,'balance.md'),report);
