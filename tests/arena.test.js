const test = require('node:test'), assert = require('node:assert/strict')
const { newBattle, comboDice, dualityDice, advance: rawAdvance } = require('../services/arena/combat')
const { screen, actionLog, historyFields } = require('../services/arena/interface')
const { createArena } = require('../services/arena/controller')
const { statsForLevel, damageFor, specialMultipliers, abilities, abilityAvailable, enemyAttackOutcome } = require('../services/arena/rules')
const sequence = values => { let i = 0; return () => { assert.ok(i < values.length, 'Unexpected roll'); return values[i++] } }
const actualAdvance = (battle, action, roll, duality, fear, accuracy = () => 0, critical = () => 99) => rawAdvance(battle, action, roll, duality, fear, accuracy, critical)
const advance = (battle, action = 'continue', roll, duality = sequence([6, 7]), fear = () => 99) => actualAdvance(battle, action, roll, duality, fear)
const allText = view => JSON.stringify(view.embeds[0].data)
const button = (view, action) => view.components[0].components.find(item => item.data.custom_id.endsWith(':' + action))
const footer = view => view.embeds[0].data.footer.text
const last = f => f.edits.at(-1)
function fixture(options = {}) {
  const replies = [], edits = [], errors = [], timers = new Map(), delays = []
  let serial = 0, acknowledgements = 0, dualityRolls = 0
  const arena = createArena({ logger: { error: (...args) => errors.push(args) }, rollFearSpend: () => 99, rollAccuracy: () => 0, rollCritical: () => 99,
    rollDuality: () => ++dualityRolls % 2 ? 6 : 7,
    setTimer: (callback, ms) => { assert.ok([1000, 4000].includes(ms)); delays.push(ms); const id = ++serial; timers.set(id, callback); return id },
    clearTimer: id => timers.delete(id), ...options })
  const interaction = { id: 'session', user: { id: 'alice' }, guildId: 'guild', channelId: 'channel',
    reply: async payload => { replies.push(payload); return { id: 'message' } }, editReply: async payload => edits.push(payload) }
  const click = (action, revision, overrides = {}) => ({ customId: `arena:session:${revision}:${action}`,
    user: { id: 'alice' }, guildId: 'guild', channelId: 'channel', message: { id: 'message' },
    reply: async payload => replies.push(payload), deferUpdate: async () => { acknowledgements++ }, ...overrides })
  const tick = async () => { assert.equal(timers.size, 1); const [id, callback] = timers.entries().next().value; timers.delete(id); await callback() }
  return { arena, interaction, replies, edits, errors, timers, delays, click, tick, acknowledgements: () => acknowledgements }
}
async function start(f, level = 1) { await f.arena.execute(f.interaction, undefined, { level }); await f.arena.handleButton(f.click('start', 0)) }

test('player critical success readies a later doubled basic hit and misses do not consume it', () => {
  const seed = newBattle(); seed.marq.stress = 3
  let battle = advance(seed, 'continue', undefined, sequence([1, 1]))
  assert.equal(battle.marqDamage, 6); assert.equal(battle.marq.criticalReady, true)
  assert.equal(battle.marq.hope, 1); assert.equal(battle.marq.stress, 4)
  assert.match(actionLog(battle.history), /Next basic hit ×2/)
  battle = advance(battle, 'continue', undefined, sequence([2, 3]))
  assert.equal(battle.marqDamage, 0); assert.equal(battle.marq.criticalReady, true)
  battle = advance(battle, 'continue', undefined, sequence([7, 5]))
  assert.equal(battle.marqDamage, 12); assert.equal(battle.marq.criticalReady, false)
  assert.match(actionLog(battle.history), /Marq scored a critical hit! 12 damage/)
  assert.equal(advance(battle, 'continue', undefined, sequence([7, 5])).marqDamage, 6)
  assert.equal(seed.marq.criticalReady, false); assert.equal(newBattle().marq.criticalReady, false)
})

test('neither a critical-success tick nor a saved critical doubles any player special', () => {
  for (const [action, expected] of [['combo', 27], ['hope', 174], ['third', 348]]) {
    const seed = newBattle(6, { level: 20 })
    const current = advance(seed, action, action === 'combo' ? sequence([2, 1]) : undefined, sequence([1, 1]))
    const specialDamage = battle => action === 'combo' ? battle.bonus : action === 'hope' ? battle.hopeDamage : battle.thirdDamage
    assert.equal(current.marqDamage, 18); assert.equal(specialDamage(current), expected)
    assert.equal(current.marq.criticalReady, true)
    const next = advance(current, action, action === 'combo' ? sequence([2, 1]) : undefined, sequence([7, 5]))
    assert.equal(next.marqDamage, 35); assert.equal(specialDamage(next), expected) // ceil(870 × 2% × 2), rounding once.
    assert.equal(next.marq.criticalReady, false)
  }
})

test('successive critical successes rearm without stacking more than double', () => {
  let battle = advance(newBattle(), 'continue', undefined, sequence([1, 1]))
  battle = advance(battle, 'continue', undefined, sequence([2, 2]))
  assert.equal(battle.marqDamage, 12); assert.equal(battle.marq.criticalReady, true)
  battle = advance(battle, 'continue', undefined, sequence([7, 5]))
  assert.equal(battle.marqDamage, 12); assert.equal(battle.marq.criticalReady, false)
  assert.equal(advance(battle, 'continue', undefined, sequence([7, 5])).marqDamage, 6)
})

test('player saved critical stacks with Maxim passive and vulnerability once, including Idle', () => {
  const character = require('../services/arena/characters').resolveCharacter('Maxim [Spooky]')
  const battle = newBattle(0, { character }); battle.marq.criticalReady = true; battle.marq.opportunityReady = true; battle.warrior.stress = 0
  const hit = advance(battle)
  assert.equal(hit.marqDamage, 17); assert.equal(hit.marq.criticalReady, false); assert.equal(hit.marq.opportunityReady, false)
  let idle = newBattle(0, { mode: 'idle' })
  idle = advance(idle, 'continue', undefined, sequence([1, 1]))
  assert.equal(idle.marqDamage, 6)
  idle = advance(idle)
  assert.equal(idle.marqDamage, 12); assert.equal(idle.marq.criticalReady, false)
})

test('every matching Duality pair is an automatic critical success gaining one Hope and restoring one available Stress', () => {
  for (let die = 1; die <= 12; die++) {
    const seed = newBattle(2); seed.marq.stress = 3
    const next = advance(seed, 'continue', undefined, sequence([die, die]))
    assert.equal(next.duality.success, true); assert.equal(next.duality.critical, true)
    assert.equal(next.marq.hope, 3); assert.equal(next.hopeGained, 1)
    assert.equal(next.marq.stress, 4); assert.equal(next.stressRestored, 1)
    assert.equal(next.enemyOutcome, null); assert.equal(seed.marq.stress, 3)
    assert.match(actionLog(next.history), /Critical success. Gained 1 Hope. Restored 1 Stress/)
  }
})

test('critical recovery respects maximum Stress and Hope caps, and resolves after queued costs', () => {
  const zero = advance(newBattle(6), 'continue', undefined, sequence([1, 1]))
  assert.equal(zero.marq.stress, 6); assert.equal(zero.stressRestored, 0)
  assert.equal(zero.marq.hope, 6); assert.equal(zero.hopeGained, 0)
  assert.ok(!actionLog(zero.history).includes('Restored 1 Stress'))
  const combo = advance(newBattle(), 'combo', sequence([2, 1]), sequence([1, 1]))
  assert.equal(combo.marq.stress, 6); assert.equal(combo.stressRestored, 1); assert.equal(combo.bonus, 9)
  const exhausted = newBattle(2, { level: 20 }); exhausted.marq.stress = 0
  assert.equal(advance(exhausted, 'combo', () => { throw Error('Cannot mark a seventh Stress') }), exhausted)
  const power = advance(exhausted, 'third', undefined, sequence([1, 1]))
  assert.equal(power.hopeSpent, 2); assert.equal(power.hopeGained, 1); assert.equal(power.marq.hope, 1)
  assert.equal(power.marq.stress, 1); assert.equal(power.thirdDamage, 348)
})

test('ordinary Hope rolls do not restore Stress and Idle criticals follow the same recovery rules', () => {
  const seed = newBattle(); seed.marq.stress = 4
  const ordinary = advance(seed, 'continue', undefined, sequence([7, 5]))
  assert.equal(ordinary.marq.stress, 4); assert.equal(ordinary.stressRestored, 0); assert.equal(ordinary.hopeGained, 1)
  const idle = newBattle(0, { mode: 'idle' }); idle.marq.stress = 0
  const recovery = advance(idle, 'continue', undefined, sequence([2, 2]))
  assert.equal(recovery.marq.stress, 1); assert.equal(recovery.marq.hope, 1); assert.equal(recovery.stressRestored, 1)
})

test('available Stress fills blue, zero Stress disables Combo, and critical recovery re-enables it', () => {
  const battle = newBattle(); battle.marq.stress = 0
  const full = screen({ id: 's', revision: 0, battle })
  assert.match(allText(full), /``⬛⬛⬛⬛⬛⬛`` Stress 0\/6/)
  assert.equal(button(full, 'combo').data.disabled, true)
  const next = advance(battle, 'continue', undefined, sequence([1, 1]))
  const recovered = screen({ id: 's', revision: 0, battle: next })
  assert.equal(button(recovered, 'combo').data.disabled, false)
  assert.match(allText(recovered), /``🟦⬛⬛⬛⬛⬛`` Stress 1\/6/)
  assert.ok(!allText(recovered).includes('Takes ×1.25'))
  assert.ok(allText(recovered).includes('🟦'))
})

test('active cadence is four seconds and Idle cadence remains one second in timers and copy', async () => {
  const f = fixture(); await start(f)
  assert.match(allText(f.replies[0]), /4-second turns/)
  assert.match(allText(last(f)), /Next roll in 4 seconds/)
  await f.tick(); assert.ok(f.delays.every(delay => delay === 4000)); f.arena.dispose()
  const g = fixture(); await g.arena.execute(g.interaction); await g.arena.handleButton(g.click('idle', 0))
  assert.match(allText(last(g)), /Next roll in 1 second/)
  await g.tick(); assert.ok(g.delays.every(delay => delay === 1000)); g.arena.dispose()
})

test('only Spooky Maxim gets the passive on the player side; enemy Maxim always has it and fights start unarmed', () => {
  const { characters } = require('../services/arena/characters')
  for (const character of characters) {
    const battle = newBattle(0, { character })
    assert.equal(abilityAvailable(battle.marq, 'passive'), character.id === 'spooky-2026:max')
    assert.equal(battle.marq.opportunityReady, false); assert.equal(battle.warrior.opportunityReady, false)
    assert.equal(abilityAvailable(battle.warrior, 'passive'), true)
  }
})

test('enemy passive arms after a player miss and boosts only the next landed basic on a later tick', () => {
  let battle = advance(newBattle(), 'continue', undefined, sequence([5, 4]))
  assert.equal(battle.maximDamage, 6); assert.equal(battle.warrior.opportunityReady, true)
  battle = advance(battle, 'continue', undefined, sequence([7, 5]))
  assert.equal(battle.enemyOutcome, null); assert.equal(battle.warrior.opportunityReady, true)
  battle = rawAdvance(battle, 'continue', undefined, sequence([6, 7]), () => 40, () => 0, () => 99)
  assert.equal(battle.maximDamage, 18); assert.equal(battle.warrior.opportunityReady, true)
  battle = rawAdvance(battle, 'continue', undefined, sequence([6, 7]), () => 99, () => 75)
  assert.equal(battle.maximDamage, 0); assert.equal(battle.warrior.opportunityReady, true)
  battle = advance(battle)
  assert.equal(battle.maximDamage, 7); assert.equal(battle.warrior.opportunityReady, false)
  assert.equal(advance(battle).maximDamage, 6)
})

test('both Maxim passives can arm on simultaneous misses and then spend independently without stacking', () => {
  const character = require('../services/arena/characters').resolveCharacter('Maxim [Spooky]')
  let battle = rawAdvance(newBattle(0, { character }), 'continue', undefined, sequence([2, 3]), () => 99, () => 75)
  assert.equal(battle.marqDamage, 0); assert.equal(battle.maximDamage, 0)
  assert.equal(battle.marq.opportunityReady, true); assert.equal(battle.warrior.opportunityReady, true)
  battle = rawAdvance(battle, 'continue', undefined, sequence([2, 3]), () => 99, () => 75)
  assert.equal(battle.marq.opportunityReady, true); assert.equal(battle.warrior.opportunityReady, true)
  battle = advance(battle)
  assert.equal(battle.marqDamage, 7); assert.equal(battle.maximDamage, 7)
  assert.equal(battle.marq.opportunityReady, false); assert.equal(battle.warrior.opportunityReady, false)
  assert.ok(!allText(screen({ id: 's', revision: 0, battle, character })).includes('opportunity'))
  assert.match(actionLog(battle.history), /Your Maxim hit Maxim for 7/)
  battle = advance(battle)
  assert.equal(battle.marqDamage, 6); assert.equal(battle.maximDamage, 6)
})

test('passive boost affects no player special, can rearm on the same tick, and rounds combined modifiers once', () => {
  const character = require('../services/arena/characters').resolveCharacter('Maxim [Spooky]')
  const seeded = newBattle(2, { character, level: 20 }); seeded.marq.opportunityReady = true
  const power = rawAdvance(seeded, 'third', undefined, sequence([6, 7]), () => 99, () => 75)
  assert.equal(power.marqDamage, 20); assert.equal(power.thirdDamage, 348)
  assert.equal(power.marq.opportunityReady, true) // Spent on hit and rearmed after enemy miss.
  const missed = advance(seeded, 'combo', sequence([2, 1]), sequence([2, 3]))
  assert.equal(missed.marqDamage, 0); assert.equal(missed.bonus, 27); assert.equal(missed.marq.opportunityReady, true)
  const empty = newBattle(); empty.warrior.opportunityReady = true; empty.marq.stress = 0
  assert.equal(rawAdvance(empty, 'continue', undefined, sequence([6, 7]), () => 99, () => 0, () => 0).maximDamage, 17)
  assert.equal(damageFor(1500, 2, 1, 1.1), 33) // No floating-point extra damage at an integer boundary.
})

test('passives affect Idle basics and a new fight resets their readiness', async () => {
  const character = require('../services/arena/characters').resolveCharacter('Maxim [Spooky]')
  const battle = newBattle(0, { character, mode: 'idle' })
  const armed = rawAdvance(battle, 'continue', undefined, sequence([2, 3]), undefined, () => 75)
  assert.equal(advance(armed).marqDamage, 7); assert.equal(advance(armed).maximDamage, 7)
  const fresh = newBattle(0, { character, mode: 'idle' })
  assert.equal(advance(fresh).marqDamage, 6); assert.equal(advance(fresh).maximDamage, 6)
})

test('Power Strike unlocks at 20, costs two prior Hope, and deals forty percent without stacking specials', () => {
  const forbidden = () => { throw Error('Invalid action rolled') }
  for (const seed of [newBattle(6, { level: 19 }), newBattle(1, { level: 20 }), newBattle(6, { level: 20, mode: 'idle' })]) {
    assert.equal(actualAdvance(seed, 'third', forbidden, forbidden, forbidden), seed)
  }
  const battle = newBattle(2, { level: 20 })
  for (const action of [{ third: true, hope: true }, { third: true, combo: true }]) assert.equal(advance(battle, action), battle)
  const hit = advance(battle, 'third', undefined, sequence([2, 3]))
  assert.equal(hit.thirdDamage, 348); assert.equal(hit.hopeDamage, 0); assert.equal(hit.hopeSpent, 2); assert.equal(hit.marq.hope, 0)
  assert.equal(hit.marq.stress, 6); assert.equal(hit.warrior.hp, 522)
  assert.match(actionLog(hit.history), /Power Strike dealt 348. Spent 2 Hope/)
  battle.marq.abilityRanks.third = 10; battle.warrior.stress = 0
  assert.equal(advance(battle, 'third').thirdDamage, 718)
  battle.marq.attack = 300; battle.warrior.stress = 6
  assert.equal(advance(battle, 'third').thirdDamage, 198)
})

test('Power Strike controls reserve two Hope, replace other specials, ignore duplicates and respect locks', async () => {
  const f = fixture({ rollDuality: () => 6, roll: sequence([2, 1]) })
  await start(f, 20)
  assert.equal(button(last(f), 'third').data.disabled, true)
  await f.arena.handleButton(f.click('third', 1)); await f.tick()
  assert.equal(button(last(f), 'third').data.disabled, true)
  await f.tick(); assert.equal(button(last(f), 'third').data.disabled, false)
  await f.arena.handleButton(f.click('hope', 1)); await f.arena.handleButton(f.click('third', 2))
  await f.arena.handleButton(f.click('third', 2)); await f.arena.handleButton(f.click('third', 3))
  assert.match(footer(last(f)), /Hope 0\/6.*2 queued/)
  await f.tick()
  assert.match(footer(last(f)), /Hope 1\/6/)
  assert.match(allText(last(f)), /Power Strike dealt 348/); assert.ok(!allText(last(f)).includes('Hope Strike dealt'))
  assert.equal(button(last(f), 'third').data.disabled, true)
  await f.tick(); await f.arena.handleButton(f.click('third', 4)); await f.arena.handleButton(f.click('combo', 5))
  await f.tick(); assert.match(footer(last(f)), /Hope 3\/6/); assert.match(allText(last(f)), /Stress 6\/6/)
  f.arena.dispose()
  const low = fixture(); await start(low, 19)
  assert.equal(button(last(low), 'third').data.label, 'Power Strike [Lv 20]')
  await low.arena.handleButton(low.click('third', 1)); await low.tick()
  assert.ok(!allText(last(low)).includes('Power Strike queued')); low.arena.dispose()
})

test('enemy accuracy and critical rolls produce exact outcome frequencies and skip critical checks on misses', () => {
  const fighter = newBattle().warrior, counts = { miss: 0, hit: 0, critical: 0 }
  for (let accuracy = 0; accuracy < 100; accuracy++) for (let critical = 0; critical < 100; critical++) {
    const outcome = enemyAttackOutcome(fighter, () => accuracy, () => {
      assert.ok(accuracy < 75, 'Miss must not roll critical'); return critical
    })
    counts[outcome]++
  }
  assert.deepEqual(counts, { miss: 2500, hit: 7125, critical: 375 })
  for (const level of [1, 5, 20, 60]) {
    const warrior = newBattle(0, { level }).warrior
    assert.equal(warrior.accuracy, 75); assert.equal(warrior.criticalChance, 5); assert.equal(warrior.criticalMultiplier, 2)
  }
  for (const value of [-1, 100, 0.5, NaN]) {
    assert.throws(() => enemyAttackOutcome(fighter, () => value, () => 99), /percentile/)
    assert.throws(() => enemyAttackOutcome(fighter, () => 0, () => value), /percentile/)
  }
})

test('skipped enemy turns roll neither accuracy nor critical and generate no enemy attack event', () => {
  const forbidden = () => { throw Error('No enemy attack roll allowed') }
  for (const dice of [[7, 5], [1, 1]]) {
    const result = rawAdvance(newBattle(), 'continue', undefined, sequence(dice), forbidden, forbidden, forbidden)
    assert.equal(result.enemyOutcome, null); assert.equal(result.maximDamage, 0)
    assert.ok(!result.history.some(event => event.actor === 'Maxim'))
  }
})

test('missed Fear attempts still spend Fear but cause no damage or Stress loss', () => {
  for (const percentile of [0, 40, 99]) {
    const result = rawAdvance(newBattle(), 'continue', undefined, sequence([5, 7]), () => percentile,
      () => 75, () => { throw Error('A miss cannot crit') })
    assert.equal(result.enemyOutcome, 'miss'); assert.equal(result.marq.hp, 300)
    assert.equal(result.maximDamage, 0); assert.equal(result.stressLost, 0); assert.equal(result.marq.stress, 6)
    assert.equal(result.fearSpent, percentile < 70 ? 1 : 0)
    assert.equal(result.warrior.fear, percentile < 70 ? 0 : 1)
    const event = result.history.find(event => event.actor === 'Maxim')
    assert.equal(event.outcome, 'miss'); assert.match(actionLog([event]), /Maxim missed\./)
  }
})

test('all enemy attacks crit and stack with zero-Stress vulnerability before rounding once', () => {
  for (const [percentile, normal, vulnerable] of [[99, 12, 15], [0, 60, 75], [40, 36, 45]]) {
    const battle = newBattle()
    const result = rawAdvance(battle, 'continue', undefined, sequence([5, 7]), () => percentile, () => 74, () => 4)
    assert.equal(result.enemyOutcome, 'critical'); assert.equal(result.maximDamage, normal)
    battle.marq.stress = percentile === 40 ? 1 : 0
    const empty = rawAdvance(battle, 'continue', undefined, sequence([5, 7]), () => percentile, () => 0, () => 0)
    assert.equal(empty.maximDamage, vulnerable); assert.equal(empty.marq.stress, 0)
    assert.equal(empty.stressLost, percentile === 40 ? 1 : 0)
  }
  const battle = newBattle(); battle.marq.stress = 1
  const miss = rawAdvance(battle, 'combo', sequence([2, 1]), sequence([5, 7]), () => 40, () => 99)
  assert.equal(miss.marq.stress, 0); assert.equal(miss.stressLost, 0); assert.equal(miss.maximDamage, 0)
})

test('enemy miss and critical results render in the log without exposing hidden odds', async () => {
  const f = fixture({ rollAccuracy: sequence([75, 74]), rollCritical: () => 4 })
  await start(f); await f.tick(); assert.match(allText(last(f)), /Maxim missed\./)
  await f.tick(); assert.match(allText(last(f)), /Maxim scored a critical hit! 12 damage\./)
  assert.ok(!allText(last(f)).includes('accuracy')); assert.ok(!allText(last(f)).includes('criticalChance'))
  f.arena.dispose()
})

test('Idle also resolves enemy misses and criticals without enabling Fear specials', () => {
  const noFear = () => { throw Error('Idle cannot spend Fear') }
  const seed = newBattle(0, { mode: 'idle' })
  const miss = rawAdvance(seed, 'continue', undefined, sequence([6, 7]), noFear, () => 75)
  assert.equal(miss.enemyOutcome, 'miss'); assert.equal(miss.marq.hp, 300); assert.equal(miss.warrior.hp, 294)
  const crit = rawAdvance(seed, 'continue', undefined, sequence([6, 7]), noFear, () => 0, () => 0)
  assert.equal(crit.maximDamage, 12); assert.equal(crit.fearSpent, 0); assert.equal(crit.warrior.fear, 1)
})

test('balance simulations are reproducible and count attack outcomes', () => {
  const { simulate } = require('../scripts/arena-balance-report')
  const first = simulate({ trials: 10, seed: 42 })
  assert.deepEqual(first, simulate({ trials: 10, seed: 42 })); assert.equal(first.length, 10)
  for (const row of first) {
    assert.ok(row.attempts > 0); assert.ok(row.misses > 0)
    assert.ok(row.criticals <= row.attempts - row.misses)
  }
})

test('test progression scales both fighters together, defaults ranks to one, and validates level bounds', () => {
  for (const [level, hp, attack] of [[1, 300, 300], [5, 420, 420], [20, 870, 870], [60, 2070, 2070]]) {
    const battle = newBattle(0, { level })
    for (const fighter of [battle.marq, battle.warrior]) {
      assert.equal(fighter.level, level); assert.equal(fighter.hp, hp); assert.equal(fighter.maxHp, hp)
      assert.equal(fighter.attack, attack); assert.equal(fighter.rank, 1)
    }
    assert.deepEqual(battle.marq.abilityRanks, { combo: 1, hope: 1, third: 1 })
  }
  for (const value of [0, 61, 1.5, NaN, '5', null]) assert.throws(() => statsForLevel(value), /level/)
})

test('all special upgrade ranks scale original damage and damage rounds only after all modifiers', () => {
  const expected = [60, 66, 72, 78, 84, 87, 90, 93, 96, 99]
  specialMultipliers.forEach((_, i) => assert.equal(damageFor(300, 20, i + 1), expected[i]))
  assert.equal(damageFor(301, 3, 1, 1.5), 14)
  assert.equal(damageFor(300, 3, 2, 1.5), 15)
  for (const rank of [0, 11, 1.5]) assert.throws(() => damageFor(300, 2, rank), /rank/)
  const battle = newBattle(); battle.marq.attack = 301; battle.warrior.attack = 401
  assert.equal(advance(battle).marqDamage, 7); assert.equal(advance(battle).maximDamage, 9)
  battle.marq.abilityRanks.combo = 2; battle.warrior.stress = 0
  assert.equal(advance(battle, 'combo', sequence([2, 1])).bonus, 13)
  battle.marq.rank = 10; battle.warrior.rank = 20
  assert.equal(advance(battle).maximDamage, 9) // Character rank never boosts damage.
})

test('Hope and third-special unlocks are enforced while other characters have no passive', () => {
  const locked = newBattle(6, { level: 4 })
  assert.equal(advance(locked, 'hope', undefined, () => { throw Error('Locked action rolled') }), locked)
  const view = screen({ id: 's', revision: 0, battle: locked })
  assert.equal(button(view, 'hope').data.label, 'Hope Strike [Lv 5]'); assert.equal(button(view, 'hope').data.disabled, true)
  const unlocked = newBattle(1, { level: 5 })
  const miss = advance(unlocked, 'hope', undefined, sequence([2, 3]))
  assert.equal(miss.marqDamage, 0); assert.equal(miss.hopeDamage, 84); assert.equal(miss.hopeSpent, 1)
  assert.equal(abilities.third.unlockLevel, 20)
  for (const level of [19, 20, 60]) {
    const battle = newBattle(0, { level })
    assert.equal(abilityAvailable(battle.marq, 'third'), level >= 20)
    assert.equal(abilityAvailable(battle.marq, 'passive'), false)
    assert.equal(advance(battle, { third: true }), battle)
  }
})

test('choosing another special replaces the pending action and only its resource is spent', async () => {
  const f = fixture({ rollDuality: sequence([7, 5, 6, 7, 6, 7]), roll: sequence([2, 1]) })
  await start(f, 5); await f.tick()
  await f.arena.handleButton(f.click('combo', 1))
  await f.arena.handleButton(f.click('hope', 2))
  await f.tick()
  assert.match(allText(last(f)), /Stress 6\/6/); assert.match(footer(last(f)), /Hope 0\/6/)
  assert.match(allText(last(f)), /Hope Strike dealt 84/); assert.ok(!allText(last(f)).includes('Combo Strike:'))
  await f.arena.handleButton(f.click('combo', 4)); await f.tick()
  assert.match(allText(last(f)), /Stress 5\/6/); assert.match(allText(last(f)), /3%/)
  f.arena.dispose()
})

test('forged low-level Hope controls cannot reserve earned Hope', async () => {
  const f = fixture({ rollDuality: () => 6 }); await start(f, 4); await f.tick()
  await f.arena.handleButton(f.click('hope', 1)); await f.tick()
  assert.match(footer(last(f)), /Hope 2\/6/)
  assert.equal(button(last(f), 'hope').data.disabled, true)
  assert.ok(!allText(last(f)).includes('Hope Strike queued')); f.arena.dispose()
})

test('replacing queued Hope with Combo preserves Hope and rematches preserve level and ranks', async () => {
  const f = fixture({ rollDuality: () => 6, roll: sequence([2, 1]) })
  await start(f, 20); await f.tick()
  await f.arena.handleButton(f.click('hope', 1)); await f.arena.handleButton(f.click('combo', 2)); await f.tick()
  assert.match(footer(last(f)), /Hope 2\/6/); assert.match(allText(last(f)), /Stress 6\/6/)
  assert.ok(!allText(last(f)).includes('Hope Strike dealt'))
  f.interaction.editReply = async () => { throw Error('stop for replay') }
  await f.tick()
  f.interaction.editReply = async payload => f.edits.push(payload)
  await f.arena.handleButton(f.click('start', 4))
  assert.match(allText(last(f)), /Lv 20 · Rank 1/); assert.match(allText(last(f)), /❤️870\/870/)
  assert.match(footer(last(f)), /Hope 0\/6.*Fear 0/); f.arena.dispose()
})

test('slash level definition and direct execution validate bounds and carry the shared level into the lobby', async t => {
  const command = require('../commands/Arena/Arena')
  const singleton = require('../services/arena/controller').arena
  const previous = { env: process.env.NODE_ENV, guild: process.env.GUILDID }
  t.after(() => {
    singleton.dispose()
    for (const [key, value] of [['NODE_ENV', previous.env], ['GUILDID', previous.guild]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value
    }
  })
  process.env.NODE_ENV = 'development'; process.env.GUILDID = 'guild'
  const definition = command.data.toJSON()
  assert.deepEqual(definition.options.map(option => option.name), ['character', 'level'])
  const level = definition.options[1]
  assert.equal(level.type, 4); assert.equal(level.min_value, 1); assert.equal(level.max_value, 60); assert.ok(!level.required)
  for (const value of [0, 61, 1.5]) {
    const f = fixture()
    await command.execute({ ...f.interaction, options: { getInteger: () => value } })
    assert.equal(f.replies[0].ephemeral, true); assert.match(f.replies[0].content, /level from 1 to 60/)
  }
  for (const [value, text] of [[undefined, /Lv 1 · Rank 1 · 300 HP · 300 Attack/], [5, /Lv 5 · Rank 1 · 420 HP · 420 Attack/]]) {
    const f = fixture()
    await command.execute({ ...f.interaction, options: { getInteger: () => value } })
    assert.match(allText(f.replies[0]), text); assert.match(allText(f.replies[0]), /Marq/)
  }
})

test('fresh characters have 300 HP, six available Stress each, zero currencies and pure tick calculations', () => {
  const battle = newBattle(), next = advance(battle)
  for (const character of [battle.marq, battle.warrior]) { assert.equal(character.hp, 300); assert.equal(character.stress, 6); assert.equal(character.maxStress, 6) }
  assert.equal(battle.marq.hope, 0); assert.equal(battle.warrior.fear, 0)
  assert.equal(next.marq.hp, 294); assert.equal(next.warrior.hp, 294); assert.equal(battle.marq.hp, 300)
})

test('Combo Dice stop only on a lower predecessor comparison and include every result', () => {
  for (const dice of [[1, 1, 3, 1], [1, 1, 1, 2, 2, 3, 4, 4, 1], [4, 4, 2], [2, 1]]) {
    assert.deepEqual(comboDice(sequence(dice)), { rolls: dice, total: dice.reduce((sum, value) => sum + value, 0) })
  }
  for (const value of [0, 5, 1.5, NaN]) assert.throws(() => comboDice(() => value), /d4/)
})

test('Combo spends one Stress; zero Stress rejects Combo without rolling or advancing', () => {
  const combo = advance(newBattle(), 'combo', sequence([1, 1, 3, 1]))
  assert.equal(combo.marq.stress, 5); assert.equal(combo.bonus, 18); assert.equal(combo.warrior.hp, 276)
  const battle = newBattle(); battle.marq.stress = 0
  assert.equal(advance(battle, 'combo', () => { throw Error('No roll') }), battle)
  assert.equal(button(screen({ id: 's', revision: 0, battle }), 'combo').data.disabled, true)
  assert.equal(advance(battle).tick, 1)
})

test('zero Stress applies x1.25 to either defender and rounds each hit up', () => {
  const marqEmpty = newBattle(); marqEmpty.marq.stress = 0
  assert.equal(advance(marqEmpty).maximDamage, 8)
  assert.equal(advance(marqEmpty, 'continue', undefined, sequence([5, 7]), () => 0).maximDamage, 38)
  const maximEmpty = newBattle(1, { level: 5 }); maximEmpty.warrior.stress = 0
  const hit = advance(maximEmpty, 'combo', sequence([2, 1]))
  assert.equal(hit.marqDamage, 11); assert.equal(hit.bonus, 16)
  assert.equal(advance(maximEmpty, 'hope').hopeDamage, 105)
})

test('Combo spending and Stress attacks apply before incoming damage without negative Stress', () => {
  const lastStress = newBattle(); lastStress.marq.stress = 1
  const cost = advance(lastStress, 'combo', sequence([2, 1]))
  assert.equal(cost.marq.stress, 0); assert.equal(cost.maximDamage, 8)
  const stripped = advance(lastStress, 'continue', undefined, sequence([5, 7]), () => 40)
  assert.equal(stripped.stressLost, 1); assert.equal(stripped.marq.stress, 0); assert.equal(stripped.maximDamage, 23)
  const both = advance(lastStress, 'combo', sequence([2, 1]), sequence([5, 7]), () => 40)
  assert.equal(both.marq.stress, 0); assert.equal(both.stressLost, 0); assert.equal(both.maximDamage, 23)
})

test('100 percentile outcomes give exclusive 40% heavy, 30% Stress drain and 30% normal attacks', () => {
  const counts = { heavy: 0, stress: 0, normal: 0 }
  for (let percentile = 0; percentile < 100; percentile++) {
    const battle = advance(newBattle(), 'continue', undefined, sequence([5, 7]), () => percentile)
    const type = percentile < 40 ? 'heavy' : percentile < 70 ? 'stress' : null
    assert.equal(battle.fearAttack, type); counts[type || 'normal']++
    assert.equal(battle.maximDamage, type === 'heavy' ? 30 : type === 'stress' ? 18 : 6)
    assert.equal(battle.marq.stress, type === 'stress' ? 5 : 6)
    assert.equal(battle.warrior.fear, type ? 0 : 1); assert.equal(battle.fearSpent, Number(Boolean(type)))
  }
  assert.deepEqual(counts, { heavy: 40, stress: 30, normal: 30 })
  for (const value of [-1, 100, 0.5, NaN]) assert.throws(() => advance(newBattle(), 'continue', undefined, sequence([5, 7]), () => value), /percentile/)
})

test('Fear cannot enable attacks on success with Hope or critical, or be spent without a balance', () => {
  const stored = newBattle(); stored.warrior.fear = 2
  for (const dice of [[7, 5], [1, 1]]) {
    const result = advance(stored, 'continue', undefined, sequence(dice), () => { throw Error('No attack') })
    assert.equal(result.maximDamage, 0); assert.equal(result.warrior.fear, 2)
  }
  const empty = advance(newBattle(), 'continue', undefined, sequence([5, 4]), () => { throw Error('No Fear') })
  assert.equal(empty.maximDamage, 6); assert.equal(empty.fearSpent, 0)
  const spend = advance(stored, 'continue', undefined, sequence([5, 4]), () => 69)
  assert.equal(spend.maximDamage, 18); assert.equal(spend.warrior.fear, 1); assert.equal(spend.marq.hope, 1)
})

test('all 144 duality pairs preserve Difficulty 12, critical doubles, Hope gain and single Maxim attack', () => {
  for (let hope = 1; hope <= 12; hope++) for (let fear = 1; fear <= 12; fear++) {
    const battle = advance(newBattle(), 'continue', undefined, sequence([hope, fear]))
    const success = hope === fear || hope + fear >= 12
    assert.equal(battle.duality.success, success); assert.equal(battle.duality.critical, hope === fear)
    assert.equal(battle.marqDamage, Number(success) * 6); assert.equal(battle.maximDamage, Number(!success || fear > hope) * 6)
    assert.equal(battle.marq.hope, hope >= fear ? 1 : 0)
  }
  for (const value of [0, 13, NaN, 1.5]) assert.throws(() => dualityDice(12, () => value), /d12/)
})

test('victory, defeat and simultaneous-KO player victory get distinct terminal embeds and disabled abilities', () => {
  const victory = newBattle(); victory.warrior.hp = 1
  const defeat = newBattle(); defeat.marq.hp = 1
  const tie = newBattle(); tie.marq.hp = 1; tie.warrior.hp = 1
  for (const [seed, expected, title] of [[victory, 'victory', /VICTORY/], [defeat, 'defeat', /DEFEAT/], [tie, 'victory', /VICTORY/]]) {
    const result = advance(seed)
    assert.equal(result.status, expected); assert.equal(advance(result), result)
    const view = screen({ id: 's', revision: 0, battle: result })
    assert.match(view.embeds[0].data.title, title)
    assert.equal(button(view, 'combo'), undefined); assert.equal(button(view, 'start').data.disabled, false)
  }
  const result = advance(tie)
  assert.equal(result.tiedVictory, true); assert.equal(result.marq.hp, 0); assert.equal(result.warrior.hp, 0)
  assert.ok(!allText(screen({ id: 's', revision: 0, battle: result })).includes('Simultaneous KO'))
})

test('Hope Strike spends exactly one prior Hope, has cap six, and rejects stacking with Combo', () => {
  assert.equal(advance(newBattle(6), 'continue', undefined, sequence([7, 5])).marq.hope, 6)
  const seeded = newBattle(1, { level: 5 })
  assert.equal(advance(seeded, { combo: true, hope: true }), seeded)
  const hit = advance(seeded, 'hope')
  assert.equal(hit.marq.hope, 0); assert.equal(hit.hopeSpent, 1); assert.equal(hit.hopeDamage, 84)
  assert.equal(hit.marq.stress, 6); assert.equal(hit.warrior.hp, 327)
  const empty = newBattle()
  assert.equal(advance(empty, 'hope', undefined, () => { throw Error('No Hope') }), empty)
})

test('plain-language log keeps five actions, colored dice dots and explicit damage/Stress results', () => {
  assert.equal(actionLog(), 'The fight starts here.')
  const rows = Array.from({ length: 8 }, (_, tick) => ({ kind: 'hit', tick, actor: 'Marq', target: 'Maxim', damage: 1 }))
  const text = actionLog(rows)
  assert.equal(text.split('\n').length, 5); assert.ok(!text.includes('**2.**')); assert.ok(text.includes('**3.**'))
  assert.ok(!text.includes('```')); assert.match(text, /Marq hit Maxim for 1/)
  const details = actionLog([
    { kind: 'roll', tick: 1, hope: 7, fear: 5, total: 12, success: true, withHope: true },
    { kind: 'hit', tick: 1, actor: 'Maxim', target: 'Marq', damage: 3, stressLost: 1 },
    { kind: 'combo', tick: 1, damage: 6 }, { kind: 'hope', tick: 1, damage: 10 },
  ])
  assert.match(details, /🟡7 \+ 🟣5 = 12/)
  assert.match(details, /Maxim hit Marq for 3 and removed 1 Stress/)
  assert.match(details, /Combo Strike dealt 6/); assert.match(details, /Hope Strike dealt 10/)
})

test('battle history keeps five actions at the bottom and retains the latest combo result', () => {
  let battle = advance(newBattle(), 'combo', sequence([2, 1]))
  for (let i = 0; i < 6; i++) battle = advance(battle)
  assert.equal(battle.actions.length, 5); assert.equal(battle.actions.at(-1).tick, 7)
  const view = screen({ id: 's', revision: 0, battle })
  assert.equal(view.embeds[0].data.fields.at(-1).name, 'Combat log')
  assert.equal(view.embeds[0].data.fields.at(-1).value.split('\n').length, 6)
  assert.match(view.embeds[0].data.fields.at(-1).value, /🔺2 \+ 🔺1/)
  assert.ok(!allText(view).includes('🛑')); assert.ok(!allText(view).includes('1 < 2'))
  assert.ok(battle.history.length > battle.actions.length)
})

test('health stays red and percentage-based; blue Stress has exactly one segment per available point', () => {
  const battle = newBattle(); battle.marq.stress = 3; battle.warrior.stress = 0; battle.marq.hp = 150
  const view = screen({ id: 's', revision: 0, battle }), status = view.embeds[0].data.fields[0].value
  assert.match(status, /50%/); assert.match(status, /``🟦🟦🟦⬛⬛⬛`` Stress 3\/6/)
  assert.match(status, /``⬛⬛⬛⬛⬛⬛`` Stress 0\/6\n⚠️ Takes ×1.25/)
  assert.ok(status.includes('``🟥🟥🟥🟥⬛⬛⬛⬛``'))
  assert.ok(status.includes('🟥')); assert.ok(status.includes('❤️150/300'))
})

test('automatic fight ends with player victory on tie and replay resets HP, Stress, currencies and log', async () => {
  const f = fixture(); await start(f)
  for (let i = 0; i < 50; i++) await f.tick()
  assert.equal(last(f).embeds[0].data.title, 'VICTORY'); assert.equal(f.timers.size, 0)
  assert.match(last(f).embeds[0].data.description, /Turns:\*\* 50/)
  assert.ok(!allText(last(f)).includes('Simultaneous KO'))
  assert.match(last(f).embeds[0].data.description, /earlier actions omitted/)
  await f.arena.handleButton(f.click('start', 1))
  assert.match(allText(last(f)), /❤️300\/300/); assert.match(allText(last(f)), /Stress 6\/6/)
  assert.match(footer(last(f)), /Hope 0\/6.*Fear 0/)
  assert.ok(!last(f).embeds[0].data.fields.at(-1).value.includes('T20')); assert.equal(f.timers.size, 1)
})

test('automatic defeat shows a distinct result embed, stops timers and leaves only replay available', async () => {
  const f = fixture({ rollFearSpend: () => 0 }); await start(f)
  for (let i = 0; i < 10; i++) await f.tick()
  assert.equal(last(f).embeds[0].data.title, 'DEFEAT')
  assert.equal(last(f).embeds[0].data.color, 0xd55252)
  assert.equal(f.timers.size, 0); assert.equal(button(last(f), 'combo'), undefined)
  assert.equal(button(last(f), 'start').data.disabled, false)
  await f.arena.handleButton(f.click('start', 1)); assert.equal(f.timers.size, 1)
})

test('stale/concurrent Combo clicks spend one Stress and apply one bonus on the next tick', async () => {
  let rolls = 0
  const f = fixture({ roll: () => ++rolls % 2 ? 2 : 1 }); await start(f)
  let release
  const first = f.arena.handleButton(f.click('combo', 1, { deferUpdate: () => new Promise(resolve => { release = resolve }) }))
  const second = f.arena.handleButton(f.click('combo', 1))
  release(); await Promise.all([first, second]); assert.equal(rolls, 0)
  await f.tick(); assert.equal(rolls, 2); assert.match(allText(last(f)), /Stress 5\/6/)
  await f.arena.handleButton(f.click('combo', 1)); await f.tick(); assert.equal(rolls, 2)
})

test('clicks during a slow timer edit acknowledge immediately and do not overtake message updates', async () => {
  const f = fixture({ roll: sequence([2, 1]) }); await start(f)
  let release
  f.interaction.editReply = payload => { f.edits.push(payload); return new Promise(resolve => { release = resolve }) }
  const tick = f.tick(); await Promise.resolve(); await Promise.resolve()
  const click = f.arena.handleButton(f.click('combo', 1))
  assert.equal(f.acknowledgements(), 2); assert.equal(f.edits.length, 2)
  f.interaction.editReply = async payload => f.edits.push(payload)
  release(); await tick; await click
  assert.equal(button(last(f), 'combo').data.disabled, true)
  await f.tick(); assert.match(allText(last(f)), /Stress 5\/6/)
})

test('Hope button visibility, queued balance, duplicate spending and reset remain safe', async () => {
  const f = fixture({ rollDuality: sequence([7, 5, 5, 7, 5, 7]) }); await start(f, 5)
  assert.equal(button(last(f), 'hope'), undefined)
  await f.arena.handleButton(f.click('hope', 1)); await f.tick()
  assert.ok(button(last(f), 'hope')); assert.match(footer(last(f)), /Hope 1\/6/)
  await f.arena.handleButton(f.click('hope', 1)); await f.arena.handleButton(f.click('hope', 1))
  assert.match(footer(last(f)), /Hope 0\/6.*1 queued/)
  await f.tick(); assert.equal(button(last(f), 'hope'), undefined); assert.match(allText(last(f)), /❤️318\/420/)
  await f.arena.handleButton(f.click('hope', 1)); await f.tick(); assert.match(allText(last(f)), /❤️309\/420/)
})

test('foreign controls, old Continue buttons, missing sessions and wrong message contexts reject privately', async () => {
  const f = fixture(); await start(f)
  for (const overrides of [{ user: { id: 'bob' } }, { message: { id: 'other' } }, { guildId: 'other' }, { channelId: 'other' },
    { customId: 'arena:missing:1:combo' }, { customId: 'arena:session:1:continue' }]) {
    await f.arena.handleButton(f.click('combo', 1, overrides)); assert.equal(f.replies.at(-1).ephemeral, true)
  }
  await f.tick(); assert.match(allText(last(f)), /Stress 6\/6/)
})

test('failed display stops ticks without replaying committed Hope spending or damage', async () => {
  const f = fixture({ rollDuality: sequence([7, 5, 5, 7]) }); await start(f, 5); await f.tick()
  await f.arena.handleButton(f.click('hope', 1)); let failed = false
  f.interaction.editReply = async payload => { if (!failed) { failed = true; throw Error('uncertain delivery') }; f.edits.push(payload) }
  await f.tick(); assert.equal(f.timers.size, 0); assert.equal(f.errors.length, 1)
  assert.match(allText(last(f)), /❤️318\/420/); assert.match(footer(last(f)), /Hope 0\/6/)
  await f.arena.handleButton(f.click('hope', 1)); assert.equal(f.timers.size, 0); assert.match(allText(last(f)), /❤️318\/420/)
  await f.arena.handleButton(f.click('start', 3)); assert.equal(f.timers.size, 1); assert.match(allText(last(f)), /❤️420\/420/)
})

test('eviction/disposal cancel timers and expired controls fail safely', async () => {
  const f = fixture({ maxSessions: 1 }); await start(f)
  await f.arena.execute({ ...f.interaction, id: 'second' }); assert.equal(f.timers.size, 0)
  await f.arena.handleButton(f.click('combo', 1)); assert.match(f.replies.at(-1).content, /ended or the bot restarted/)
  const g = fixture(); await start(g); g.arena.dispose(); assert.equal(g.timers.size, 0)
})

test('art uploads only on opening; compact embeds and long Combo chains stay inside Discord limits', async () => {
  const f = fixture(); await start(f); await f.tick()
  assert.deepEqual(f.replies[0].files.map(file => file.name), ['arena-maxim.png', 'arena-marq.png'])
  for (const file of f.replies[0].files) assert.ok(require('node:fs').existsSync(file.attachment))
  for (const view of [f.replies[0], ...f.edits]) {
    assert.equal(view.embeds[0].data.image.url, 'attachment://arena-maxim.png')
    assert.equal(view.embeds[0].data.thumbnail.url, 'attachment://arena-marq.png')
  }
  for (const view of f.edits) assert.equal(view.files, undefined)
  const battle = advance(newBattle(), 'combo', sequence([...Array(600).fill(4), 1]))
  assert.equal(battle.bonus, 7203)
  const view = screen({ id: 's', revision: 0, battle }).embeds[0].data
  assert.ok(view.description.length < 4096)
  for (const field of view.fields) assert.ok(field.value.length <= 1024)
  assert.ok(JSON.stringify(view).length < 6000)
})

test('real command/dispatcher and registration remain development-guild-only', async t => {
  const command = require('../commands/Arena/Arena'), dispatcher = require('../events/InteractionCreate')
  const { offlineDefinitions } = require('../deploy-commands'), root = require('node:path').resolve(__dirname, '..')
  assert.ok(offlineDefinitions(root, 'development').some(item => item.name === 'arena'))
  assert.ok(!offlineDefinitions(root, 'production').some(item => item.name === 'arena'))
  const previous = { env: process.env.NODE_ENV, guild: process.env.GUILDID }
  t.after(() => { require('../services/arena/controller').arena.dispose(); for (const [key, value] of [['NODE_ENV', previous.env], ['GUILDID', previous.guild]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value
  } })
  const f = fixture(); process.env.NODE_ENV = 'production'; process.env.GUILDID = 'guild'; await command.execute(f.interaction)
  process.env.NODE_ENV = 'development'; await command.execute({ ...f.interaction, guildId: 'other' })
  await dispatcher.execute({ ...f.click('start', 0), isChatInputCommand: () => false, isButton: () => true, guildId: 'other' })
  assert.equal(f.replies.length, 3)
  await dispatcher.execute({ ...f.interaction, commandName: 'arena', isChatInputCommand: () => true, client: { commands: new Map([['arena', command]]) } })
  await dispatcher.execute({ ...f.click('start', 0), isChatInputCommand: () => false, isButton: () => true })
  assert.match(allText(last(f)), /Stress 6\/6/)
})

test('finished encounters show rewards placeholder and full history without battle bars, image or tie commentary', () => {
  let battle = newBattle()
  for (let i = 0; i < 50; i++) battle = advance(battle)
  assert.equal(battle.history.length, 150); assert.equal(battle.actions.length, 5)
  const view = screen({ id: 's', revision: 0, battle }), embed = view.embeds[0]
  assert.equal(embed.data.title, 'VICTORY'); assert.match(embed.data.description, /Rewards.*None — prototype/)
  const fullLog = embed.data.fields.map(field => field.value).join('\n')
  assert.match(fullLog, /\*\*50\.\*\*/)
  assert.ok(!allText(view).includes('Simultaneous')); assert.equal(embed.data.image, undefined)
  assert.equal(view.components[0].components.length, 2); assert.equal(view.content, '')
  assert.ok(embed.length <= 6000)
})

test('oversized result histories keep complete recent entries and respect field, count and total limits', () => {
  const battle = newBattle(); battle.status = 'defeat'; battle.tick = 1000
  battle.history = Array.from({ length: 3000 }, (_, i) => ({ kind: 'hit', tick: i + 1, actor: 'Maxim', target: 'Marq', damage: 5, stressLost: 1 }))
  const { fields, omitted } = historyFields(battle.history)
  assert.ok(omitted > 0); assert.ok(fields.length <= 25)
  for (const field of fields) assert.ok(field.value.length <= 1024)
  const view = screen({ id: 's', revision: 0, battle })
  assert.match(view.embeds[0].data.description, /earlier actions omitted/)
  assert.match(fields.at(-1).value, /\*\*3000\.\*\*/)
  assert.ok(view.embeds[0].length <= 6000)
})

test('renamed semantic emojis, distinct colored buttons and bracketed costs render with combo dice inside the log', () => {
  const config = require('../config/arena-emojis.json')
  const battle = advance(newBattle(1, { level: 5 }), 'combo', sequence([3, 4, 2]))
  const view = screen({ id: 's', revision: 0, guildId: config.guildId, battle }), embed = view.embeds[0].data
  assert.equal(view.content, '')
  assert.ok(embed.description.includes('<a:HOPE:1560258360136441967> Hope'))
  assert.ok(embed.description.includes('<a:FEAR:1560258383792046173> Fear'))
  assert.ok(embed.footer.icon_url.includes('1560258360136441967'))
  assert.equal(button(view, 'combo').data.label, 'Combo Strike [1 Stress]')
  assert.equal(button(view, 'hope').data.label, 'Hope Strike [1 Hope]')
  assert.equal(button(view, 'combo').data.style, 1); assert.equal(button(view, 'combo').data.emoji.name, '⚔️')
  assert.equal(button(view, 'hope').data.style, 3); assert.equal(button(view, 'hope').data.emoji.id, config.hope.id)
  assert.match(embed.fields.at(-1).value, /🔺3 \+ 🔺4 \+ 🔺2/)
  assert.ok(!allText(view).includes('🛑'))
  assert.ok(!embed.fields.some(field => field.name.startsWith('🔺 Combo')))
})

test('Idle rolls Duality Dice and earns Hope/Fear but never uses abilities or Fear attacks', () => {
  const noSpecial = () => { throw Error('Idle must never roll Combo Dice or Fear spending chance') }
  let battle = newBattle(0, { mode: 'idle' })
  const seed = battle
  assert.equal(actualAdvance(battle, 'combo', noSpecial, noSpecial, noSpecial), seed)
  assert.equal(actualAdvance(battle, 'hope', noSpecial, noSpecial, noSpecial), seed)
  const funded = newBattle(1, { mode: 'idle' })
  assert.equal(actualAdvance(funded, 'hope', noSpecial, noSpecial, noSpecial), funded)
  for (let i = 0; i < 50; i++) {
    battle = actualAdvance(battle, 'continue', noSpecial, sequence([6, 7]), noSpecial)
    assert.equal(battle.marq.hope, 0); assert.equal(battle.warrior.fear, i + 1)
    assert.equal(battle.marq.stress, 6); assert.equal(battle.warrior.stress, 6)
    assert.equal(battle.duality.total, 13); assert.equal(battle.fearSpent, 0)
    assert.equal(battle.marqDamage, 6); assert.equal(battle.maximDamage, 6)
  }
  assert.equal(battle.status, 'victory'); assert.equal(battle.tiedVictory, true)
  assert.equal(battle.history.length, 150); assert.equal(battle.mode, 'idle')
  assert.equal(actualAdvance(battle, 'continue', noSpecial, noSpecial, noSpecial), battle)
})

test('Idle start schedules faster ticks, has no combat buttons, rejects forged abilities and never auto-repeats', async () => {
  const f = fixture({ rollFearSpend: () => { throw Error('No Idle specials') } })
  await f.arena.execute(f.interaction)
  assert.equal(button(f.replies[0], 'idle').data.label, 'Idle')
  assert.equal(button(f.replies[0], 'idle').data.style, 3)
  await f.arena.handleButton(f.click('idle', 0))
  assert.deepEqual(last(f).components, []); assert.equal(f.delays.at(-1), 1000)
  await f.arena.handleButton(f.click('combo', 1))
  await f.arena.handleButton(f.click('hope', 1))
  await f.arena.handleButton(f.click('start', 1))
  assert.deepEqual(last(f).components, [])
  for (let i = 0; i < 50; i++) await f.tick()
  assert.equal(f.timers.size, 0); assert.equal(last(f).embeds[0].data.title, 'VICTORY')
  assert.ok(button(last(f), 'idle')); assert.ok(button(last(f), 'start'))
  assert.equal(button(last(f), 'idle').data.style, 3)
  assert.ok(!last(f).embeds[0].data.fields?.length)
  assert.match(last(f).embeds[0].data.description, /None — prototype/)
  assert.ok(f.delays.every(delay => delay === 1000))
  await f.arena.handleButton(f.click('start', 1))
  assert.equal(f.delays.at(-1), 4000); assert.ok(button(last(f), 'combo'))
})

test('Idle misses, criticals and enemy turns follow every Duality pair while specials stay disabled', () => {
  for (let hope = 1; hope <= 12; hope++) for (let fear = 1; fear <= 12; fear++) {
    const battle = actualAdvance(newBattle(0, { mode: 'idle' }), 'continue', undefined, sequence([hope, fear]), () => { throw Error('No Fear spending') })
    const success = hope === fear || hope + fear >= 12
    assert.equal(battle.warrior.hp, success ? 294 : 300)
    assert.equal(battle.marq.hp, !success || fear > hope ? 294 : 300)
    assert.equal(battle.marq.hope, hope >= fear ? 1 : 0)
    assert.equal(battle.warrior.fear, fear > hope ? 1 : 0)
    assert.equal(battle.fearAttack, null); assert.equal(battle.stressLost, 0)
  }
})

test('Idle can lose on misses and its defeat screen contains no combat log', async () => {
  let roll = 0
  const f = fixture({ rollDuality: () => ++roll % 2 ? 3 : 4 })
  await f.arena.execute(f.interaction); await f.arena.handleButton(f.click('idle', 0))
  await f.tick(); assert.match(last(f).embeds[0].data.description, /Failure with Fear/)
  for (let i = 1; i < 50 && f.timers.size; i++) await f.tick()
  assert.equal(last(f).embeds[0].data.title, 'DEFEAT')
  assert.ok(!last(f).embeds[0].data.fields?.length)
  assert.equal(f.timers.size, 0); assert.equal(button(last(f), 'idle').data.style, 3)
})

test('Idle does not overlap network updates even when a message edit is slower than a tick', async () => {
  const f = fixture(); await f.arena.execute(f.interaction); await f.arena.handleButton(f.click('idle', 0))
  let release
  f.interaction.editReply = payload => { f.edits.push(payload); return new Promise(resolve => { release = resolve }) }
  const pending = f.tick(); await Promise.resolve(); await Promise.resolve()
  assert.equal(f.timers.size, 0)
  f.interaction.editReply = async payload => f.edits.push(payload)
  release(); await pending
  assert.equal(f.timers.size, 1); assert.equal(f.delays.at(-1), 1000)
  f.arena.dispose()
})

test('character catalog includes every Spooky badge plus Classic Selene with verified files and unique stable IDs', () => {
  const { characters, defaultCharacter, resolveCharacter, characterChoices } = require('../services/arena/characters')
  const badges = require('../config/badges.json').badges
  assert.equal(characters.length, badges.length + 1); assert.equal(new Set(characters.map(item => item.id)).size, characters.length)
  assert.equal(defaultCharacter.name, 'Marq'); assert.equal(resolveCharacter().id, defaultCharacter.id)
  assert.equal(resolveCharacter('Maxim [Spooky]').id, 'spooky-2026:max')
  assert.equal(resolveCharacter('selene [classic]').id, 'classic:sel')
  assert.equal(resolveCharacter('Selene'), null); assert.equal(resolveCharacter('unknown'), null)
  for (const character of characters) assert.ok(require('node:fs').existsSync(character.image))
  assert.equal(characterChoices('spooky').length, 7)
  assert.deepEqual(characterChoices('CLASSIC').map(item => item.name), ['Selene [Classic]'])
  assert.deepEqual(characterChoices('selene').map(item => item.name), ['Selene [Spooky]', 'Selene [Classic]'])
  assert.ok(characterChoices().length <= 25)
})

test('selected character controls the art, combat names and rematch while keeping the shared prototype kit', async () => {
  const { resolveCharacter } = require('../services/arena/characters')
  const character = resolveCharacter('Selene [Classic]'), f = fixture()
  await f.arena.execute(f.interaction, character)
  assert.ok(f.replies[0].files[1].attachment.endsWith('selene_badge.png'))
  assert.match(allText(f.replies[0]), /Selene \[Classic\]/)
  await f.arena.handleButton(f.click('idle', 0)); await f.tick()
  assert.match(allText(last(f)), /Selene hit Maxim for 6/)
  for (let i = 1; i < 50; i++) await f.tick()
  await f.arena.handleButton(f.click('start', 1))
  assert.match(last(f).embeds[0].data.title, /Selene vs Maxim/)
  assert.equal(button(last(f), 'combo').data.label, 'Combo Strike [1 Stress]')
  f.arena.dispose()
  const maxim = newBattle(0, { character: resolveCharacter('Maxim [Spooky]') })
  assert.ok(advance(maxim).history.some(event => event.actor === 'Your Maxim'))
})

test('autocomplete uses the real dispatcher, rejects production/wrong guild, and unknown character text opens no fight', async t => {
  const command = require('../commands/Arena/Arena'), dispatcher = require('../events/InteractionCreate')
  const previous = { env: process.env.NODE_ENV, guild: process.env.GUILDID }
  t.after(() => { for (const [key, value] of [['NODE_ENV', previous.env], ['GUILDID', previous.guild]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value
  } })
  const responses = [], replies = []
  const interaction = { commandName: 'arena', guildId: 'dev', isAutocomplete: () => true,
    options: { getFocused: () => 'selene' }, respond: async choices => responses.push(choices),
    client: { commands: new Map([['arena', command]]) } }
  process.env.NODE_ENV = 'development'; process.env.GUILDID = 'dev'
  await dispatcher.execute(interaction); assert.equal(responses.at(-1).length, 2)
  await dispatcher.execute({ ...interaction, guildId: 'wrong' }); assert.deepEqual(responses.at(-1), [])
  process.env.NODE_ENV = 'production'
  await command.autocomplete(interaction); assert.deepEqual(responses.at(-1), [])
  process.env.NODE_ENV = 'development'
  await command.execute({ guildId: 'dev', options: { getString: () => 'invalid variant' }, reply: async payload => replies.push(payload) })
  assert.match(replies[0].content, /autocomplete/); assert.equal(replies[0].ephemeral, true)
  const option = command.data.toJSON().options.find(item => item.name === 'character')
  assert.equal(option.autocomplete, true); assert.ok(!option.required)
})
