// Character-focused offline study. No combat/config edits or bot activation.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto')
const {spawn}=require('node:child_process')
process.env.NODE_ENV='development'
const root=path.resolve(__dirname,'../..'),prior=path.join(root,'artifacts/arena-roster-2026-10-20')
const directory=path.join(root,'artifacts/arena-spooky-marq-audit-2026-10-20'),model=path.join(prior,'model')
const manifest=JSON.parse(fs.readFileSync(path.join(prior,'manifest.json'),'utf8'))
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
const write=(p,data)=>fs.writeFileSync(p,JSON.stringify(data,null,2)+'\n')
function load(base) {
  const tactics=require(path.join(base,'services/arena/tactics')),combat=require(path.join(base,'services/arena/combat'))
  const rules=require(path.join(base,'services/arena/rules')),S=require(path.join(base,'services/arena/selene'))
  const {characters,isSelectable}=require(path.join(base,'services/arena/characters'))
  return {tactics,combat,rules,S,roster:characters.filter(isSelectable)}
}
const api=load(model),marq=api.roster.find(c=>c.kit==='spooky-marq'),seedBase=314159,count=1000
const pairs=[...api.roster.filter(c=>c.id!==marq.id).map(c=>[marq.id,c.id]),...api.roster.filter(c=>c.id!==marq.id).map(c=>[c.id,marq.id]),[marq.id,marq.id]]
const jobs=[]
for(const choice of [3,5])for(const [player,enemy]of pairs)jobs.push({player,enemy,choice,policy:'native',count})
for(const c of api.roster.filter(c=>['spooky-selene','classic-azulis'].includes(c.kit)))jobs.push({player:c.id,enemy:marq.id,choice:5,policy:'selective-support',count})
function checkInputs(original=false) {
  for(const [p,h]of Object.entries(manifest.hashes)) {
    assert.equal(hash(fs.readFileSync(path.join(model,p))),h,'Frozen model changed '+p)
    if(original)assert.equal(hash(fs.readFileSync(path.join(root,p))),h,'Workspace combat input differs '+p)
  }
}
function choose(engine,b,job,context) {
  const {tactics,rules,S}=engine,f=b.player,target=b.enemy
  const d=tactics.decide(f,target,{choice:job.choice,context})
  if(job.policy==='native'||['basic-lethal','knockout'].includes(d.reason))return d.slot
  if(rules.canUse(f,'special3'))return 'special3'
  const kit=rules.kitFor(f),heal=Math.ceil(f.maxHp*S.healPercent(f,kit.special1)/100),h=tactics.survival(f,target,context)
  const urgent=f.hp/f.maxHp<=.25||h.own<=1.5
  if(rules.canUse(f,'special1')&&f.hp/f.maxHp<=.6&&f.maxHp-f.hp>=heal&&(f.stress>=3||urgent)) {
    const after=tactics.survival({...f,hp:Math.min(f.maxHp,f.hp+heal),stress:f.stress-1},target,context)
    if(after.own>h.own+.25)return 'special1'
  }
  if(kit.special2.type==='windWall') {
    if(rules.canUse(f,'special2')&&!S.wallActive(f,undefined,target)&&f.hope<=3&&rules.canUse(target,'special3'))return 'special2'
  } else if(rules.canUse(f,'special2')&&(f.hope<4||h.own<=2.5))return 'special2'
  return null
}
function fight(engine,job,trial) {
  let seed=(seedBase+Math.imul(trial+1,2654435761))>>>0
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
  const pct=()=>random()*100,die=n=>()=>1+Math.floor(random()*n)
  let b=engine.combat.newBattle(0,{character:engine.roster.find(c=>c.id===job.player),opponent:job.enemy}),ledgers=0
  const paid={player:0,enemy:0},zero={player:false,enemy:false}
  while(b.status==='playing') {
    assert(b.tick<1000,'Nonterminating fight')
    const special=side=>Object.entries(b.statistics[side].damage).filter(([k])=>k.startsWith('special')).reduce((n,[,v])=>n+v,0)
    const context={rounds:b.tick,ownSpecialDamage:special('player'),opponentSpecialDamage:special('enemy')}
    const slot=choose(engine,b,job,context),action=slot==='special3'?{special3:true,choice:job.choice}:slot||'basic'
    const next=engine.combat.takeTurn(b,action,die(4),die(12),pct,()=>Math.floor(pct()),()=>Math.floor(pct()),pct,
      {rollRecovery:pct,rollFinisher:()=>35+Math.floor(random()*11),rollBlock:pct,rollResistance:pct})
    assert.notEqual(next,b)
    const events=next.history.slice(b.history.length)
    for(const side of ['player','enemy']) {
      const f=next[side],s=next.statistics[side],other=side==='player'?'enemy':'player'
      const label=side==='player'&&b.player.name===b.enemy.name?'Your '+f.name:f.name
      paid[side]+=events.filter(e=>e.kind==='sacrifice'&&e.actor===label).reduce((n,e)=>n+e.hp,0)
      assert.equal(f.maxHp+s.hpRestored-next.statistics[other].hpDamage-paid[side],f.hp,'HP ledger')
      assert.equal(f.maxStress-s.stressSpent+s.stressRecovered-s.stressRemovedTaken,f.stress,'Stress ledger')
      assert.equal(s.initial+s.generated-s.spent,s.remaining,'Duality ledger')
      assert.equal(s.remaining,side==='player'?f.hope:f.fear)
      assert.equal(Object.values(s.hpDamageBySource).reduce((n,v)=>n+v,0),s.hpDamage)
      assert(s.brinkActivations<=1,'Brink fired twice')
      if(f.kit==='spooky-marq'&&s.brinkActivations)assert.equal(s.hpRestored,58,'Brink restoration differs')
      assert(f.hp>=0&&f.hp<=f.maxHp&&f.stress>=0&&f.stress<=f.maxStress)
      if(f.kit==='hellfed-marq')assert(f.rage>=0&&f.rage<=3)
      else zero[side]||=f.stress===0
      assert.equal(s.criticals.special2,0);assert.equal(s.criticals.special3,0)
      ledgers++
    }
    b=next
  }
  assert(['victory','defeat'].includes(b.status))
  return {b,ledgers,zero,hash:hash(JSON.stringify(b))}
}
function ci(wins,n) {
  const z=1.959963984540054,p=wins/n,d=1+z*z/n,c=(p+z*z/(2*n))/d,r=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d
  return [(c-r)*100,(c+r)*100]
}
function accumulate(row,b,zero) {
  for(const side of ['player','enemy']) {
    const f=b[side],s=b.statistics[side],m=row[side+'Metrics']
    const won=side==='player'?b.status==='victory':b.status==='defeat'
    const values={wins:Number(won),brinkFights:s.brinkActivations,winsAfterBrink:Number(won&&s.brinkActivations>0),winsWithoutBrink:Number(won&&!s.brinkActivations),hpRestored:s.hpRestored,
      s1:s.uses.special1,s2:s.uses.special2,s3:s.uses.special3,basic:s.damage.basic,special1:s.damage.special1,special2:s.damage.special2,special3:s.damage.special3,
      stressRemoved:s.stressRemoved,stressRemovedTaken:s.stressRemovedTaken,stressSpent:s.stressSpent,zeroStressFight:Number(zero[side]),exposureDamageTaken:s.vulnerabilityDamageTaken,
      finisherAffordable:Number(s.firstFinisherAffordableRound!==null),finisherUsed:Number(s.uses.special3>0)}
    for(const [k,v]of Object.entries(values))m[k]=(m[k]||0)+v
    if(f.kit==='spooky-marq') {
      const label=side==='player'&&b.player.name===b.enemy.name?'Your '+f.name:f.name
      for(const e of b.history.filter(e=>e.kind==='special'&&e.actor===label)) {
        if(e.slot==='special1') {
          m.overwhelmRemovalEvents=(m.overwhelmRemovalEvents||0)+Number(e.stressRemoved>0)
          m.overwhelmStressRemoved=(m.overwhelmStressRemoved||0)+(e.stressRemoved||0)
        }
        if(e.slot==='special2') {
          assert.equal(e.percent,e.total+8,'Combo coefficient mismatch')
          assert(e.rolls.length>=2)
          assert.equal(e.total,e.rolls.reduce((n,v)=>n+v,0))
          for(let i=1;i<e.rolls.length-1;i++)assert(e.rolls[i]>=e.rolls[i-1])
          assert(e.rolls.at(-1)<e.rolls.at(-2))
          row.comboTotals[e.total]=(row.comboTotals[e.total]||0)+1
          row.comboDamage[e.damage]=(row.comboDamage[e.damage]||0)+1
        }
      }
    }
  }
}
async function main() {
  const mode=process.argv[2]
  checkInputs(mode!=='worker'&&mode!=='replay')
  if(mode==='replay') {
    const {rows}=JSON.parse(fs.readFileSync(path.join(directory,'results.json'),'utf8'))
    for(const row of rows)for(const trial of [0,499,999])assert.equal(fight(api,row,trial).hash,row.samples[trial])
    write(path.join(directory,'replay.json'),{pairs:84,exact:true})
    return
  }
  if(mode==='worker') {
    const index=Number(process.argv[3]),rows=[]
    for(const [j,job]of jobs.entries())if(j%4===index) {
      const row={...job,playerLabel:api.roster.find(c=>c.id===job.player).label,enemyLabel:api.roster.find(c=>c.id===job.enemy).label,
        wins:0,rounds:0,pacing:0,ledgers:0,samples:{},playerMetrics:{},enemyMetrics:{},comboTotals:{},comboDamage:{}}
      for(let trial=0;trial<count;trial++) {
        const {b,ledgers,zero,hash}=fight(api,job,trial)
        row.wins+=Number(b.status==='victory');row.rounds+=b.tick;row.pacing+=Number(b.tick>=10&&b.tick<=20);row.ledgers+=ledgers
        if([0,499,999].includes(trial))row.samples[trial]=hash
        accumulate(row,b,zero)
      }
      row.winPercent=row.wins/count*100;row.ci95=ci(row.wins,count);row.averageRounds=row.rounds/count
      rows.push(row);write(path.join(directory,`worker-${index}-progress.json`),rows)
      console.log(`${row.playerLabel} vs ${row.enemyLabel} / ${job.policy} choice${job.choice}: ${row.winPercent.toFixed(1)}%`)
      checkInputs()
    }
    write(path.join(directory,`worker-${index}.json`),rows)
    return
  }
  assert(!fs.existsSync(directory),'Preserve previous evidence; use a new output')
  fs.mkdirSync(directory,{recursive:true})
  write(path.join(directory,'manifest.json'),{seed:seedBase,count,jobs,source:'../arena-roster-2026-10-20/model',hashes:manifest.hashes,runnerHash:hash(fs.readFileSync(__filename)),scope:'Fresh-seed native Spooky Marq matches; choice3/5; selective support only for player Selene/Azulis; no balance or AI edits.'})
  const original=load(root)
  for(const job of jobs.filter(j=>j.choice===3))assert.equal(fight(api,job,0).hash,fight(original,job,0).hash)
  write(path.join(directory,'workspace-equivalence.json'),{fights:13,exact:true})
  await Promise.all(Array.from({length:4},(_,i)=>new Promise((resolve,reject)=>{
    const log=fs.openSync(path.join(directory,`worker-${i}.log`),'a')
    const child=spawn(process.execPath,[__filename,'worker',String(i)],{cwd:root,stdio:['ignore',log,log],windowsHide:true})
    child.on('error',reject);child.on('exit',code=>{fs.closeSync(log);code===0?resolve():reject(Error('Worker failed '+i))})
  })))
  const rows=Array.from({length:4},(_,i)=>JSON.parse(fs.readFileSync(path.join(directory,`worker-${i}.json`),'utf8'))).flat()
  checkInputs(true)
  write(path.join(directory,'results.json'),{fights:28000,ledgers:rows.reduce((n,r)=>n+r.ledgers,0),inputsUnchanged:true,rows})
  await new Promise((resolve,reject)=>{
    const log=fs.openSync(path.join(directory,'replay.log'),'a'),child=spawn(process.execPath,[__filename,'replay'],{cwd:root,stdio:['ignore',log,log],windowsHide:true})
    child.on('error',reject);child.on('exit',code=>{fs.closeSync(log);code===0?resolve():reject(Error('Replay failed'))})
  })
  console.log('Complete: 28,000 fights; accounting, mechanism checks, original-source controls and 84 replay pairs pass.')
}
main().catch(e=>{console.error(e);process.exitCode=1})
