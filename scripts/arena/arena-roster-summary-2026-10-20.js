const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname, '../..')
const directory = path.join(root, 'artifacts/arena-roster-2026-10-20')
const results = JSON.parse(fs.readFileSync(path.join(directory, 'results.json'), 'utf8'))
const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'))
const { roster } = manifest
const native = results.rows.filter(r => r.policy === 'native')
const alternate = results.rows.filter(r => r.policy === 'cheapest-reliable')
assert.equal(native.length, 49)
assert.equal(alternate.length, 49)
assert.equal(results.fights, 61250)
assert(results.allReplayExact && results.originalInputsUnchanged)
const mean = values => values.reduce((a,b) => a+b,0) / values.length
const short = label => label.replace(' [Classic]', '').replace('Marq [Hell-fed]', 'Hell-fed Marq').replace('Marq [Spooky]', 'Spooky Marq').replace(' [Spooky]', '')
const fmt = n => n.toFixed(1)
const find = (rows,p,e) => rows.find(r => r.player === p && r.enemy === e)
const total = (rows,k) => rows.reduce((n,r) => n + r[k],0)
const aggregate = (rows,side,key) => rows.reduce((n,r) => n+r[side+'Metrics'][key],0) / total(rows,'fights')
const summaries = roster.map(c => {
  const p = native.filter(r => r.player === c.id && r.enemy !== c.id)
  const e = native.filter(r => r.enemy === c.id && r.player !== c.id)
  return { id:c.id, name:short(c.label), playerWin:mean(p.map(r=>r.winPercent)), enemyWin:100-mean(e.map(r=>r.winPercent)),
    equalRoleWin:(mean(p.map(r=>r.winPercent))+100-mean(e.map(r=>r.winPercent)))/2,
    mirror:find(native,c.id,c.id).winPercent,
    enemyHealing:aggregate(e,'enemy','healing'), enemyS1:aggregate(e,'enemy','s1'), enemyS2:aggregate(e,'enemy','s2'), enemyS3:aggregate(e,'enemy','s3'), enemyExhaustion:aggregate(e,'enemy','zeroStressFight')*100 }
})
const sorted = [...native].sort((a,b) => Math.abs(b.winPercent-50)-Math.abs(a.winPercent-50))
const outside = native.filter(r=>r.rangeStatus==='outside')
const clearlyOutside = native.filter(r=>r.evidenceStatus==='clearly-outside')
const uncertain = native.filter(r=>r.evidenceStatus==='boundary-uncertain')
const sensitivity = native.map(r=>({ player:r.playerLabel, enemy:r.enemyLabel, native:r.winPercent, alternate:find(alternate,r.player,r.enemy).winPercent,
  change:find(alternate,r.player,r.enemy).winPercent-r.winPercent })).sort((a,b)=>Math.abs(b.change)-Math.abs(a.change))
const pairRows = []
for (let a=0;a<roster.length;a++) for (let b=a+1;b<roster.length;b++) {
  const x=roster[a],y=roster[b]
  const rate=(find(native,x.id,y.id).winPercent+100-find(native,y.id,x.id).winPercent)/2
  pairRows.push({ fighter:short(x.label), opponent:short(y.label), equalRoleWin:rate, inside:rate>=40&&rate<=60 })
}
const summary = { fights:results.fights, ledgers:results.ledgers, replayPairs:results.replayPairs,
  primary:{ fights:total(native,'fights'), playerWin:total(native,'wins')/total(native,'fights')*100, averageRounds:total(native,'rounds')/total(native,'fights'), pacingPercent:total(native,'pacing')/total(native,'fights')*100,
    inside:native.length-outside.length, outside:outside.length, clearlyOutside:clearlyOutside.length, boundaryUncertain:uncertain.length,
    nonMirrorInside:native.filter(r=>r.player!==r.enemy&&r.rangeStatus==='inside').length, mirrorsInside:native.filter(r=>r.player===r.enemy&&r.rangeStatus==='inside').length,
    equalRolePairsInside:pairRows.filter(r=>r.inside).length },
  characterSummaries:summaries, equalRolePairs:pairRows, sensitivity, sourceHashes:manifest.hashes }
fs.writeFileSync(path.join(directory,'summary.json'),JSON.stringify(summary,null,2)+'\n')
const csv = [['policy','player','opponent','fights','playerWins','playerWinPercent','aiWinPercent','ci95Low','ci95High','rangeStatus','evidenceStatus','averageRounds','percent10to20Rounds','fighterLedgerSets']]
for (const r of results.rows) csv.push([r.policy,r.playerLabel,r.enemyLabel,r.fights,r.wins,r.winPercent,100-r.winPercent,...r.ci95,r.rangeStatus,r.evidenceStatus,r.averageRounds,r.pacingPercent,r.ledgers])
fs.writeFileSync(path.join(directory,'results.csv'),csv.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n')+'\n')
const p=summary.primary
let md=`# Current development roster — October 20, 2026\n\nThe roster does **not** meet a 40–60% win target across all matchups under these simulated player policies. Primary study: **${p.inside}/49 ordered matches inside the target**, ${p.outside} outside; ${p.clearlyOutside} have a 95% interval wholly outside. ${p.nonMirrorInside}/42 non-mirror matches and ${p.mirrorsInside}/7 mirrors have point estimates inside. Averaging both roles for each character pair, ${p.equalRolePairsInside}/21 pairs are inside; that average can hide opposite role biases.\n\n**Source-only offline study. No balance values, character builds, bot processes, production deployment, database, registry, access or preferences were changed.** The tested source includes the staged October 20 AI support rules and Kylax. It is not a measurement of the currently running bot; the staged changes have not been activated by this task.\n\n## Matchup matrix\n\nPlayer win percentages: row is the player character; column is the AI. Each cell is 1,000 independent seeded trials at Level 1, zero starting Hope/Fear. AI win percentage is 100 minus the cell. Bold cells fall outside 40–60%. Sampling uncertainty is about ±3.1 percentage points near 50%; per-cell Wilson 95% intervals are in the CSV. These are individual intervals, not a simultaneous multiple-comparison guarantee.\n\n| Player / AI | ${roster.map(c=>short(c.label)).join(' | ')} |\n|---|${roster.map(()=> '---:').join('|')}|\n`
for (const c of roster) md+=`| ${short(c.label)} | ${roster.map(e=>{const r=find(native,c.id,e.id);return r.rangeStatus==='outside'?`**${fmt(r.winPercent)}%**`:`${fmt(r.winPercent)}%`}).join(' | ')} |\n`
md+=`\n## Overall character results\n\nEach character faces each of the other six equally often. Mirrors are excluded from the first three columns. Equal-role average gives player and AI roles equal weight; it is not a human-only win rate or an additional simulation.\n\n| Fighter | As player | As AI | Equal-role average | Mirror player win |\n|---|---:|---:|---:|---:|\n`
for(const c of summaries) md+=`| ${c.name} | ${fmt(c.playerWin)}% | ${fmt(c.enemyWin)}% | ${fmt(c.equalRoleWin)}% | ${fmt(c.mirror)}% |\n`
md+=`\nAll primary fights combined: player wins **${fmt(p.playerWin)}%**, mean **${fmt(p.averageRounds)} rounds**, **${fmt(p.pacingPercent)}%** finish in 10–20 rounds. This global average describes role advantage and must not substitute for individual character/matchup balance.\n\n## Largest matchup departures\n\n| Player | AI | Player win | 95% interval | Average rounds |\n|---|---|---:|---:|---:|\n`
for(const r of sorted.slice(0,12)) md+=`| ${short(r.playerLabel)} | ${short(r.enemyLabel)} | ${fmt(r.winPercent)}% | ${fmt(r.ci95[0])}–${fmt(r.ci95[1])}% | ${fmt(r.averageRounds)} |\n`
md+=`\n## AI resource behavior\n\nMeans across the six non-mirror matchups per AI character. Healing includes native restoration; only Azulis/Selene use healing S1. Exhaustion means at least one completed-turn observation at zero Stress; Hell-fed Marq uses Rage and has no Stress exposure. Ward prevention and wall metrics remain in the raw data.\n\n| AI fighter | S1 uses | S2 uses | Finishers | HP restored | Fights reaching zero Stress |\n|---|---:|---:|---:|---:|---:|\n`
for(const c of summaries) md+=`| ${c.name} | ${fmt(c.enemyS1)} | ${fmt(c.enemyS2)} | ${fmt(c.enemyS3)} | ${fmt(c.enemyHealing)} | ${c.name==='Hell-fed Marq'?'N/A':fmt(c.enemyExhaustion)+'%'} |\n`
md+=`\n## Player-policy sensitivity\n\nA second study uses 250 fights per ordered matchup, changing only the player selector to the historical cheapest-reliable survival-aware policy. It is applied to the player only; **the AI selector is never replaced or monkey-patched**. This matters because the old shared-policy harness hardcoded a 99.999 support percentile and would suppress the new probabilistic AI support. The alternate study has about ±6.2 percentage points of sampling uncertainty near 50%, so smaller differences are inconclusive. Actions change RNG consumption; cross-policy rates are not causal estimates from identical action-by-action rolls.\n\n| Player | AI | Native player | Alternate player | Difference |\n|---|---|---:|---:|---:|\n`
for(const r of sensitivity.slice(0,10)) md+=`| ${short(r.player)} | ${short(r.enemy)} | ${fmt(r.native)}% | ${fmt(r.alternate)}% | ${r.change>=0?'+':''}${fmt(r.change)} pp |\n`
md+=`\n## Method and verification\n\n- Primary 49 × 1,000 = 49,000 fights; sensitivity 49 × 250 = 12,250; **61,250 completed fights total**. Seven currently selectable fighters; hidden Template is excluded.\n- Native current development mechanics, actual costs, floor/minimum rounding, critical income, new-Fear spending delay, resistance, defensive activation, recovery, Bleeding, alignment and Brink. All coefficients are unchanged.\n- Player primary decisions use the native public-state tactical selector and observed special damage context; the AI uses the actual native tactical implementation with random support rolls. No future RNG or pending player action is given to the policy. All players choose midpoint Finisher button 3; the enemy uses its current native fixed coefficient/range. Thus results are policy-conditional, not optimal-human estimates.\n- Seed 271828 with deterministic per-trial substreams; the same trial index is reused across matchups for reproducibility. No RNG searches or result selection.\n- Immutable copied combat dependency snapshot. ${Object.keys(manifest.hashes).length} input hashes checked; original source matches after completion. A preflight of all 49 matchups exactly matches the original workspace against the relocated snapshot. Presentation/diagnostics work can continue independently; unrelated files are not model inputs.\n- **${results.ledgers.toLocaleString('en-US')} per-turn fighter ledger sets** reconcile HP including sacrifice/Brink, Stress including critical recovery/removal, and Hope/Fear including spending/income. Source-attributed HP, resource bounds, Rage bounds and noncritical S2/S3 are also checked.\n- **${results.replayPairs} fresh-process fight replay pairs** exactly match complete final state, histories and statistics at first/middle/last trial in every cohort.\n- The 23 focused AI-support regressions pass in this task. Historical broader-suite failures from the prior audit were not treated as new simulation failures.\n- Wilson intervals quantify random sampling within this model; they do not quantify uncertainty from player behavior, level, Finisher choice, initial resources, future policy changes, or repeated testing. Boundary-crossing intervals do not certify either side of the 40/60 cutoff.\n\n## Interpretation\n\nYour live experience can feel balanced while this source snapshot shows large simulated kit/role differences. Use the matrix to select human playtests, especially the most extreme matchups and player/AI reversals. No automatic nerfs, buffs, source fixes or activation were made from these results. Human testing with varied Finisher choices and strategies is the next evidence needed before any balance proposal.\n\nFiles: [full CSV](results.csv), [raw results](results.json), [summary](summary.json), [input manifest](manifest.json), frozen model under \`model/\`, per-worker/replay logs. Runners: \`scripts/arena/arena-roster-audit-2026-10-20.js\` and \`scripts/arena/arena-roster-summary-2026-10-20.js\`. Completed reports are not overwritten by the main runner.\n`
fs.writeFileSync(path.join(directory,'analysis.md'),md)
fs.mkdirSync(path.join(root,'docs'),{recursive:true})
fs.writeFileSync(path.join(root,'docs/arena-roster-2026-10-20.md'),md.replaceAll('](results','](../artifacts/arena-roster-2026-10-20/results').replaceAll('](summary.json)','](../artifacts/arena-roster-2026-10-20/summary.json)').replaceAll('](manifest.json)','](../artifacts/arena-roster-2026-10-20/manifest.json)'))
console.log(JSON.stringify(summary.primary,null,2))
console.log(JSON.stringify(summaries,null,2))
