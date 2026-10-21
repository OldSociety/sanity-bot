const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
const directory = path.resolve(__dirname, '../../artifacts/arena-roster-2026-10-20')
const { roster } = JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'))
const { rows } = JSON.parse(fs.readFileSync(path.join(directory,'results.json'),'utf8'))
const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
const short = label => label.replace(' [Classic]', '').replace('Marq [Hell-fed]', 'Hell-fed Marq').replace('Marq [Spooky]', 'Spooky Marq').replace(' [Spooky]', '')
const parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="1320" height="1010" viewBox="0 0 1320 1010"><rect width="1320" height="1010" fill="#f7f8fa"/><g font-family="Segoe UI, Arial, sans-serif" fill="#172b3b">']
function text(x,y,value,size=18,extra='') { parts.push(`<text x="${x}" y="${y}" font-size="${size}" ${extra}>${escape(value)}</text>`) }
text(60,65,'Current Arena roster',34,'font-weight="700"')
text(60,105,'Player win rate by matchup · current development source · October 20, 2026',20,'fill="#485b6b"')
text(260,165,'AI OPPONENT',17,'fill="#485b6b" letter-spacing="2"')
text(60,245,'PLAYER',17,'fill="#485b6b" letter-spacing="2"')
for (let j=0;j<7;j++) {
  const name = short(roster[j].label)
  if(name.endsWith(' Marq')) {
    text(326+j*132,211,name.replace(' Marq',''),18,'text-anchor="middle"')
    text(326+j*132,234,'Marq',18,'text-anchor="middle"')
  } else text(326+j*132,225,name,18,'text-anchor="middle"')
}
for(let i=0;i<7;i++) {
  text(240,306+i*75,short(roster[i].label),19,'text-anchor="end"')
  for(let j=0;j<7;j++) {
    const r=rows.find(r=>r.policy==='native'&&r.player===roster[i].id&&r.enemy===roster[j].id)
    const color=r.winPercent<40?'#8fb0d0':r.winPercent>60?'#ecb397':'#b6dbc2'
    parts.push(`<rect x="${262+j*132}" y="${262+i*75}" width="128" height="71" rx="3" fill="${color}" ${i===j?'stroke="#34495e" stroke-width="2"':''}/>`)
    text(326+j*132,306+i*75,r.winPercent.toFixed(1)+'%',23,`text-anchor="middle" font-weight="${r.rangeStatus==='outside'?700:400}"`)
  }
}
const legend=[['#8fb0d0','AI favored: below 40%'],['#b6dbc2','Target: 40–60%'],['#ecb397','Player favored: above 60%']]
legend.forEach(([color,label],i)=>{
  parts.push(`<rect x="${115+i*370}" y="836" width="25" height="25" rx="3" fill="${color}"/>`)
  text(153+i*370,856,label,18)
})
text(60,912,'49,000 primary fights · 1,000 per cell · approximate 95% uncertainty ±3.1 pp near 50%',18,'fill="#485b6b"')
text(60,946,'Native AI; public-state simulated player policy; Level 1; player Finisher choice 3. Outlined cells are mirrors.',16,'fill="#485b6b"')
text(60,978,'Policy-conditional results. Includes staged AI/Kylax changes; no bot activation or balance edits.',16,'fill="#485b6b"')
parts.push('</g></svg>')
const svg=parts.join('\n')
fs.writeFileSync(path.join(directory,'matchup-matrix.svg'),svg)
sharp(Buffer.from(svg)).png().toFile(path.join(directory,'matchup-matrix.png')).catch(error=>{ console.error(error); process.exitCode=1 })
