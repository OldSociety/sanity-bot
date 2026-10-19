// Historical kit regression: keep the prior global outcome profile explicit.
const loader = require('../../services/arena/balance-config')
const legacyLoad = loader.loadBalance
loader.loadBalance = (...args) => {
  const value = legacyLoad(...args)
  delete value.attackOutcomes
  return value
}
const assert = require('node:assert/strict')
const {
  newBattle,
  advance,
  takeTurn,
  beginFinisher,
} = require('../../services/arena/combat')
const {
  resolveCharacter,
  isSelectable,
} = require('../../services/arena/characters')
const { canUse, kitFor } = require('../../services/arena/rules')
const { basicDamage, specialDamage } = require('../../services/arena/damage')
const { statusIcons } = require('../../services/arena/status-icons')
const {
  screen,
  actionLines,
  fallbackStatus,
} = require('../../services/arena/interface')
const {
  cardData,
  cardSvg,
  renderHealthCard,
} = require('../../services/arena/health-card')
const { preview } = require('../../services/arena/tactics')
const character = resolveCharacter('Hellfed Marq')
const { simulate } = require('../../scripts/hellfed-rage-report')
const simulationOptions = { trials: 3, seed: 42 }
assert.deepEqual(simulate(simulationOptions), simulate(simulationOptions))
const fresh = () => newBattle(6, { character, opponent: 'marq' })
const nope = () => {
  throw Error('Unexpected RNG')
}
const ability = (battle, slot, effect = () => 99) => {
  let diceIndex = 0
  return advance(
    battle,
    slot,
    nope,
    slot === 'special1' ? () => [7, 5][diceIndex++] : nope,
    nope,
    nope,
    nope,
    effect,
    {
      actor: 'ability',
    }
  )
}
assert.equal(isSelectable(character), true)
assert.throws(() => newBattle(0, { character, mode: 'idle' }), /active/)
assert.equal(newBattle(0, { opponent: character.id }).enemy.maxStress, 0)
let b = fresh()
assert.equal(b.player.hp, 260)
assert.equal(b.player.attack, 200)
assert.equal(b.player.rage, 0)
assert.equal(b.player.maxHope, 6)
assert.equal(b.player.maxStress, 0)
const s1 = ability(b, 'special1')
assert.equal(s1.player.hp, 257)
assert.equal(s1.player.rage, 1)
assert.equal(s1.player.hope, 6)
assert.equal(s1.enemy.fear, 0)
assert.equal(s1.duality.total, 12)
assert.equal(s1.playerBasicDamage, 6)
assert.equal(s1.special1Damage, 0)
assert.equal(s1.player.criticalReady, false)
assert.equal(s1.history.length, 4)
assert.equal(s1.statistics.player.attempts.basic, 1)
assert.equal(s1.statistics.player.generated, 0)
assert.match(actionLines(s1.history).join(''), /Sacrificed 3 HP/)
assert.match(actionLines(s1.history).join(''), /Gained 1 Rage · Rage 1\/3/)
let responseDice = 0
const response = takeTurn(
  b,
  'special1',
  nope,
  () => [7, 5][responseDice++],
  () => 99,
  () => 0,
  () => 99,
  () => 99,
  { rollRecovery: () => 99 }
)
assert.equal(response.player.hp, 251)
assert.equal(response.enemyOutcome, 'hit')
assert.equal(response.enemy.opportunityReady, false)
assert.equal(response.history.filter((e) => e.kind === 'roll').length, 1)
for (const hp of [1, 2, 3]) {
  const low = fresh()
  low.player.hp = hp
  assert.equal(canUse(low.player, 'special1'), false)
  assert.equal(ability(low, 'special1'), low)
}
b = fresh()
b.player.hp = 4
assert.equal(ability(b, 'special1').player.hp, 1)
b = fresh()
b.player.rage = 3
assert.equal(canUse(b.player, 'special1'), false)
assert.equal(ability(b, 'special1'), b)
// S1 converts failed basics to hits while keeping the original dice resource.
for (const [rage, dice, expected] of [
  [0, [7, 5], 1],
  [0, [1, 2], 1],
  [1, [1, 2], 2],
  [2, [7, 5], 3],
  [2, [1, 2], 3],
]) {
  const before = newBattle(0, { character, opponent: 'maxim' })
  before.player.rage = rage
  let index = 0
  const after = advance(
    before,
    'special1',
    nope,
    () => dice[index++],
    nope,
    nope,
    nope,
    nope,
    { actor: 'ability' }
  )
  assert.equal(after.player.rage, expected)
  assert.equal(after.player.hp, 260 - Math.ceil((260 * (rage + 1)) / 100))
  assert.equal(after.playerBasicDamage, 6)
  assert.equal(after.statistics.player.hits.basic, 1)
  assert.equal(after.player.criticalReady, false)
  assert.equal(after.enemy.opportunityReady, false)
  assert.equal(index, 2)
  assert.equal(after.statistics.player.attempts.basic, 1)
  assert.equal(after.hopeGained, Number(dice[0] >= dice[1]))
  assert.equal(after.fearGained, Number(dice[1] > dice[0]))
  assert.equal(after.history[0].kind, 'sacrifice')
  assert.equal(after.history.at(-1).kind, 'special')
  const lossIndex = after.history.findIndex(
    (event) => event.kind === 'rageMiss'
  )
  assert.equal(lossIndex, -1)
  assert.equal(after.duality.success, dice[0] + dice[1] >= 12)
}
const criticalSeed = newBattle(0, { character, opponent: 'maxim' })
criticalSeed.player.rage = 2
const criticalStoke = advance(
  criticalSeed,
  'special1',
  nope,
  () => 6,
  nope,
  nope,
  nope,
  nope,
  { actor: 'ability' }
)
assert.equal(criticalStoke.player.rage, 3)
assert.equal(criticalStoke.player.hope, 1)
assert.equal(criticalStoke.player.criticalReady, true)
assert.equal(criticalStoke.player.stress, 0)
assert.equal(criticalStoke.enemy.stress, 5)
assert.equal(criticalStoke.playerBasicDamage, 6)
criticalSeed.player.criticalReady = true
const savedCritical = ability(criticalSeed, 'special1')
assert.equal(savedCritical.playerBasicDamage, 12)
assert.equal(savedCritical.player.criticalReady, false)
assert.equal(savedCritical.player.rage, 3)
let guaranteedMissDice = 0
const savedOnFailedRoll = advance(
  criticalSeed,
  'special1',
  nope,
  () => [1, 2][guaranteedMissDice++],
  nope,
  nope,
  nope,
  nope,
  { actor: 'ability' }
)
assert.equal(savedOnFailedRoll.duality.success, false)
assert.equal(savedOnFailedRoll.playerBasicDamage, 12)
assert.equal(savedOnFailedRoll.player.criticalReady, false)
assert.equal(savedOnFailedRoll.player.rage, 3)
assert.equal(
  preview(criticalSeed.player, criticalSeed.enemy, 'special1').expected,
  12
)
assert.equal(
  preview(criticalSeed.player, criticalSeed.enemy, 'special1').minimum,
  12
)
for (let hope = 1; hope <= 12; hope++)
  for (let fear = 1; fear <= 12; fear++) {
    const diceSeed = newBattle(0, { character })
    diceSeed.player.rage = 2
    let d = 0
    const result = advance(
      diceSeed,
      'special1',
      nope,
      () => [hope, fear][d++],
      nope,
      nope,
      nope,
      nope,
      { actor: 'ability' }
    )
    assert.equal(result.duality.success, hope === fear || hope + fear >= 12)
    assert.equal(result.hopeGained, Number(hope >= fear))
    assert.equal(result.fearGained, Number(fear > hope))
    assert.equal(result.player.criticalReady, hope === fear)
    assert.equal(result.statistics.player.hits.basic, 1)
    assert.equal(result.playerBasicDamage, 6)
    assert.equal(result.player.rage, 3)
  }
const lethalStokeSeed = newBattle(0, { character, opponent: 'maxim' })
lethalStokeSeed.enemy.hp = 1
const lethalStoke = takeTurn(
  lethalStokeSeed,
  'special1',
  nope,
  () => 6,
  nope,
  nope,
  nope,
  nope
)
assert.equal(lethalStoke.status, 'victory')
assert.equal(lethalStoke.player.hp, 257)
assert.equal(lethalStoke.player.rage, 1)
assert.equal(lethalStoke.statistics.enemy.attempts.basic, 0)
const missedStokeSeed = newBattle(0, { character, opponent: 'maxim' })
let missedStokeDice = 0
const missedStoke = takeTurn(
  missedStokeSeed,
  'special1',
  nope,
  () => [1, 2][missedStokeDice++],
  () => 99,
  () => 0,
  () => 99,
  nope,
  { rollRecovery: () => 99, aiPolicy: 'legacy' }
)
assert.equal(missedStoke.fearGained, 1)
assert.equal(missedStoke.enemy.fear, 1)
assert.equal(missedStoke.player.rage, 1)
assert.equal(missedStoke.enemyDamage, 7) // Guaranteed hit cannot arm Opportunity.
// Scale from maximum, never current HP, and revalidate at the exact threshold.
const { healthCost } = require('../../services/arena/resources')
for (const level of [1, 2, 10, 60]) {
  for (const rage of [0, 1, 2]) {
    const scaled = newBattle(0, { character, level })
    scaled.player.rage = rage
    const cost = Math.ceil((scaled.player.maxHp * (rage + 1)) / 100)
    assert.equal(
      healthCost(scaled.player, kitFor(scaled.player).special1),
      cost
    )
    scaled.player.hp = cost
    assert.equal(canUse(scaled.player, 'special1'), false)
    assert.equal(ability(scaled, 'special1'), scaled)
    scaled.player.hp = cost + 1
    assert.equal(ability(scaled, 'special1').player.hp, 1)
  }
}
for (let rage = 0; rage <= 3; rage++) {
  b = fresh()
  b.player.rage = rage
  const hitDice = [7, 5]
  let i = 0
  const hit = advance(b, {}, nope, () => hitDice[i++], nope, nope, nope, nope, {
    actor: 'player',
  })
  assert.equal(hit.player.rage, rage)
  const miss = advance(b, {}, nope, () => 1, nope, nope, nope, nope, {
    actor: 'player',
  })
  // Equal dice are critical successes, even at total 2.
  assert.equal(miss.player.rage, rage)
  i = 0
  const dice = [1, 2]
  const failed = advance(b, {}, nope, () => dice[i++], nope, nope, nope, nope, {
    actor: 'player',
  })
  assert.equal(failed.player.rage, Math.max(0, rage - 1))
  assert.equal(failed.player.stress, 0)
  assert.equal(miss.stressRestored, 0)
  assert.equal(miss.player.stress, 0)
  assert.equal(
    statusIcons(b.player).some((e) => e.type === 'exposed'),
    false
  )
  assert.equal(basicDamage(b.enemy, b.player), 6)
  assert.equal(
    preview(b.enemy, b.player).expected,
    preview(b.enemy, { ...b.player, stress: 6 }).expected
  )
  for (const slot of ['special2', 'special3']) {
    const pct = slot === 'special2' ? 16 + rage * 6 : 45 + rage * 8
    assert.equal(specialDamage(b.player, slot, { choice: 3 }).percent, pct)
    const next =
      slot === 'special3'
        ? ability(beginFinisher(b), { special3: true, choice: 3 })
        : ability(b, slot)
    assert.equal(next.player.rage, rage)
    assert.equal(next.player.hp, 260)
    assert.equal(next[`${slot}Damage`], pct * 2)
    assert.equal(next.player.hope, slot === 'special2' ? 4 : 1)
    assert.equal(next.statistics.player.attempts.basic, 0)
    assert.equal(next.hopeGained, 0)
    assert.equal(next.fearGained, 0)
  }
  for (let choice = 0; choice <= 5; choice++) {
    const next = ability(beginFinisher(b), { special3: true, choice })
    assert.equal(next.special3Damage, (30 + choice * 5 + rage * 8) * 2)
  }
  const enemy = advance(
    b,
    {},
    () => 1,
    nope,
    () => 99,
    () => 0,
    () => 0,
    () => 0,
    { actor: 'enemy', aiPolicy: 'legacy', rollRecovery: () => 99 }
  )
  assert.equal(enemy.player.rage, rage)
  assert.equal(enemy.enemyDamage, 12)
  const removal = advance(
    b,
    {},
    () => 1,
    nope,
    () => 0,
    () => 0,
    () => 99,
    () => 0,
    { actor: 'enemy', aiPolicy: 'legacy', rollRecovery: () => 99 }
  )
  assert.equal(removal.enemySpecial, 'special1')
  assert.equal(removal.enemyStressRemoved, 0)
  assert.equal(removal.player.rage, rage)
  assert.equal(removal.player.stress, 0)
  const session = {
    id: 'rage',
    revision: 0,
    battle: b,
    character,
    opponent: 'marq',
  }
  const data = cardData(session),
    svg = cardSvg(data)
  assert.match(svg, new RegExp(`Rage ${rage}/3`))
  assert.equal((svg.match(/fill="#ed4747"/g) || []).length, rage)
  assert.equal((svg.match(/width="37" height="8"/g) || []).length, 3)
  assert.ok(data.fighters[0].icons.some((icon) => icon.type === 'rage'))
  assert.match(fallbackStatus(b)[0].value, new RegExp(`Rage ${rage}/3`))
  assert.doesNotMatch(fallbackStatus(b)[0].value, /Stress|Takes/)
  assert.match(
    screen(session)
      .components.flatMap((r) => r.components)
      .find((v) => v.data.label?.includes('Stoke')).data.label,
    new RegExp(`${[3, 6, 8, 8][rage]} HP`)
  )
}
b = fresh()
assert.equal(ability(b, 'special2', () => 0).enemy.stress, 5)
const immune = fresh()
immune.enemy.kit = 'hellfed-marq'
immune.enemy.stress = 0
immune.enemy.maxStress = 0
assert.equal(ability(immune, 'special2', () => 0).stressRemoved, 0)
assert.equal(kitFor(newBattle().player).special2.hopeCost, 2)
assert.equal(
  kitFor(newBattle(0, { character: resolveCharacter('Maxim') }).player).special2
    .percent,
  7
)
// Pixel preview produced by the same renderer used for Discord.
;(async () => {
  const fs = require('node:fs')
  fs.mkdirSync('artifacts/hellfed-rage', { recursive: true })
  const battle = fresh()
  battle.player.rage = 2
  const rendered = await renderHealthCard({
    battle,
    character,
    opponent: 'marq',
  })
  fs.writeFileSync('artifacts/hellfed-rage/preview.png', rendered.attachment)
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
