// Offline first-defeat measurement, using candidate chapter-one rules.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const M=require('../../services/winter/studies/early-progression'),{gymBaseline}=require('./strength-investment');
const H=M.HOUR;
function run(seed,mode){
 const c=structuredClone(M.config),s=M.fresh(c),b=gymBaseline(c);
 s.strength=b.strength;s.sweat=b.sweat;s.gymStarterClaimed=true;s.equipped='red';
 s.red=mode==='stocked'?1000000:mode==='batch100'?100:0;
 let x=seed>>>0;const random=()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;};
 const rng={combat:random,buttons:()=>.99};
 let nextVisit=4*H,lastProduction=0;
 while(s.now<7*24*H){
  const instant=mode!=='four-hour-half',rate=M.passiveRate(s.strength,c);
  const nextTraining=instant&&s.strength<25&&rate?s.now+Math.max(1,Math.ceil(((s.strength+1-s.sweat)*H-s.sweatRemainder)/rate)):Infinity;
  const nextSupply=mode==='production'&&!s.red?s.now+Math.max(1,Math.ceil(((c.redSnowCost-s.snow)*1000-s.snowRemainder)/c.stoneRate)):Infinity;
  const at=Math.min(s.nextPlayerAt,s.nextEnemyAt,nextTraining,nextSupply,mode==='four-hour-half'?nextVisit:Infinity);
  const before=s.tiers[s.target].losses;
  assert(M.settle(s,at,rng,c).complete);
  if(s.tiers[s.target].losses>before){
   const enemy=M.enemy(s,s.target,c),t=s.tiers[s.target];
   return {seed,mode,minutes:s.now/60000,tier:s.target,wins:t.wins,totalWins:Object.values(s.tiers).reduce((n,t)=>n+t.wins,0),
    strength:s.strength,enemyHp:enemy.hp,enemyDamage:enemy.damage,redRemaining:s.red,redUsed:Object.values(s.tiers).reduce((n,t)=>n+t.red,0),
    regularUsed:Object.values(s.tiers).reduce((n,t)=>n+t.regular,0)};
  }
  if(mode==='production'&&s.snow>=c.redSnowCost)M.purchase(s,'red',Math.floor(s.snow/c.redSnowCost),c);
  if(instant||at===nextVisit){
   while(s.strength<25&&M.purchase(s,'strength',1,c)){}
   if(M.unlocked(s,s.target+1,c))M.select(s,s.target+1,c);
   if(!instant){const produced=s.ledger.snowProduced-lastProduction;lastProduction=s.ledger.snowProduced;
    const qty=Math.floor(Math.min(s.snow,produced/2)/c.redSnowCost);if(qty)M.purchase(s,'red',qty,c);nextVisit+=4*H;}
  }
 }
 throw Error('No first defeat in study window.');
}
function main(){
 const out=path.resolve(process.argv[2]||'artifacts/winter-first-defeat-to-iron-2026-10-29');
 if(fs.existsSync(out))throw Error('Preserve prior evidence.');fs.mkdirSync(out,{recursive:true});
 const results=[],summary=[],q=(v,p)=>[...v].sort((a,b)=>a-b)[Math.floor((v.length-1)*p)];
 for(const mode of ['four-hour-half','production','batch100','stocked']){
  const rows=Array.from({length:1024},(_,i)=>run(920001+i,mode));assert.deepEqual(run(920001,mode),rows[0]);results.push(...rows);
  const tierCounts={};for(const r of rows)tierCounts[r.tier]=(tierCounts[r.tier]||0)+1;
  const metrics={};for(const key of ['minutes','wins','strength','enemyHp','enemyDamage','redUsed','regularUsed'])metrics[key]={p10:q(rows.map(r=>r[key]),.1),median:q(rows.map(r=>r[key]),.5),p90:q(rows.map(r=>r[key]),.9)};
  summary.push({mode,seeds:rows.length,tierCounts,metrics});
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results));
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({assumptions:'Post-Gym STR3, 50HP, current passive floor(STR/3), no Iron or clothing. Four-hour-half: zero starting stock, manual purchases at four-hour visits. Production: zero stock, automatic all-affordable Spicy buying and immediate training. Batch100: 100 supplied Spicy then regulars, immediate training. Stocked: unlimited Spicy and immediate training. Next unlocked tier selected immediately in instant modes. All times exclude tutorial and Stone acquisition.',summary},null,2));
 console.log(JSON.stringify(summary,null,2));
}
if(require.main===module)main();module.exports={run};
