const test = require('node:test'),
  assert = require('node:assert/strict'),
  { execFileSync } = require('node:child_process')
const base = require('../config/arena-balance.json'),
  { loadBalance } = require('../services/arena/balance-config')
test('2/5 development profile preserves every unspecified coefficient', () => {
  for (const env of ['test', undefined])
    assert.deepEqual(loadBalance(env === 'development' ? 'test' : env), base)
  const candidate = loadBalance('development'),
    expected = structuredClone(base)
  expected.profile = 'development-2-5'
  expected.attackOutcomes = 'block-immediate-critical'
  expected.manualOpponentSelection = true
  expected.offensiveSpecialBasics = true
  expected.damageRounding = 'floor'
  expected.damageRules = structuredClone(
    require('../services/arena/damage-types').proposedRules
  )
  const hendrix = require('../config/arena-hendrix-development.json')
  expected.baseStats[hendrix.identity.kit] = { hp: 200, attack: 200 }
  expected.characters[hendrix.identity.kit] = structuredClone(hendrix.abilities)
  expected.ai.characters[hendrix.identity.kit] = structuredClone(
    hendrix.abilities
  )
  expected.ai.characters[hendrix.identity.kit].special3.type = 'aiFinisher'
  const templates = require('../config/arena-templates-development.json')
  for (const { kit } of templates.characters) {
    expected.baseStats[kit] = structuredClone(templates.baseStats)
    expected.characters[kit] = structuredClone(templates.abilities)
    expected.ai.characters[kit] = structuredClone(templates.abilities)
    expected.ai.characters[kit].special3.type = 'aiFinisher'
  }
  for (const costs of [expected.costs, expected.ai.costs]) {
    costs.special2.hope = 2
    costs.special3.hope = 5
  }
  expected.characters['spooky-marq'].special2.flatPercent = 8
  expected.characters.maxim.special2.percent = 7
  expected.ai.characters['spooky-marq'].special2.flatPercent = 8
  expected.ai.characters.maxim.special1.percent = 10
  expected.ai.characters.maxim.special2.percent = 7
  expected.ai.special2ChanceByFear = [0, 0, 40, 20, 10, 5, 5]
  const hellfed = require('../config/arena-hellfed-development.json')
  expected.criticalEffects = hellfed.criticalEffects
  Object.assign(expected.baseStats, hellfed.baseStats)
  Object.assign(expected.passives, hellfed.passives)
  Object.assign(expected.characters, hellfed.characters)
  const azulis = require('../config/arena-azulis-development.json')
  Object.assign(expected.baseStats, azulis.baseStats)
  Object.assign(expected.characters, azulis.characters)
  expected.ai.characters['classic-azulis'] = structuredClone(
    azulis.characters['classic-azulis']
  )
  expected.ai.characters['hellfed-marq'] = structuredClone(
    expected.characters['hellfed-marq']
  )
  expected.ai.characters['hellfed-marq'].special3.type = 'aiFinisher'
  assert.deepEqual(candidate, expected)
  candidate.costs.special2.hope = 99
  assert.equal(loadBalance('development').costs.special2.hope, 2)
  assert.equal(base.costs.special2.hope, 3)
})
test('development combat, controls and AI use the candidate costs and player-only S2 reductions', () => {
  execFileSync(
    process.execPath,
    [
      '-e',
      String.raw`
 const loader=require('./services/arena/balance-config'),legacyLoad=loader.loadBalance;loader.loadBalance=(...args)=>{const value=legacyLoad(...args);delete value.attackOutcomes;return value}
 const assert=require('node:assert/strict'),{newBattle,advance,beginFinisher}=require('./services/arena/combat'),{kitFor,canUse,selectEnemySpecial}=require('./services/arena/rules'),{resolveCharacter}=require('./services/arena/characters'),{screen}=require('./services/arena/interface'),{decide}=require('./services/arena/tactics')
 for(const character of ['Marq','Maxim']){
  const b=newBattle(2,{character:resolveCharacter(character),opponent:character.toLowerCase()});const kit=kitFor(b.player)
  assert.equal(kit.special2.hopeCost,2);assert.equal(kit.special3.hopeCost,5)
  assert.equal(canUse({...b.player,hope:1},'special2'),false);assert.equal(canUse(b.player,'special2'),true)
  assert.equal(canUse({...b.player,hope:4},'special3'),false)
  const labels=screen({id:'cost',revision:0,battle:b}).components.flatMap(r=>r.components).map(b=>b.data.label)
  assert.ok(labels.some(l=>l.endsWith('[2 Hope]')));assert.ok(labels.some(l=>l.endsWith('[5 Hope]')))
  let i=0;const next=advance(b,{special2:true},()=>[2,1][i++],undefined,undefined,undefined,undefined,undefined,{actor:'ability'})
  assert.equal(next.hopeSpent,2);assert.equal(next.player.hope,0)
  if(character==='Marq')assert.equal(next.special2Damage,22)
  else {
   assert.equal(next.player.slayerCharges,3);assert.equal(kit.special2.percent,7)
   let d=0;const landed=advance(next,{},undefined,()=>[7,5][d++],undefined,undefined,undefined,undefined,{actor:'player'})
   assert.equal(landed.playerBasicDamage,22);assert.equal(landed.player.slayerCharges,2)
  }
  const finisher=beginFinisher({...b,player:{...b.player,hope:5}})
  assert.equal(finisher.player.hope,0);assert.equal(finisher.statistics.player.spent,5)
  for(let choice=0;choice<=5;choice++){
   const hit=advance(finisher,{special3:true,choice},undefined,undefined,undefined,undefined,undefined,undefined,{actor:'ability'})
   assert.equal(hit.special3Damage,Math.ceil(b.player.attack*(30+5*choice)/100));assert.equal(hit.hopeSpent,0)
  }
  const enemy={...b.enemy,fear:2,hope:2}
  assert.equal(selectEnemySpecial(enemy,2,()=>0),'special2');assert.equal(selectEnemySpecial(enemy,5,()=>0),'special3')
  const saved=decide({...enemy,fear:2,stress:6,hp:2000,maxHp:2000,slayerCharges:character==='Maxim'?2:0},{...b.player,hp:2000,maxHp:2000,brinkUsed:true},{roll:()=>99.999})
  assert.equal(saved.savedForFinisher,true)
  assert.notEqual(decide({...enemy,fear:4},{...b.player,brinkUsed:true},{roll:()=>0}).slot,'special3')
  const result=advance({...b,enemy:{...b.enemy,fear:5}}, {},()=>1,undefined,()=>0,()=>99,()=>99,undefined,{actor:'enemy',rollRecovery:()=>99,rollFinisher:()=>40})
  assert.equal(result.enemySpecial,'special3');assert.equal(result.fearSpent,5);assert.equal(result.enemy.fear,0)
 }
 `,
    ],
    {
      cwd: require('node:path').resolve(__dirname, '..'),
      env: { ...process.env, NODE_ENV: 'development' },
      stdio: 'pipe',
    }
  )
})
test('hybrid simulation policy stays reproducible and reports whether both abilities were experienced', () => {
  const { simulate } = require('../scripts/arena-balance-report')
  const opts = { trials: 5, seed: 42, strategy: 'early-s2-then-finisher' }
  const rows = simulate(opts)
  assert.deepEqual(rows, simulate(opts))
  for (const row of rows) {
    assert.equal(row.balanceProfile, 'production-3-6')
    assert.ok(
      row.player.bothSpecialsFightPercent >= 0 &&
        row.player.bothSpecialsFightPercent <= 100
    )
    assert.ok(row.player.uses.special2 <= 1)
  }
})
