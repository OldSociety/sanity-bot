// Design audit only. No DB, environment files, Discord or runtime mutations.
const fs = require('node:fs'), assert = require('node:assert/strict')
const live = require('../config/spooky-2026.json')
const additions = [
 ['candy_raid',3], ['bag_swap',2], ['bag_explosion',2], ['sticky_fingers',3],
 ['reverse_robbery',2], ['candy_ransom',2], ['boo',2], ['haunted_mirror',1],
 ['copycat_curse',1], ['marked_for_mischief',1], ['candy_shakedown',2], ['trick_chain',1],
].map(([id,percent])=>({id,percent}))
const final = live.trickOutcomes.map(row=>({...row,percent:row.id==='caught_stealing'?14:row.percent})).concat(additions)
const candyPhase = final.filter(row=>!['haunted_mirror','copycat_curse','marked_for_mischief'].includes(row.id)).map(row=>({...row,percent:row.id==='caught_stealing'?17:row.percent}))
const spells = [new Set(['reverse_nickname']),new Set(['curse_target','curse_backfire']),new Set(['haunted_mirror']),new Set(['copycat_curse']),new Set(['marked_for_mischief'])]
const safeCandy = new Set(['steal_candy','great_heist','candy_raid','bag_explosion','sticky_fingers','candy_ransom','boo','candy_shakedown','trick_chain'])
function buffered(previous) {
 const group=spells.find(group=>group.has(previous)), rows=final.map(row=>({...row}))
 if(!group) return rows
 let freed=0
 for(const row of rows) if(group.has(row.id)) {freed+=row.percent*.75;row.percent*=.25}
 const pool=rows.filter(row=>safeCandy.has(row.id)).reduce((sum,row)=>sum+row.percent,0)
 for(const row of rows) if(safeCandy.has(row.id)) row.percent+=freed*row.percent/pool
 return rows
}
for(const rows of [final,candyPhase,...final.map(row=>buffered(row.id))]) {
 assert.ok(Math.abs(rows.reduce((sum,row)=>sum+row.percent,0)-100)<1e-10)
 for(const row of rows) assert.ok(row.percent>0)
 for(const id of ['steal_or_find_eye','steal_crown','caught_stealing']) assert.equal(rows.find(row=>row.id===id).percent,final.find(row=>row.id===id).percent+(rows===candyPhase&&id==='caught_stealing'?3:0))
}
function net(id,a,t) { // a = candy BEFORE one action cost; t = refilled target balance.
 const post=a-1, room=80-post, take=n=>Math.min(n,t,room)
 switch(id) {
 case 'steal_candy':return take(1)
 case 'great_heist':return Math.min(3,room) // three funded distinct victims
 case 'candy_raid':return take(Math.max(1,Math.min(8,Math.floor(t*.25))))
 case 'bag_swap':return Math.abs(post-t)<=10?t-post:post<t?Math.min(5,t,room):-Math.min(5,post,80-t)
 case 'sticky_fingers':{const first=take(3);return first+.5*Math.min(1,t,room-first)}
 case 'reverse_robbery':return -Math.min(3,post,80-t)
 case 'candy_ransom':return t>=5&&room>=3?3:take(1) // named fallback when no eligible full ransom
 case 'boo':return take(1)
 case 'candy_shakedown':return take(Math.max(2,Math.min(6,Math.floor(t/10))))
 case 'trick_chain':{const first=take(2),second=Math.min(1,t,room-first),third=Math.min(1,t,room-first-second);return first+.4*second+.08*third}
 default:return 0
 }
}
const snapshot = t=>({actorBefore:40,targetBefore:t,expectedActorCandyChangePerTrick:final.reduce((sum,row)=>sum+row.percent/100*net(row.id,40,t),-1),assumptions:'Ordinary unbuffered roll; all target types available; funded distinct bystanders; no shields, curse overrides, Crown currency, or deferred effects. Static snapshot, not population forecast.'})
const batch=(rows,count=25)=>({expectedDistinctOutcomes:rows.reduce((sum,row)=>sum+1-Math.pow(1-row.percent/100,count),0),expectedCaught:count*rows.find(row=>row.id==='caught_stealing').percent/100,expectedNewEvents:count*rows.filter(row=>additions.some(add=>add.id===row.id)).reduce((sum,row)=>sum+row.percent,0)/100,chanceAtLeastOneNewEvent:1-Math.pow(1-rows.filter(row=>additions.some(add=>add.id===row.id)).reduce((sum,row)=>sum+row.percent,0)/100,count),expectedAdjacentCaughtPairs:24*Math.pow(rows.find(row=>row.id==='caught_stealing').percent/100,2),assumptions:'Unbuffered ordinary independent table draws; no Crown substitution, curse replacement, eligibility fallback or deferred spell triggers.'})
const report={designOnly:true,liveVersion:live.version,final,candyPhase,afterReversal:buffered('reverse_nickname'),afterCurse:buffered('curse_target'),treatUnchanged:live.treatOutcomes,batch:{live:batch(live.trickOutcomes),candyPhase:batch(candyPhase),final:batch(final)},staticCandySnapshots:[10,40,80].map(snapshot),checks:'All proposed tables/each spell buffer sum100, positive weights, Eye/Crown/failure weights unchanged by buffer.'}
fs.writeFileSync('docs/spooky-variety-design-results.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({checks:report.checks,batch:report.batch,staticCandySnapshots:report.staticCandySnapshots},null,2))


