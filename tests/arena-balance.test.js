const test = require('node:test'), assert = require('node:assert/strict')
const { newBattle: rawNewBattle, advance: engineAdvance, beginFinisher, comboDice } = require('../services/arena/combat')
const advance = (...args) => engineAdvance(...Array.from({length: 8}, (_, i) => args[i]), { rollRecovery: () => 99.999, aiPolicy: 'legacy', rollFinisher: () => 45 })
// Formula fixtures use a controlled, equal-stat baseline; character defaults have dedicated regression coverage.
function newBattle(hope = 0, options = {}) {
  const battle = rawNewBattle(hope, options), stat = 300 + 30 * ((options.level || 1) - 1)
  for (const fighter of [battle.player, battle.enemy]) { Object.assign(fighter, { hp: stat, maxHp: stat, attack: stat }); if (fighter.passive === 'on-the-brink') fighter.passive = null }
  return battle
}
const { resolveCharacter } = require('../services/arena/characters')
const { canUse, kitFor, specialPercent, finisherPercent, specialSlots } = require('../services/arena/rules')
const { combatReport } = require('../services/arena/statistics')
const maxim = resolveCharacter('Maxim [Spooky]')
const seq = values => { let i = 0; return () => { assert.ok(i < values.length, 'Unexpected roll'); return values[i++] } }
const step = (battle, action = 'continue', { dice = [7, 5], combo = [2, 1], ability = 99.999, accuracy = 0, critical = 99, effect = 99.999 } = {}) =>
  advance(battle, action, seq(combo), seq(dice), () => ability, () => accuracy, () => critical, () => effect)

test('playable names, costs and flat percentages supersede prior level tables', () => {
  for (const level of [1]) for (const character of [undefined, maxim]) {
    const fighter = newBattle(6, { level, character }).player, kit = kitFor(fighter)
    assert.deepEqual(specialSlots.map(slot => kit[slot].hopeCost), [0, 3, 6])
    assert.ok(specialSlots.every(slot => !('unlockLevel' in kit[slot])))
    assert.equal(kit.special1.stressCost, character ? 2 : 1)
    assert.equal(specialPercent(fighter, 'special1'), character ? 10 : 4)
    assert.equal(specialPercent(fighter, 'special2'), character ? 8 : 1)
    assert.equal(kit.special1.name, character ? 'Deadly Focus' : 'Overwhelm')
    assert.equal(kit.special2.name, character ? 'Slayer' : 'Combo Strike')
  }
})

test('Overwhelm can repeat, independently removes one Stress on exactly 20% of effect percentiles and never underflows', () => {
  let count = 0
  for (let effect = 0; effect < 100; effect++) {
    const result = step(newBattle(), 'special1', { dice: [2, 1], effect })
    assert.equal(result.special1Damage, 12); assert.equal(result.playerBasicDamage, 0)
    assert.equal(result.player.stress, 5); count += result.stressRemoved
  }
  assert.equal(count, 20)
  let battle = newBattle()
  for (let i = 0; i < 6; i++) battle = step(battle, 'special1')
  assert.equal(battle.player.stress, 0); assert.equal(canUse(battle.player, 'special1'), false)
  const seed = newBattle(); seed.enemy.stress = 0
  const empty = step(seed, 'special1', { effect: 0 }); assert.equal(empty.stressRemoved, 0); assert.equal(empty.enemy.stress, 0)
  for (const effect of [-1, 100, NaN]) assert.throws(() => step(newBattle(), 'special1', { effect }), /effect percentile/)
})

test('removal follows AI spending and applies zero-Stress vulnerability to this exchange with separate telemetry', () => {
  const seed = newBattle(); seed.enemy.stress = 1
  const removed = step(seed, 'special1', { effect: 0 })
  assert.equal(removed.stressRemoved, 1); assert.equal(removed.enemy.stress, 0)
  assert.equal(removed.playerBasicDamage, 12); assert.equal(removed.special1Damage, 15)
  assert.equal(removed.statistics.player.stressRemoved, 1); assert.equal(removed.statistics.enemy.stressRemovedTaken, 1)
  assert.equal(removed.statistics.enemy.vulnerabilityDamageTaken, 6)
  const two = newBattle(); two.enemy.stress = 2
  const spent = step(two, 'special1', { dice: [2, 1], ability: 0, effect: 0 })
  assert.equal(spent.enemy.stress, 0); assert.equal(spent.stressRemoved, 0)
  assert.equal(spent.statistics.enemy.stressSpent, 2)
})

test('Deadly Focus begins ready, recharges on three landed basics and can be charged but unaffordable', () => {
  let battle = newBattle(0, { character: maxim })
  assert.equal(battle.player.focusHits, 3)
  battle = step(battle, 'special1', { dice: [2, 1] })
  assert.equal(battle.special1Damage, 30); assert.equal(battle.player.stress, 4); assert.equal(battle.player.focusHits, 0)
  assert.equal(step(battle, 'special1'), battle)
  for (const dice of [[6, 7], [2, 1], [1, 1], [7, 5]]) battle = step(battle, 'continue', { dice })
  assert.equal(battle.player.focusHits, 3); assert.equal(canUse(battle.player, 'special1'), true)
  const next = step(battle, 'special1'); assert.equal(next.player.focusHits, 1)
  battle.player.stress = 1; assert.equal(battle.player.focusHits, 3); assert.equal(canUse(battle.player, 'special1'), false)
})

test('Combo Strike sums every d4, includes a flat ten percentage points, costs three Hope and remains uncapped', () => {
  const dice = [1, 1, 3, 1]
  assert.deepEqual(comboDice(seq(dice)), { rolls: dice, total: 6 })
  const hit = step(newBattle(3), 'special2', { combo: dice, dice: [2, 1] })
  assert.equal(hit.special2Damage, 48); assert.equal(hit.latestCombo.percent, 16); assert.equal(hit.hopeSpent, 3); assert.equal(hit.player.stress, 6)
  assert.equal(step(newBattle(3), 'special2').special2Damage, 39)
  assert.equal(step(newBattle(3), 'special2', { combo: [...Array(1000).fill(4), 1] }).special2Damage, 12033)
  const low = newBattle(2); assert.equal(step(low, 'special2'), low)
})

test('Slayer grants three future empowered basics and each landed charge contributes only incremental Special 2 damage', () => {
  let battle = step(newBattle(3, { character: maxim }), 'special2')
  assert.equal(battle.player.slayerCharges, 3); assert.equal(battle.playerBasicDamage, 9); assert.equal(battle.special2Damage, 0)
  assert.equal(battle.statistics.player.attempts.special2, 0); assert.equal(battle.statistics.player.uses.special2, 1)
  for (let i = 0; i < 3; i++) {
    battle = step(battle); assert.equal(battle.playerBasicDamage, 33); assert.equal(battle.special2Damage, 24)
    assert.equal(battle.player.slayerCharges, 2 - i)
  }
  assert.equal(battle.statistics.player.damage.basic, 36); assert.equal(battle.statistics.player.damage.special2, 72)
  assert.equal(battle.statistics.player.slayerChargesConsumed, 3); assert.equal(step(battle).playerBasicDamage, 9)
})

test('a Slayer-powered hit recharges Focus once and Focus cannot consume or duplicate Slayer charges', () => {
  const seed = newBattle(3, { character: maxim }); seed.player.focusHits = 2
  const buff = step(seed, 'special2'); assert.equal(buff.player.focusHits, 3); assert.equal(buff.player.slayerCharges, 3)
  const focus = step(buff, 'special1')
  assert.equal(focus.playerBasicDamage, 33); assert.equal(focus.special1Damage, 30); assert.equal(focus.special2Damage, 24)
  assert.equal(focus.player.focusHits, 1); assert.equal(focus.player.slayerCharges, 2)
})

test('Focus controls show independent recharge and affordability, and Slayer shows its remaining charges', () => {
  const { screen } = require('../services/arena/interface')
  const view = battle => screen({ id: 's', revision: 1, battle })
  const button = battle => view(battle).components.flatMap(row => row.components).find(item => item.data.custom_id.endsWith(':special1')).data
  const seed = newBattle(0, { character: maxim })
  assert.equal(button(seed).label, 'Deadly Focus [2 Stress]'); assert.equal(button(seed).disabled, false)
  const used = step(seed, 'special1', { dice: [2, 1] })
  assert.match(button(used).label, /0\/3 hits/); assert.equal(button(used).disabled, true)
  seed.player.stress = 1; assert.equal(button(seed).disabled, true)
  seed.player.slayerCharges = 2
  assert.equal(require('../services/arena/health-card').cardData({ battle: seed }).fighters[0].icons.some(icon => icon.type === 'slayer'), true)
})

test('player Finishers are 30–55% at every level; prepayment, timeout and saved-critical rules are preserved', () => {
  for (const character of [undefined, maxim]) for (const level of [1, 5, 10, 60]) for (let choice = 0; choice <= 5; choice++) {
    const seed = newBattle(6, { character, level }); seed.player.attack = 300
    assert.equal(finisherPercent(seed.player, choice), 30 + 5 * choice)
    const result = step(beginFinisher(seed), { special3: true, choice }, { dice: [1, 1] })
    assert.equal(result.special3Damage, 90 + 15 * choice); assert.equal(result.hopeSpent, 0)
    assert.equal(result.statistics.player.spent, 6); assert.equal(result.playerBasicDamage, 9)
  }
})

test('AI uses the requested flat coefficients and player coefficients remain independent',()=>{
 for(const level of [1,5,10])for(const opponent of ['marq','maxim']){
 const fighter=newBattle(0,{opponent,level}).enemy,kit=kitFor(fighter)
 assert.equal(specialPercent(fighter,'special1'),opponent==='marq'?4:12)
 assert.equal(kit.special1.stressCost,opponent==='marq'?1:2)
 assert.equal(specialPercent(fighter,'special2'),opponent==='marq'?1:11)
 assert.equal(kit.special2.flatPercent||0,opponent==='marq'?15:0)
 assert.equal(kit.special2.hits||0,opponent==='maxim'?3:0)
 assert.equal(specialPercent(fighter,'special3',3),40)
 }
 assert.equal(kitFor(newBattle().player).special2.flatPercent,10)
 assert.equal(kitFor(newBattle(0,{character:maxim}).player).special1.percent,10)
})

test('completed reports capture unused Slayer charges before clearing effects and new fights reset all temporary state', () => {
  const seed = newBattle(3, { character: maxim }); seed.enemy.hp = 1
  const ended = step(seed, 'special2'), report = combatReport(ended)
  assert.equal(ended.player.slayerCharges, 0); assert.equal(report.player.slayerChargesRemaining, 3)
  assert.equal(report.player.slayerActivations, 1); assert.equal(report.winner, 'player')
  const fresh = newBattle(0, { character: maxim }); assert.equal(fresh.player.focusHits, 3); assert.equal(fresh.player.slayerCharges, 0)
})

test('seeded matchups reproduce and conserve raw damage, resources and Stress including removals', () => {
  const { simulate } = require('../scripts/arena-balance-report'), options = { seed: 42, trials: 12 }
  const rows = simulate(options); assert.deepEqual(simulate(options), rows); assert.equal(rows.length, 4)
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`)
  for (const row of rows) for (const side of ['player', 'enemy']) {
    const d = row[side]
    near(d.generated - d.spent, d.remaining)
    near(6 - d.stressSpent + d.stressRecovered - d.stressRemovedTaken, d.stressRemaining)
    near(d.totalDamage, d.hpDamage + d.overkill)
    for (const key of ['basic', ...specialSlots]) assert.ok(d.hits[key] <= d.attempts[key])
  }
})
