// Selene player-policy sensitivity only. Combat and native AI are untouched.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto')
const { spawn } = require('node:child_process')
process.env.NODE_ENV = 'development'
const root = path.resolve(__dirname, '../..')
const prior = path.join(root,'artifacts/arena-roster-2026-10-20')
const directory = path.join(root,'artifacts/arena-selene-policy-2026-10-20')
const model = path.join(prior,'model')
const manifest = JSON.parse(fs.readFileSync(path.join(prior,'manifest.json'),'utf8'))
const tactics = require(path.join(model,'services/arena/tactics'))
const combat = require(path.join(model,'services/arena/combat'))
const { kitFor, canUse } = require(path.join(model,'services/arena/rules'))
const S = require(path.join(model,'services/arena/selene'))
const { characters, isSelectable } = require(path.join(model,'services/arena/characters'))
const roster = characters.filter(isSelectable), selene = roster.find(c=>c.kit==='spooky-selene')
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const write = (p,data) => fs.writeFileSync(p,JSON.stringify(data,null,2)+'\n')
const count = 250
const policies = [
  { name:'native-midpoint', strategy:'native', choice:3 },
  { name:'native-max-finisher', strategy:'native', choice:5 },
  { name:'save-finisher-midpoint', strategy:'save', choice:3 },
  { name:'save-finisher-max', strategy:'save', choice:5 },
  { name:'threat-wall-midpoint', strategy:'threat', choice:3 },
  { name:'threat-wall-max', strategy:'threat', choice:5 },
]
function choose(b, policy, context) {
  const f=b.player, target=b.enemy
  const native=tactics.decide(f,target,{ choice:policy.choice,context })
  if(policy.strategy==='native') return native.slot
  if(native.reason==='basic-lethal'||native.reason==='knockout') return native.slot
  if(canUse(f,'special3')) return 'special3'
  const kit=kitFor(f), heal=Math.ceil(f.maxHp*S.healPercent(f,kit.special1)/100)
  const horizon=tactics.survival(f,target,context)
  const urgent=f.hp/f.maxHp<=.25||horizon.own<=1.5
  if(canUse(f,'special1')&&f.hp/f.maxHp<=.6&&f.maxHp-f.hp>=heal&&(f.stress>=3||urgent)) {
    const after=tactics.survival({...f,hp:Math.min(f.maxHp,f.hp+heal),stress:f.stress-1},target,context)
    if(after.own>horizon.own+.25) return 'special1'
  }
  if(policy.strategy==='threat'&&canUse(f,'special2')&&!S.wallActive(f,undefined,target)&&f.hope<=3&&canUse(target,'special3'))
    return 'special2'
  return null
}
function simulate(enemy,policy,trial) {
  let seed=(271828+Math.imul(trial+1,2654435761))>>>0
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
  const pct=()=>random()*100, die=n=>()=>1+Math.floor(random()*n)
  let b=combat.newBattle(0,{character:selene,opponent:enemy.id}),ledgers=0
  const paid={player:0,enemy:0}
  while(b.status==='playing') {
    assert(b.tick<1000)
    const special=side=>Object.entries(b.statistics[side].damage).filter(([k])=>k.startsWith('special')).reduce((n,[,v])=>n+v,0)
    const context={rounds:b.tick,ownSpecialDamage:special('player'),opponentSpecialDamage:special('enemy')}
    const slot=choose(b,policy,context), action=slot==='special3'?{special3:true,choice:policy.choice}:slot||'basic'
    const next=combat.takeTurn(b,action,die(4),die(12),pct,()=>Math.floor(pct()),()=>Math.floor(pct()),pct,
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
      assert(f.hp>=0&&f.hp<=f.maxHp&&f.stress>=0&&f.stress<=f.maxStress)
      ledgers++
    }
    b=next
  }
  return {b,ledgers,hash:hash(JSON.stringify(b))}
}
function inputCheck() {
  for(const [p,h] of Object.entries(manifest.hashes)) assert.equal(hash(fs.readFileSync(path.join(model,p))),h,'Prior frozen model changed')
}
async function main() {
  inputCheck()
  if(process.argv[2]==='worker') {
    const index=Number(process.argv[3]),rows=[]
    for(const [j,enemy] of roster.entries()) if(j%4===index) for(const policy of policies) {
      const row={enemy:enemy.id,enemyLabel:enemy.label,policy:policy.name,count,wins:0,rounds:0,ledgers:0,heals:0,walls:0,finishers:0,healing:0,samples:{}}
      for(let trial=0;trial<count;trial++) {
        const {b,ledgers,hash}=simulate(enemy,policy,trial),s=b.statistics.player
        row.wins+=Number(b.status==='victory');row.rounds+=b.tick;row.ledgers+=ledgers
        row.heals+=s.uses.special1;row.walls+=s.uses.special2;row.finishers+=s.uses.special3;row.healing+=s.hpRestored
        if([0,124,249].includes(trial)) row.samples[trial]=hash
      }
      row.winPercent=row.wins/count*100
      rows.push(row)
      write(path.join(directory,`worker-${index}-progress.json`),rows)
      console.log(`${enemy.label} / ${policy.name}: ${row.winPercent.toFixed(1)}%`)
    }
    write(path.join(directory,`worker-${index}.json`),rows)
    inputCheck()
    return
  }
  if(process.argv[2]==='replay') {
    const rows=JSON.parse(fs.readFileSync(path.join(directory,'results.json'),'utf8')).rows
    for(const row of rows) for(const trial of [0,124,249])
      assert.equal(simulate(roster.find(c=>c.id===row.enemy),policies.find(p=>p.name===row.policy),trial).hash,row.samples[trial])
    write(path.join(directory,'replay.json'),{pairs:126,exact:true})
    return
  }
  assert(!fs.existsSync(directory),'Completed/partial reports preserved; choose a fresh directory')
  fs.mkdirSync(directory,{recursive:true})
  write(path.join(directory,'manifest.json'),{count,policies,seed:271828,source:'../arena-roster-2026-10-20/model',hashes:manifest.hashes,runnerHash:hash(fs.readFileSync(__filename)),scope:'Player Selene policy only; native AI and balance untouched. No claim of optimality.'})
  // Exact baseline control against the original study's stored opening trial.
  const original=JSON.parse(fs.readFileSync(path.join(prior,'results.json'),'utf8')).rows.filter(r=>r.policy==='native'&&r.player===selene.id)
  for(const row of original) assert.equal(simulate(roster.find(c=>c.id===row.enemy),policies[0],0).hash,row.samples[0])
  await Promise.all(Array.from({length:4},(_,i)=>new Promise((resolve,reject)=>{
    const log=fs.openSync(path.join(directory,`worker-${i}.log`),'a')
    const child=spawn(process.execPath,[__filename,'worker',String(i)],{cwd:root,stdio:['ignore',log,log],windowsHide:true})
    child.on('error',reject);child.on('exit',code=>{fs.closeSync(log);code===0?resolve():reject(Error('Worker failed '+i))})
  })))
  const rows=Array.from({length:4},(_,i)=>JSON.parse(fs.readFileSync(path.join(directory,`worker-${i}.json`),'utf8'))).flat()
  inputCheck()
  write(path.join(directory,'results.json'),{fights:rows.length*count,ledgers:rows.reduce((n,r)=>n+r.ledgers,0),baselineOpeningExact:7,rows})
  await new Promise((resolve,reject)=>{
    const log=fs.openSync(path.join(directory,'replay.log'),'a')
    const child=spawn(process.execPath,[__filename,'replay'],{cwd:root,stdio:['ignore',log,log],windowsHide:true})
    child.on('error',reject);child.on('exit',code=>{fs.closeSync(log);code===0?resolve():reject(Error('Replay failed'))})
  })
  console.log('Complete: 10,500 fights, all ledgers, baseline controls and 126 fresh-process replays pass.')
}
main().catch(e=>{console.error(e);process.exitCode=1})
