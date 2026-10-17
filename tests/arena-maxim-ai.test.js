const test = require('node:test'), assert = require('node:assert/strict')
const { newBattle: rawNewBattle, advance: engineAdvance } = require('../services/arena/combat')
const advance = (...args) => engineAdvance(...Array.from({length: 8}, (_, i) => args[i]), { aiPolicy: 'legacy' })
// Formula fixtures use a controlled, equal-stat baseline; character defaults have dedicated regression coverage.
function newBattle(hope = 0, options = {}) {
  const battle = rawNewBattle(hope, options), stat = 300 + 30 * ((options.level || 1) - 1)
  for (const fighter of [battle.marq, battle.warrior]) { Object.assign(fighter, { hp: stat, maxHp: stat, attack: stat }); if (fighter.passive === 'on-the-brink') fighter.passive = null }
  return battle
}
const { resolveCharacter, characterChoices, defaultCharacter } = require('../services/arena/characters')
const { selectEnemySpecial, canUse } = require('../services/arena/rules')
const seq = values => { let i = 0; return () => { assert.ok(i < values.length); return values[i++] } }
const maxim = resolveCharacter('Maxim [Spooky]')
const step = (battle, action = 'continue', { dice = [7, 5], ability = 99.999, accuracy = 0, critical = 99 } = {}) =>
  advance(battle, action, seq([2, 1]), seq(dice), () => ability, () => accuracy, () => critical, () => 99.999)

test('Maxim Deadly Focus starts ready, costs two Stress and retains independent recharge', () => {
 const seed=newBattle(3,{character:maxim});assert.equal(canUse(seed.marq,'special1'),true)
 const focus=step(seed,'special1',{dice:[2,1]});assert.equal(focus.special1Damage,30);assert.equal(focus.marq.stress,4);assert.equal(focus.marq.focusHits,0)
 const buff=step(focus,'special2');assert.equal(buff.marq.slayerCharges,3);assert.equal(buff.marq.focusHits,1)
 assert.equal(buff.special2Damage,0);assert.equal(buff.hopeSpent,3)
})

test('Slayer misses preserve charges; recasting refreshes without stacking',()=>{
 let battle=step(newBattle(6,{character:maxim}),'special2')
 battle=step(battle,'continue',{dice:[2,1]});assert.equal(battle.marq.slayerCharges,3)
 battle=step(battle);assert.equal(battle.marqDamage,30);assert.equal(battle.special2Damage,24);assert.equal(battle.marq.slayerCharges,2)
 battle=step(battle,'special2');assert.equal(battle.marqDamage,30);assert.equal(battle.marq.slayerCharges,3)
 for(let i=0;i<3;i++)battle=step(battle)
 assert.equal(battle.marq.slayerCharges,0);assert.equal(step(battle).marqDamage,6)
})

test('passive applies only to the underlying basic; saved criticals double the combined empowered basic',()=>{
 const seed=newBattle(0,{character:maxim});seed.marq.slayerCharges=3;seed.marq.opportunityReady=true;seed.marq.criticalReady=true
 const hit=step(seed,'special1');assert.equal(hit.marqDamage,72);assert.equal(hit.special1Damage,30)
 assert.equal(hit.statistics.player.damage.basic,24);assert.equal(hit.special2Damage,48)
})

test('AI selection uses one conditional draw with new Fear thresholds and exact reserve boundaries', () => {
  const fighter = { ...newBattle().warrior, basicHits: 3 }
  for (const [fear, special3, special2, special1] of [[0, 0, 0, 4000], [1, 0, 0, 4000], [2, 0, 0, 4000], [3, 0, 4000, 2400], [4, 0, 2000, 3200], [5, 9000, 100, 360]]) {
    const counts = { special1: 0, special2: 0, special3: 0 }
    for (let n = 0; n < 10000; n++) {
      let calls = 0; const result = selectEnemySpecial(fighter, fear, () => { calls++; return n / 100 })
      assert.equal(calls, 1); if (result) counts[result]++
    }
    assert.deepEqual(counts, { special1, special2, special3 })
  }
  for (const [stress, chance] of [0, 5, 15, 25, 30, 35, 40].entries()) {
    let count = 0
    for (let n = 0; n < 100; n++) count += Number(selectEnemySpecial({ ...fighter, stress }, 0, () => n) === 'special1')
    assert.equal(count, stress < 2 ? 0 : chance)
  }
  for (const value of [-1, 100, NaN]) assert.throws(() => selectEnemySpecial(fighter, 0, () => value), /percentile/)
})

test('AI Focus requires two Stress and a full recharge; Slayer has no landed-hit prerequisite',()=>{
 const fighter={...newBattle().warrior,focusHits:2,basicHits:0}
 assert.equal(selectEnemySpecial(fighter,3,()=>10),'special2')
 assert.equal(selectEnemySpecial(fighter,3,()=>45),null)
 assert.equal(selectEnemySpecial({...fighter,focusHits:3},0,()=>0),'special1')
 assert.equal(selectEnemySpecial({...fighter,focusHits:3,stress:1},2,()=>{throw Error('No available ability')}),null)
})

test('AI Special 1 uses standard player coefficients with basic damage separately recorded', () => {
  for (const [opponent, damage] of [['marq', 12], ['maxim', 36]]) {
    const result = step(newBattle(0, { opponent }), 'continue', { dice: [2, 1], ability: 0 })
    assert.equal(result.enemySpecial, 'special1'); assert.equal(result.statistics.enemy.damage.special1, damage)
    assert.equal(result.statistics.enemy.damage.basic, 9); assert.equal(result.maximDamage, damage + 9)
    assert.equal(result.warrior.stress, opponent === 'maxim' ? 4 : 5); assert.equal(result.fearSpent, 0)
  }
})

test('AI Combo costs three Fear and adds fifteen points; AI Slayer grants three future +11% hits even on a miss',()=>{
 for(const opponent of ['marq','maxim']){
 const seed=newBattle(0,{opponent});seed.warrior.fear=2
 const hit=step(seed,'continue',{dice:[6,7],ability:0})
 assert.equal(hit.enemySpecial,'special2');assert.equal(hit.fearSpent,3);assert.equal(hit.warrior.fear,0)
 assert.equal(hit.statistics.enemy.damage.special2,opponent==='marq'?54:0)
 if(opponent==='maxim')assert.equal(hit.warrior.slayerCharges,3)
 const miss=step(seed,'continue',{dice:[6,7],ability:0,accuracy:85})
 assert.equal(miss.maximDamage,0);assert.equal(miss.fearSpent,3);assert.equal(miss.statistics.enemy.hits.special2,0)
 if(opponent==='maxim')assert.equal(miss.warrior.slayerCharges,3)
 }
})

test('AI Finisher cannot crit while its basic can; zero-Stress vulnerability still applies', () => {
  const seed = newBattle(); seed.warrior.fear = 4; seed.marq.stress = 0
  const result = step(seed, 'continue', { dice: [6, 7], ability: 0, critical: 0 })
  assert.equal(result.enemySpecial, 'special3'); assert.equal(result.fearSpent, 5)
  assert.equal(result.statistics.enemy.damage.special3, 169); assert.equal(result.maximDamage, 190)
  assert.equal(result.statistics.enemy.firstFinisherAffordableRound, 1); assert.deepEqual(result.statistics.enemy.finisherRounds, [1])
  assert.equal(result.statistics.player.vulnerabilityDamageTaken, 38)
})

test('Hell-fed Arena label changes without changing saved IDs/art; old aliases and plain Marq remain usable', () => {
  const character = resolveCharacter('Marq [Hell-fed]')
  assert.equal(character.id, 'spooky-2026:hfm'); assert.equal(character.version, 'Hell-fed')
  assert.ok(character.image.endsWith('SPOOKY_HELLFED_BADGE.png'))
  assert.equal(resolveCharacter('Hellfed Marq [Spooky]'), character)
  assert.equal(resolveCharacter('Marq'), defaultCharacter)
  assert.deepEqual(characterChoices('hell'), [])
  assert.deepEqual(characterChoices('hellfed'), [])
  assert.equal(characterChoices('Marq').length, 1)
})
