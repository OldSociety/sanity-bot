// Offline projection of a read-only saved checkpoint. Never connects to Discord
// or SQLite, and never changes the source configuration on disk.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const mode = process.argv[2];
if (!['prior','reduced'].includes(mode)) throw Error('Use prior or reduced.');
const startingPoint = process.argv[3] || 'saved';
if (!['saved','fresh'].includes(startingPoint)) throw Error('Use saved or fresh.');
const root = path.resolve(__dirname, '../..');
const directory = path.join(root, 'artifacts/winter-s1-s2-progression-2026-11-01');
const input = JSON.parse(fs.readFileSync(path.join(directory,'active-input.json')));
const rules = require('../../config/winter/chapters-2026-10-29.json');
if (mode === 'prior') for (const row of rules.snowmen.slice(0,2)) delete row.statPercent;
const M = require('../../services/winter/playtest-model');
const HOUR = 3600000, saved = startingPoint === 'saved' ? JSON.parse(input.run.state) : M.fresh('gym',314159);
if(startingPoint==='fresh'){saved.liveRules=true;M.action(saved,'throw');}
else {assert.equal(saved.strength,20); assert.equal(saved.tiers[2].wins,25); assert.equal(saved.liveRules,true);}
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function project({seed,visitHours,policy,horizon=168}) {
  const s=structuredClone(saved),start=s.now, before=structuredClone(s);
  M.upgradeOpeningBalance(s);
  // First sample retains the actual saved RNG; others sample alternate futures.
  if(seed!==saved.rng)s.rng=seed;
  const startProduction=s.ledger.sources['gathering:snow:gained']||0;
  let previousProduction=startProduction,commands=0,visits=0;
  const checkpoints=[],milestones={},step=visitHours*HOUR;
  const act=(name,q)=>{M.action(s,name,q,{shopCurrency:'diamonds'});commands++;};
  const batches=(n,work)=>{for(const size of [100,10,1])while(n>=size){work(String(size));n-=size;}};
  const worth=()=>s.wallet.snow+s.wallet.diamonds*1000;
  function fund(diamonds) {
    const missing=Math.max(0,diamonds-s.wallet.diamonds);
    if(s.wallet.snow<missing*1000)return false;
    batches(missing,q=>act('diamonds-convert',q));return true;
  }
  const check=()=>{
    M.validate(s);assert(s.playerHp>0&&s.playerHp<=50);assert(s.enemyHp>0&&s.enemyHp<=M.enemy(s).hp+1e-8);
    assert(s.tiers[2].wins>=before.tiers[2].wins);assert(s.tiers[1].wins>=before.tiers[1].wins);
    assert(s.tiers[1].attacks+s.tiers[2].attacks-before.tiers[1].attacks-before.tiers[2].attacks<=Math.ceil((s.now-start)/3000));
  };
  const capture=()=>({hours:(s.now-start)/HOUR,strength:s.strength,accuracy:s.accuracy,s1Wins:s.tiers[1].wins,s2Wins:s.tiers[2].wins,s2Losses:s.tiers[2].losses,
    newS2Wins:s.tiers[2].wins-before.tiers[2].wins,iron:s.tier===3,red:s.wallet.red,snow:s.wallet.snow,diamonds:s.wallet.diamonds,
    chapterComplete:s.chapter===2,enemy:M.enemy(s)});
  const visit=()=>{
    visits++;act('throw');
    if(policy!=='train-restock')return;
    while(s.strength<100&&s.wallet.sweat>=s.strength+s.accuracy+s.defense+s.special+1)act('train-strength');
    if(s.strength>=25&&!s.ironMaterial)act('lift');
    if(s.ironMaterial&&s.tier===2&&worth()>=2000000&&fund(2000))act('iron');
    if(s.tiers[1].wins>=100&&!s.owned[2])act('buy-s2');
    if(s.owned[2]&&s.target!==2)act('select-s2');
    if(s.owned[2]&&s.tiers[2].wins>=100&&worth()>=M.rules.snowmen[2].snowPrice&&fund(M.rules.snowmen[2].snowPrice/M.rules.diamondSnowCost)) {act('buy-s3');return;}
    const production=s.ledger.sources['gathering:snow:gained']||0;
    const regularReserve=Math.ceil(step/3000)*10;
    const budget=Math.min(Math.max(0,worth()-regularReserve),Math.floor((production-previousProduction)/2));
    const count=Math.floor(budget/1000);
    if(count&&fund(count))batches(count,q=>act('buy-spicy',q));
    if(M.ammoAvailable(s,'red'))act('equip-red');
    previousProduction=production;
  };
  const caughtUpAt=startingPoint==='fresh'?start:Math.max(start,(input.capturedAt-input.run.startedAt)*input.run.speed);
  M.settle(s,caughtUpAt);check();
  if(policy!=='idle')visit();
  let nextVisit=policy==='idle'?Infinity:s.now+step;
  let nextHour=start+HOUR;
  while(nextHour<=s.now)nextHour+=HOUR;
  while(s.now<start+horizon*HOUR&&s.chapter!==2){
    const at=Math.min(nextVisit,nextHour,start+horizon*HOUR);
    M.settle(s,at);
    if(at===nextVisit){visit();nextVisit+=step;}
    check();
    if(s.tiers[1].wins>=100&&milestones.s1Wins100===undefined)milestones.s1Wins100=before.tiers[1].wins>=100?0:(s.milestones.clearS1-start)/HOUR;
    if(s.strength>=25&&milestones.strength25===undefined)milestones.strength25=(s.now-start)/HOUR;
    if(s.tier===3&&milestones.iron===undefined)milestones.iron=(s.now-start)/HOUR;
    if(s.tiers[2].wins>=50&&milestones.s2Wins50===undefined)milestones.s2Wins50=(s.now-start)/HOUR;
    if(s.tiers[2].wins>=100&&milestones.s2Wins100===undefined)milestones.s2Wins100=(s.now-start)/HOUR;
    if(s.chapter===2)milestones.s3Purchase=(s.now-start)/HOUR;
    if([6,12,24,48,72,168].includes((s.now-start)/HOUR)||s.chapter===2)checkpoints.push(capture());
    if(at===nextHour)nextHour+=HOUR;
  }
  return{mode,seed,visitHours,policy,commands,visits,milestones,checkpoints,final:capture(),finalState:s};
}
function main(){
  const rows=[];
  for(const visitHours of [1,4])for(let i=0;i<16;i++)rows.push(project({seed:i===0?saved.rng:940000+i,visitHours,policy:'train-restock'}));
  for(const visitHours of [1,4])rows.push(project({seed:saved.rng,visitHours,policy:'regular-refresh',horizon:72}));
  rows.push(project({seed:saved.rng,visitHours:4,policy:'idle',horizon:72}));
  const replay=rows.filter(r=>r.seed===saved.rng);
  for(const r of replay)assert.deepEqual(project({seed:r.seed,visitHours:r.visitHours,policy:r.policy,horizon:r.policy==='train-restock'?168:72}),r);
  const percentile=(a,p)=>{const v=a.sort((x,y)=>x-y);return v[Math.floor((v.length-1)*p)];};
  const summary=[1,4].map(hours=>{
    const group=rows.filter(r=>r.policy==='train-restock'&&r.visitHours===hours);
    const milestones=Object.fromEntries(['s1Wins100','strength25','iron','s2Wins50','s2Wins100','s3Purchase'].map(k=>{const values=group.map(r=>r.milestones[k]).filter(Number.isFinite);return[k,{completed:values.length,median:values.length?percentile([...values],.5):null,min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null,p10:values.length?percentile([...values],.1):null,p90:values.length?percentile([...values],.9):null}];}));
    return{visitHours:hours,samples:group.length,milestones,actualSavedRng:group[0].checkpoints};
  });
  const sources=[__filename,...Object.keys(require.cache).filter(f=>f.startsWith(path.join(root,'services/winter'))||f.startsWith(path.join(root,'config/winter')))];
  const manifest=Object.fromEntries([...new Set(sources)].map(f=>[path.relative(root,f),hash(fs.readFileSync(f))]));
  const prefix=mode+(startingPoint==='fresh'?'-fresh':'');
  fs.writeFileSync(path.join(directory,`${prefix}-results.json`),JSON.stringify({mode,startingPoint,rows},null,2));
  const report={mode,startingPoint,histories:rows.length,replays:replay.length,manifest,summary,controls:rows.filter(r=>r.policy!=='train-restock').map(({finalState,...r})=>r),
    assumptions:(startingPoint==='saved'?'Saved Run9 STR20/S2-25 checkpoint with real balances and saved RNG in first sample; includes outstanding idle time. Hours relative to last saved checkpoint.':'Fresh post-Gym STR3/Stone fixture, zero currencies/ammo and zero wins; tutorial preparation time excluded. Hours from fixture start.')+' Full native live mechanics. Other samples use explicitly varied future RNG. Train STR with earned Sweat; Iron first; half newly produced snow funds finite Spicy batches with regular reserve; convert through real diamonds controls; no Ice before Chapter1 ends. Game-time at1x. No optimality or S3 combat claim.'};
  fs.writeFileSync(path.join(directory,`${prefix}-summary.json`),JSON.stringify(report,null,2));
  console.log(JSON.stringify({mode,histories:report.histories,replays:report.replays,summary,controls:report.controls.map(r=>({policy:r.policy,visitHours:r.visitHours,final:r.final}))}));
}
if(require.main===module)main();
module.exports={project};
