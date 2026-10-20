// Native development combat, seeded public-state policy; no DB, Discord or PM2.
process.env.NODE_ENV = 'development'
const fs = require('node:fs'), assert = require('node:assert/strict'), crypto = require('node:crypto')
const directory = 'artifacts/arena-kylax-2026-10-20'
const count = Number(process.argv[2] || 1000)
assert(Number.isInteger(count) && count > 0)
const label = process.argv[3] || String(count)
assert(/^[a-z0-9-]+$/.test(label))
const output = `${directory}/simulation-${label}.json`
assert(!fs.existsSync(output), 'Completed reports are immutable; choose another count or output directory')
const tactics = require('../../services/arena/tactics')
tactics.decide = require('./arena-parity-policy').createPolicy(tactics)
const combat = require('../../services/arena/combat')
const { resolveCharacter, characters, isSelectable } = require('../../services/arena/characters')
const names = characters.filter(isSelectable).filter(c => c.name !== 'Kylax').map(c => c.label)
const pairs = [...names.map(n => ['Kylax', n]), ...names.map(n => [n, 'Kylax']), ['Kylax', 'Kylax']]
const sourceFiles = [...fs.readdirSync('services/arena').filter(n=>n.endsWith('.js')).map(n=>'services/arena/'+n),
  ...require('../../services/arena/character-config').characterConfigFiles,
  'config/arena/arena-balance-development.json', 'config/arena/arena-balance-production.json',
  'config/arena/arena-builds-production.json', 'scripts/arena/arena-kylax-report.js', 'scripts/arena/arena-parity-policy.js']
const hashes = () => Object.fromEntries(sourceFiles.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]))
const frozen = hashes()
const rows = []
for(const [player, enemy] of pairs) {
  const row = { player, enemy, fights: count, wins:0, rounds:0, pacing:0, ledgers:0,
    kylax:{ player:{}, enemy:{} }, damage:{player:{},enemy:{}}, histogram:{} }
  for(let trial=0;trial<count;trial++) {
    let seed=(271828+Math.imul(trial+1,2654435761))>>>0
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
    const die=size=>()=>1+Math.floor(random()*size), pct=()=>random()*100
    let b=combat.newBattle(0,{character:resolveCharacter(player),opponent:enemy})
    const paid={player:0,enemy:0}
    const extras={player:{s2Above:0,s2Below:0,exhaustionFight:0},enemy:{s2Above:0,s2Below:0,exhaustionFight:0}}
    while(b.status==='playing') {
      assert(b.tick<1000,'Nonterminating fight')
      const d=tactics.decide(b.player,b.enemy,{context:{rounds:b.tick,
        ownSpecialDamage:Object.entries(b.statistics.player.damage).filter(([k])=>k.startsWith('special')).reduce((n,[,v])=>n+v,0),
        opponentSpecialDamage:Object.entries(b.statistics.enemy.damage).filter(([k])=>k.startsWith('special')).reduce((n,[,v])=>n+v,0)}})
      const action=d.slot==='special3'?{special3:true,choice:3}:d.slot||'basic'
      const next=combat.takeTurn(b,action,die(4),die(12),pct,()=>Math.floor(pct()),()=>Math.floor(pct()),pct,
        {rollRecovery:pct,rollFinisher:()=>35+Math.floor(random()*11),rollBlock:pct,rollResistance:pct})
      assert.notEqual(next,b)
      const events=next.history.slice(b.history.length)
      for(const side of ['player','enemy']) {
        const f=next[side], s=next.statistics[side], other=side==='player'?'enemy':'player'
        assert.equal(f.maxStress-s.stressSpent+s.stressRecovered-s.stressRemovedTaken,f.stress,'Stress ledger')
        assert.equal(s.initial+s.generated-s.spent,s.remaining,'Duality ledger')
        assert.equal(s.remaining,side==='player'?f.hope:f.fear)
        paid[side]+=events.filter(e=>e.kind==='sacrifice'&&e.actor===(side==='player'&&b.player.name===b.enemy.name?'Your '+f.name:f.name)).reduce((n,e)=>n+e.hp,0)
        assert.equal(f.maxHp+s.hpRestored-next.statistics[other].hpDamage-paid[side],f.hp,'HP ledger')
        assert(f.hp>=0&&f.hp<=f.maxHp&&f.stress>=0&&f.stress<=f.maxStress)
        assert.equal(s.criticals.special2,0);assert.equal(s.criticals.special3,0)
        row.ledgers++
        if(f.stress===0)extras[side].exhaustionFight=1
        if(f.kit==='classic-kylax') for(const event of events) {
          if(event.kind==='special'&&event.slot==='special2'&&event.actor===(side==='player'&&player===enemy?'Your Kylax':f.name))
            extras[side][event.percent===26?'s2Below':'s2Above']++
        }
      }
      b=next
    }
    row.wins+=Number(b.status==='victory'); row.rounds+=b.tick; row.pacing+=Number(b.tick>=10&&b.tick<=20)
    row.histogram[b.tick]=(row.histogram[b.tick]||0)+1
    for(const side of ['player','enemy']) {
      const s=b.statistics[side], f=b[side]
      for(const [key,value] of Object.entries(s.damage))row.damage[side][key]=(row.damage[side][key]||0)+value
      if(f.kit==='classic-kylax') {
        const values={...extras[side],wards:f.kylaxMetrics?.wards||0,bleedingRemoved:f.kylaxMetrics?.bleedingRemoved||0,
          criticalPrevented:f.kylaxMetrics?.criticalPrevented||0,wardPrevented:f.kylaxMetrics?.wardPrevented||0,
          s1:s.uses.special1,s2:s.uses.special2,s3:s.uses.special3,zeroStressRounds:s.zeroStressRounds,
          criticalPackets:f.kylaxMetrics?.packets.filter(p=>p.critical).length||0}
        for(const [key,value] of Object.entries(values))row.kylax[side][key]=(row.kylax[side][key]||0)+value
      }
    }
  }
  row.winPercent=row.wins/count*100; row.averageRounds=row.rounds/count;row.pacingPercent=row.pacing/count*100
  rows.push(row); console.log(JSON.stringify({player,enemy,winPercent:row.winPercent,averageRounds:row.averageRounds}))
  fs.writeFileSync(`${directory}/progress-${label}.json`,JSON.stringify(rows,null,2)+'\n')
}
assert.deepEqual(hashes(),frozen,'Model changed during simulation')
fs.writeFileSync(output,JSON.stringify({seed:271828,count,policy:'Shared cheapest-reliable survival-aware policy; native timing and resources; player choice3, enemy native35–45. No future RNG inspected.',hashes:frozen,rows},null,2)+'\n')
