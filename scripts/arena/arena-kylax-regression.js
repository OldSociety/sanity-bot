const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), crypto = require('node:crypto')
const directory = 'artifacts/arena-kylax-2026-10-20'
const baseline = process.argv.includes('--baseline')
if (baseline) {
  const original = Module._extensions['.js']
  Module._extensions['.js'] = (mod, filename) => {
    const relative = path.relative(path.resolve('services/arena'), filename)
    const saved = path.resolve(directory, 'before/services', relative)
    if (!relative.startsWith('..') && fs.existsSync(saved))
      return mod._compile(fs.readFileSync(saved, 'utf8'), filename)
    return original(mod, filename)
  }
}
const combat = require('../../services/arena/combat')
const { resolveCharacter, characters, isSelectable } = require('../../services/arena/characters')
const rules = require('../../services/arena/rules')
const names = ['Marq','Hellfed Marq','Maxim','Azulis','Hendrix','Spooky Selene']
const results=[]
for(let trial=0;trial<108;trial++) {
  let seed=271828+trial
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
  const pct=()=>random()*100, die=n=>()=>1+Math.floor(random()*n)
  let b=combat.newBattle(0,{character:resolveCharacter(names[trial%6]),opponent:names[Math.floor(trial/6)%6]})
  while(b.status==='playing') {
    if(b.tick>1000)throw Error('Nonterminating fight')
    const slot=['special3','special2','special1'].find(s=>rules.canUse(b.player,s))
    b=combat.takeTurn(b,slot==='special3'?{special3:true,choice:3}:slot||'basic',die(4),die(12),pct,
      ()=>Math.floor(pct()),()=>Math.floor(pct()),pct,{rollBlock:pct,rollResistance:pct,rollRecovery:pct,rollFinisher:()=>35+Math.floor(random()*11)})
  }
  results.push(crypto.createHash('sha256').update(JSON.stringify(b)).digest('hex'))
}
const { screen }=require('../../services/arena/interface')
const views=names.map(n=>screen({id:'regression',revision:0,character:resolveCharacter(n),level:1,page:'skins'}))
const result={environment:process.env.NODE_ENV,roster:characters.filter(isSelectable).map(c=>c.id).filter(id=>id!=='classic:kyl'),states:results,views}
fs.writeFileSync(`${directory}/regression-${process.env.NODE_ENV}-${baseline?'before':'after'}.json`,JSON.stringify(result,null,2)+'\n')
console.log(`${process.env.NODE_ENV} ${baseline?'before':'after'}: ${results.length} complete fights, ${views.length} skin views`)
