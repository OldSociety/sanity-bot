const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'../..'),directory=path.join(root,'artifacts/arena-spooky-marq-audit-2026-10-20')
const result=JSON.parse(fs.readFileSync(path.join(directory,'results.json'),'utf8'))
const replay=JSON.parse(fs.readFileSync(path.join(directory,'replay.json'),'utf8'))
const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'))
assert.equal(result.rows.length,28);assert.equal(result.fights,28000);assert(result.inputsUnchanged&&replay.exact)
const marq='spooky-2026:mrq',rows=result.rows
const base=rows.filter(r=>r.policy==='native'&&r.choice===3),max=rows.filter(r=>r.policy==='native'&&r.choice===5)
const sum=(rs,k)=>rs.reduce((n,r)=>n+r[k],0),fmt=n=>n.toFixed(1)
const short=s=>s.replace(' [Classic]','').replace('Marq [Hell-fed]','Hell-fed Marq').replace('Marq [Spooky]','Spooky Marq').replace(' [Spooky]','')
const opponents=base.filter(r=>r.player===marq&&r.enemy!==marq).map(r=>({id:r.enemy,label:r.enemyLabel}))
function metrics(rs,side) {
  const fights=sum(rs,'count'),m={}
  for(const r of rs)for(const[k,v]of Object.entries(r[side+'Metrics']))m[k]=(m[k]||0)+v
  return {...m,fights,winPercent:m.wins/fights*100,brinkPercent:m.brinkFights/fights*100,winsAfterBrinkPercent:m.winsAfterBrink/fights*100,
    winsWithoutBrinkPercent:m.winsWithoutBrink/fights*100,brinkShareOfWins:m.winsAfterBrink/m.wins*100,
    damageShares:Object.fromEntries(['basic','special1','special2','special3'].map(k=>[k,m[k]/(m.basic+m.special1+m.special2+m.special3)*100]))}
}
const player=metrics(base.filter(r=>r.player===marq&&r.enemy!==marq),'player')
const enemy=metrics(base.filter(r=>r.enemy===marq&&r.player!==marq),'enemy')
const playerMax=metrics(max.filter(r=>r.player===marq&&r.enemy!==marq),'player')
const enemyMax=metrics(max.filter(r=>r.enemy===marq&&r.player!==marq),'enemy')
const mirror=base.find(r=>r.player===marq&&r.enemy===marq)
const matrix=opponents.map(c=>{
  const p=base.find(r=>r.player===marq&&r.enemy===c.id),e=base.find(r=>r.enemy===marq&&r.player===c.id)
  const pm=max.find(r=>r.player===marq&&r.enemy===c.id),em=max.find(r=>r.enemy===marq&&r.player===c.id)
  return {opponent:short(c.label),marqPlayer:p.winPercent,marqAi:100-e.winPercent,playerCi:p.ci95,aiCi:[100-e.ci95[1],100-e.ci95[0]],
    marqPlayerMax:pm.winPercent,marqAiVsPlayerMax:100-em.winPercent,roundsPlayer:p.averageRounds,roundsAi:e.averageRounds}
})
function quantile(hist,p) {
  const items=Object.entries(hist).map(([k,n])=>[Number(k),n]).sort((a,b)=>a[0]-b[0]),total=items.reduce((n,[,c])=>n+c,0)
  let count=0
  for(const[v,n]of items){count+=n;if(count>=total*p)return v}
}
const comboRows=base.filter(r=>r.player!==r.enemy),hist={},damage={}
for(const r of comboRows){for(const[k,v]of Object.entries(r.comboTotals))hist[k]=(hist[k]||0)+v;for(const[k,v]of Object.entries(r.comboDamage))damage[k]=(damage[k]||0)+v}
const comboCount=Object.values(hist).reduce((n,v)=>n+v,0)
const combo={uses:comboCount,meanTotal:Object.entries(hist).reduce((n,[k,v])=>n+Number(k)*v,0)/comboCount,
  medianTotal:quantile(hist,.5),p95Total:quantile(hist,.95),maxTotal:Math.max(...Object.keys(hist).map(Number)),
  medianDamage:quantile(damage,.5),p95Damage:quantile(damage,.95),maxDamage:Math.max(...Object.keys(damage).map(Number))}
const support=rows.filter(r=>r.policy==='selective-support').map(r=>({player:short(r.playerLabel),playerWin:r.winPercent,marqAiWin:100-r.winPercent,
  nativeMaxPlayerWin:max.find(m=>m.player===r.player&&m.enemy===marq).winPercent}))
const summary={fights:result.fights,ledgers:result.ledgers,seed:314159,player,enemy,playerMax,enemyMax,mirrorPlayerWin:mirror.winPercent,
  mirrorRounds:mirror.averageRounds,matrix,combo,support,replay}
fs.writeFileSync(path.join(directory,'summary.json'),JSON.stringify(summary,null,2)+'\n')
const csv=[['policy','finisherChoice','player','AI','fights','playerWinPercent','ci95Low','ci95High','averageRounds','ledgerSets']]
for(const r of rows)csv.push([r.policy,r.choice,r.playerLabel,r.enemyLabel,r.count,r.winPercent,...r.ci95,r.averageRounds,r.ledgers])
fs.writeFileSync(path.join(directory,'results.csv'),csv.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n')+'\n')
let md=`# Spooky Marq focused study — October 20, 2026\n\n**Spooky Marq remains strong under fresh seeds and stronger player assumptions.** This task made no balance, AI, character, production, registry, database or process changes. The development build remains 230 HP / 190 Attack, one-time 25% Brink (58 HP), Overwhelm 8% Attack (15 unblocked base damage), Combo Strike total-d4 +8% Attack, native 1-Stress / 2-Duality / 5-Duality costs.\n\n## Results\n\nFresh seed314159, Level1, native AI and full mechanics. Baseline and max-Finisher studies each cover 13 ordered matches ×1,000 fights: six opponents in each role and a mirror. Two additional 1,000-fight support-player tests give **28,000 completed fights**. The first two columns use midpoint player Finishers. In the last two, every player uses the highest-damage Finisher button, including Marq when he is the player. AI coefficients/ranges are unchanged. Rates are **Marq wins**, so a higher AI column means a tougher opponent for a human.\n\n| Opponent | Marq as player | Marq as AI | Marq player, max Finisher | Marq AI vs max-Finisher player |\n|---|---:|---:|---:|---:|\n`
for(const r of matrix)md+=`| ${r.opponent} | ${fmt(r.marqPlayer)}% | ${fmt(r.marqAi)}% | ${fmt(r.marqPlayerMax)}% | ${fmt(r.marqAiVsPlayerMax)}% |\n`
md+=`\nAcross the six non-mirror opponents: **${fmt(player.winPercent)}% as player**, **${fmt(enemy.winPercent)}% as AI**. Maximum player Finishers change those to **${fmt(playerMax.winPercent)}%** and **${fmt(enemyMax.winPercent)}%** respectively. Mirrors: **${fmt(mirror.winPercent)}% player wins**, **${fmt(mirror.averageRounds)} rounds**. Near-50% cells have roughly ±3.1 percentage points of 95% sampling uncertainty; individual Wilson intervals are stored in the raw data. Aggregates do not establish independent-trial confidence because seed indices repeat across opponents.\n\nThe nearly even mirror means equal kits are reasonably matched under this policy, while the non-mirror rates show a substantial advantage over most other kits. It does not prove the player/AI roles are universally symmetric.\n\n## Stronger support-player checks\n\nSelene uses the previous follow-up's Finisher-first strategy, healing at <=60% HP only with full-heal room and estimated survival gain, normally preserving two Stress. Walls are reserved for an enemy with a currently affordable Finisher while Selene has two/three Hope. Azulis follows the same healing checks and saves four Hope toward a Finisher unless estimated survival is short. Both retain native knockout checks and select maximum-damage Finishers. These are better-resource-management examples, not optimized strategies.\n\n| Player fighting Marq AI | Native player, max Finisher | Selective-support player, max Finisher | Marq AI win vs selective support |\n|---|---:|---:|---:|\n`
for(const r of support)md+=`| ${r.player} | ${fmt(r.nativeMaxPlayerWin)}% | ${fmt(r.playerWin)}% | ${fmt(r.marqAiWin)}% |\n`
md+='\n## What his kit actually contributed\n\nThe following describe observed native-baseline fights against the six other fighters. They are not causal estimates of the win gain from an ability; no ability was disabled or coefficient changed. Damage percentages use resolved damage before target-HP capping and include overkill.\n\n| Observation | Marq player | Marq AI |\n|---|---:|---:|\n'
for(const[label,fn]of[
  ['Brink activated',m=>fmt(m.brinkPercent)+'% of fights'],
  ['Won after Brink activated',m=>fmt(m.winsAfterBrinkPercent)+'% of all fights'],
  ['Won without using Brink',m=>fmt(m.winsWithoutBrinkPercent)+'% of all fights'],
  ['Overwhelm uses per fight',m=>fmt(m.s1/m.fights)],
  ['Stress removed by Overwhelm per fight',m=>fmt((m.overwhelmStressRemoved||0)/m.fights)],
  ['Stress removed including criticals per fight',m=>fmt(m.stressRemoved/m.fights)],
  ['Combo Strike uses per fight',m=>fmt(m.s2/m.fights)],
  ['Finishers per fight',m=>fmt(m.s3/m.fights)],
  ['Basic damage share',m=>fmt(m.damageShares.basic)+'%'],
  ['Overwhelm damage share',m=>fmt(m.damageShares.special1)+'%'],
  ['Combo Strike damage share',m=>fmt(m.damageShares.special2)+'%'],
  ['Finisher damage share',m=>fmt(m.damageShares.special3)+'%'],
])md+=`| ${label} | ${fn(player)} | ${fn(enemy)} |\n`
md+=`\nBrink restores exactly **58 HP once**, with no repeated resurrection observed. This can extend the fight and create more attack/resource opportunities; wins after revival are **not** necessarily wins caused by revival. Overwhelm adds 15 unblocked direct damage before exhaustion/other defenses for one Stress and can strip two opposing Stress on its native 20% eligible on-hit check. Critical removal is tracked separately. This combines damage pressure with disruption of healing/defense budgets and possible exposure, but those mechanisms have not been causally separated.\n\nCombo Strike telemetry: **${combo.uses} casts** across non-mirror baseline matches; mean total-d4 **${fmt(combo.meanTotal)}**, median **${combo.medianTotal}**, 95th percentile **${combo.p95Total}**, maximum **${combo.maxTotal}**. Actual special damage median **${combo.medianDamage}**, 95th percentile **${combo.p95Damage}**, maximum **${combo.maxDamage}**, mixing both roles and actual defense/exhaustion states. Every sequence follows the existing continue-on-equal-or-higher rule, includes its stopping die, and uses exactly total+8 percent. Outliers alone do not explain ordinary matchup results.\n\n## Verification and limits\n\n- All **${result.ledgers.toLocaleString('en-US')} per-turn fighter HP/Stress/Duality ledger sets** reconcile. Source-attributed HP, sacrifice, Brink restoration, Rage/resource bounds, one-time Brink, noncritical S2/S3 and Combo sequence/coefficient checks pass.\n- The prior 36-input immutable model exactly matches the current workspace; 13 opening-trial workspace/snapshot controls match full final state, histories and statistics. Original combat inputs remain unchanged at completion.\n- **84 fresh-process sampled replay pairs** match full histories, statistics and state. Source and runner hashes are retained.\n- The existing Marq consistency file reports six passes and two failures: it still hardcodes the older 4% Overwhelm damage (7 HP) and pre-promotion production stats/10% Brink. Current build and runtime use 8% (15 HP) and the documented current snapshots. No source/config was changed to make stale assertions pass; the complete log is retained.\n- No optimality claim. These are prescribed public-state policies at Level1 with zero starting Hope/Fear. Larger/independent human strategy validation, other levels and starting resources may differ. Maximum-Finisher controls improve player execution but do not optimize every decision. Individual 95% intervals are not a multiple-comparison guarantee.\n- No automatic nerf, buff, model change, dependency installation or bot reload. The staged development snapshot is not a measurement of a separately running production build.\n\n## Conclusion\n\nThe high rates reproduce across fresh seeds and are not removed merely by choosing stronger Finishers or the tested support strategies. That makes Marq a credible priority for balance review, while the Selene follow-up remains a warning against inferring exact nerfs from one policy. His damage, Stress pressure and extra life operate together. These observational tests do not identify which single coefficient should change or how much; any proposed change needs a separately authorized, controlled offline comparison.\n\nEvidence: [results.csv](results.csv), [results.json](results.json), [summary.json](summary.json), [manifest.json](manifest.json), [replay.json](replay.json), [character-regressions.log](character-regressions.log). Runners are offline scripts under \`scripts/arena/\` and are never bot-imported.\n`
fs.writeFileSync(path.join(directory,'analysis.md'),md)
fs.writeFileSync(path.join(root,'docs/arena-spooky-marq-audit-2026-10-20.md'),md.replace(/\]\((results\.csv|results\.json|summary\.json|manifest\.json|replay\.json|character-regressions\.log)\)/g,'](../artifacts/arena-spooky-marq-audit-2026-10-20/$1)'))
console.log(JSON.stringify({matrix,overall:{player:player.winPercent,ai:enemy.winPercent,playerMax:playerMax.winPercent,aiVsPlayerMax:enemyMax.winPercent},support,combo,ledgers:result.ledgers},null,2))
