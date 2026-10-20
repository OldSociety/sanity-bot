const test = require('node:test')
const assert = require('node:assert/strict')
process.env.NODE_ENV = 'development'
const { resolveCharacter, isSelectable } = require('../services/arena/characters')
const combat = require('../services/arena/combat')
const rules = require('../services/arena/rules')
const k = require('../services/arena/kylax')
const { specialDamage } = require('../services/arena/damage')
const hendrix = require('../services/arena/hendrix')
const battle = (opponent = 'Maxim') => combat.newBattle(6, { character: resolveCharacter('Kylax'), opponent })
function step(b, action, { actor = 'exchange', critical = false, block = false, enemyCritical = false, resistance = 99 } = {}) {
  let die = 0
  return combat.advance(b, action, () => 2, () => critical ? 6 : block ? (++die % 2 ? 1 : 2) : (++die % 2 ? 8 : 7),
    () => 99, () => 0, () => enemyCritical ? 0 : 99, () => 99,
    { actor, aiPolicy: 'legacy', rollResistance: () => resistance, rollBlock: () => 99, rollRecovery: () => 99, rollFinisher: () => 40 })
}
test('Classic development registration, Bronze frame, proposed stats, both role costs', () => {
  const c = resolveCharacter('Kylax'), b = battle('Kylax')
  assert(isSelectable(c)); assert.equal(c.id, 'classic:kyl'); assert.equal(c.rarity, 'bronze')
  for (const f of [b.player, b.enemy]) {
    assert.equal(f.hp, 220); assert.equal(f.attack, 200); assert.equal(f.stress, 6)
    assert.equal(rules.kitFor(f).special1.stressCost, 1)
    assert.equal(rules.kitFor(f).special2.hopeCost, 2)
    assert.equal(rules.kitFor(f).special3.hopeCost, 5)
    assert(rules.abilityAvailable(f, 'passive'))
  }
})
test('critical resistance uses current floor rounding, excludes ordinary damage and Bleeding', () => {
  const f = battle().player
  for (const [raw, expected] of [[10,9],[20,18],[30,27],[44,39],[60,54],[6,5]]) {
    const p = k.packet(raw, f, { critical:true })
    assert.equal(p.damage, expected); assert.equal(p.criticalPrevented, raw-expected)
    assert.equal(k.mitigate(raw,f),raw)
    assert.equal(k.mitigate(raw,f,{critical:true,bleeding:true}),raw)
  }
})
test('Graveward activates before damage, costs one Stress, keeps basic and critical resources', () => {
  const b = battle(); b.player.stress=3
  const next=step(b,'special1',{critical:true,enemyCritical:true})
  assert(next.playerBasicDamage>0)
  assert.equal(next.player.stress,2) // cost1, own critical+1, opposing critical-1
  assert.equal(next.enemy.fear,1)
  assert.equal(next.player.kylaxMetrics.wards,1)
  assert(next.player.kylaxMetrics.criticalPrevented>0)
  assert(next.player.kylaxMetrics.wardPrevented>0)
  assert.equal(next.player.gravewardRound,undefined)
  assert.equal(b.player.gravewardRound,undefined)
})
test('Graveward clears all Bleeding before Hendrix strikes and permits reapplication', () => {
  const b=battle('Hendrix'); b.player.bleeding={remaining:4}
  const protectedBattle=step(b,'special1')
  assert.equal(protectedBattle.player.bleeding,undefined)
  assert.equal(protectedBattle.player.kylaxMetrics.bleedingRemoved,1)
  const enemyHit=protectedBattle.history.find(e=>e.actor==='Hendrix'&&e.kind==='hit')
  assert(enemyHit.strikes.every(s=>s.bleed===0))
  const reapplied=hendrix.sequence(b.enemy,protectedBattle.player,'special1',false,6,
    {duality:()=>7,accuracy:()=>0,critical:()=>99,block:()=>99,round:2,mainOutcome:'hit'})
  assert(reapplied.strikes.every(s=>s.bleed>0))
})
test('independent Hendrix critical packets retain Bleeding damage and resource draws', () => {
  const b=battle('Hendrix'); k.activate(b.player,1)
  const hit=hendrix.strike(b.enemy,'critical',true,1,b.player,1)
  assert.equal(hit.direct,2) // floor(4*0.9)=3; floor(3*0.75)=2
  assert.equal(hit.bleed,4)
  assert.equal(hit.defense.criticalPrevented,1)
  assert.equal(hit.defense.wardPrevented,1)
  assert.equal(hit.damage,6)
})
test('Graveward combines with Block and exhaustion; defense expires at response boundary', () => {
  const b=battle(); b.player.stress=1
  const first=step(b,'special1',{actor:'ability'})
  assert.equal(first.player.stress,0); assert(k.wardActive(first.player,1))
  const response=step({...first,tick:0},{},{actor:'enemy'})
  assert.equal(response.player.gravewardRound,undefined)
  assert(response.player.kylaxMetrics.wardPrevented>0)
  assert.equal(k.mitigate(20,response.player,{round:2}),20)
  k.activate(response.player,2)
  assert.equal(k.mitigate(require('../services/arena/outcomes').blockDamage(40),response.player,{round:2}),15)
})
test('Toll the Dead exact threshold and coefficients follow defender HP at resolution', () => {
  const b=battle()
  for(const maxHp of [180,220,230,260]) {
    assert.equal(specialDamage(b.player,'special2',{target:{hp:maxHp/2+1,maxHp}}).damage,36)
    assert.equal(specialDamage(b.player,'special2',{target:{hp:maxHp/2,maxHp}}).damage,52)
  }
  b.enemy.hp=b.enemy.maxHp/2+4
  const n=step(b,'special2',{actor:'ability'})
  assert.equal(n.special2Damage,52) // ordinary basic crosses half before special
  assert.equal(n.history.find(e=>e.kind==='special').percent,26)
  assert.equal(n.hopeSpent,2)
})
test('Toll Block mitigation and independent basic critical, special stays noncritical', () => {
  const b=battle(); b.enemy.hp=100
  const blocked=step(b,'special2',{actor:'ability',block:true})
  assert.equal(blocked.special2Damage,26)
  const critical=step(b,'special2',{actor:'ability',critical:true})
  assert.equal(critical.special2Damage,52)
  assert.equal(critical.statistics.player.criticals.special2,0)
  assert(critical.playerBasicDamage>blocked.playerBasicDamage)
})
test('Final Passage costs five, standard timeout/range, noncritical and resistance retained', () => {
  const b=battle('Kylax')
  for(const [choice,damage] of [[0,60],[1,70],[2,80],[3,90],[4,100],[5,110]]) {
    const n=step(b,{special3:true,choice},{actor:'ability'})
    assert.equal(n.special3Damage,damage); assert.equal(n.hopeSpent,5)
    assert.equal(n.statistics.player.criticals.special3,0)
  }
  const resisted=step(b,{special3:true,choice:3},{actor:'ability',resistance:0})
  assert.equal(resisted.special3Damage,45)
  k.activate(b.enemy,1)
  const ward=step(b,{special3:true,choice:3},{actor:'ability',resistance:0})
  assert.equal(ward.special3Damage,33)
})
test('passive persists across rounds and knockout ordering remains normal', () => {
  let b=battle(); b=step(b,{},{enemyCritical:true}); b=step(b,{},{enemyCritical:true})
  assert.equal(b.player.passive,'graves-protection'); assert(b.player.kylaxMetrics.criticalPrevented>=2)
  const lethal=battle(); lethal.enemy.hp=1
  const n=combat.takeTurn(lethal,'special2',()=>2,()=>7,()=>99,()=>0,()=>99,()=>99,
    {rollResistance:()=>99,rollRecovery:()=>99,rollBlock:()=>99,rollFinisher:()=>40})
  assert.equal(n.status,'victory'); assert.equal(n.player.hp,220)
})
test('production roster and frozen builds exclude Kylax', () => {
  const { execFileSync }=require('node:child_process')
  execFileSync(process.execPath,['-e',`
    const assert=require('node:assert/strict');
    assert(!require('./services/arena/characters').characters.some(c=>c.kit==='classic-kylax'));
    assert(!require('./services/arena/rules').balance.characters['classic-kylax']);
    assert(!require('./services/arena/selection').roster.some(c=>c.id==='kylax'));
  `],{cwd:process.cwd(),env:{...process.env,NODE_ENV:'production'}})
})
test('enemy Graveward protects simultaneous activation but expires at the response boundary', () => {
  const b=battle('Kylax'); b.player.attack=200; b.enemy.bleeding={remaining:4}
  // Legacy AI chooses S1 with zero banked Fear; the simultaneous primitive
  // permits both sides' activation defenses before incoming attacks.
  const next=combat.advance(b,{},()=>2,()=>7,()=>0,()=>0,()=>99,()=>99,
    {actor:'exchange',aiPolicy:'legacy',rollBlock:()=>99,rollResistance:()=>99})
  assert.equal(next.enemySpecial,'special1')
  assert.equal(next.enemy.stress,4) // S1 payment plus incoming critical removal
  assert.equal(next.enemy.bleeding,undefined)
  assert(next.enemy.kylaxMetrics.wardPrevented>0)
  assert.equal(next.enemy.gravewardRound,undefined)
})
test('enemy commits Graveward before player attack; pays once and retains response basic', () => {
  const b=battle('Kylax'); b.enemy.bleeding={remaining:4}
  let die=0
  const n=combat.takeTurn(b,'basic',()=>2,()=>++die%2?8:7,()=>99,()=>0,()=>99,()=>99,
    {rollRecovery:()=>99,rollResistance:()=>99,rollBlock:()=>99,rollFinisher:()=>40})
  assert.equal(n.playerBasicDamage,4)
  assert.equal(n.enemy.stress,5)
  assert.equal(n.statistics.enemy.stressSpent,1)
  assert.equal(n.statistics.enemy.uses.special1,1)
  assert.equal(n.enemy.kylaxMetrics.wards,1)
  assert.equal(n.enemy.kylaxMetrics.bleedingRemoved,1)
  assert.equal(n.enemy.kylaxMetrics.wardPrevented,2)
  assert.equal(n.enemy.gravewardRound,undefined)
  assert.equal(n.player.hp,214)
  assert.equal(b.enemy.stress,6);assert(b.enemy.bleeding)
})
test('enemy recovery replaces Graveward and no cost is charged for an invalid player action', () => {
  const b=battle('Kylax'); b.enemy.stress=4;b.enemy.bleeding={remaining:4}
  let die=0
  const n=combat.takeTurn(b,'basic',()=>2,()=>++die%2?8:7,()=>99,()=>0,()=>99,()=>99,
    {rollRecovery:()=>0,rollResistance:()=>99,rollBlock:()=>99,rollFinisher:()=>40})
  assert.equal(n.enemy.stress,5)
  assert.equal(n.statistics.enemy.uses.special1,0)
  assert.equal(n.playerBasicDamage,6)
  const invalid=combat.takeTurn(b,'invalid',()=>2,()=>7,()=>99,()=>0,()=>99,()=>99,{rollRecovery:()=>99})
  assert.equal(invalid,b);assert.equal(b.enemy.stress,4)
})
test('early committed enemy cost and metrics survive a player knockout hit', () => {
  const b=battle('Kylax');b.enemy.hp=1;b.enemy.bleeding={remaining:2}
  const n=combat.takeTurn(b,'basic',()=>2,()=>7,()=>99,()=>0,()=>99,()=>99,{rollRecovery:()=>99})
  assert.equal(n.status,'victory')
  assert.equal(n.statistics.enemy.stressSpent,1)
  assert.equal(n.enemy.kylaxMetrics.wards,1)
  assert.equal(n.enemy.kylaxMetrics.packets[0].hpLoss,1)
})
test('fallback badge renders Bronze thumbnail/card and both log conventions explain defense', async () => {
  const fs=require('node:fs')
  const c=resolveCharacter('Kylax'), b=battle('Hendrix'); b.player.bleeding={remaining:2}
  const n=step(b,'special1')
  const session={id:'kylax-preview',revision:0,character:c,opponent:'Hendrix',level:1,page:'battle',battle:n}
  const file=await require('../services/arena/health-card').renderHealthCard(session)
  fs.writeFileSync('artifacts/arena-kylax-2026-10-20/card.png',file.attachment)
  const thumb=await require('../services/arena/art').framedArtFiles(c,'Hendrix','skins')
  assert(Buffer.isBuffer(thumb[0].attachment))
  fs.writeFileSync('artifacts/arena-kylax-2026-10-20/thumbnail.png',thumb[0].attachment)
  const {screen,actionLines}=require('../services/arena/interface')
  const fields=screen({...session,page:'skins'}).embeds[0].data.fields
  assert.match(JSON.stringify(fields),/Graveward|Graveward/i)
  assert.match(actionLines(n.history).join('\n'),/25% less direct damage this round/)
  assert.match(require('../services/arena/battle-report').reportLines(n.history,actionLines,{diagnostic:false}).join('\n'),/Bleeding removed/)
})
