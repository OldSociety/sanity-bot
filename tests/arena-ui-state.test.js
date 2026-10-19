const test = require('node:test')
const assert = require('node:assert/strict')
const { newBattle, advance } = require('../services/arena/combat')
const { statusIcons } = require('../services/arena/status-icons')
const { cardData, cardName, cardSvg } = require('../services/arena/health-card')
test('AI Slayer indicator follows all three landed attacks and survives misses', () => {
  let battle = newBattle(0, { opponent: 'maxim' })
  battle.enemy.fear = 3
  const response = (b, ability, accuracy) =>
    advance(
      b,
      {},
      () => 1,
      () => 6,
      () => ability,
      () => accuracy,
      () => 99,
      () => 99,
      { actor: 'enemy', aiPolicy: 'legacy', rollRecovery: () => 99 }
    )
  battle = response(battle, 0, 0)
  assert.equal(battle.enemySpecial, 'special2')
  assert.equal(battle.enemy.slayerCharges, 3)
  const session = (b) => ({ battle: b })
  const before = cardName(session(battle))
  const data = cardData(session(battle))
  assert.equal(
    data.fighters[1].icons.find((i) => i.type === 'slayer').value,
    '3'
  )
  assert.match(cardSvg(data), />3<\/text>/)
  const onlyChargeChanged = structuredClone(battle)
  onlyChargeChanged.enemy.slayerCharges = 2
  assert.notEqual(cardName(session(onlyChargeChanged)), before)
  battle = response(battle, 99, 99)
  assert.equal(battle.enemy.slayerCharges, 3)
  for (const remaining of [2, 1, 0]) {
    battle = response(battle, 99, 0)
    const icon = statusIcons(battle.enemy).find((i) => i.type === 'slayer')
    assert.equal(icon?.value, remaining ? String(remaining) : undefined)
  }
})
test('critical icon represents stored player bonus, never an immediate enemy critical', () => {
  let battle = newBattle()
  battle = advance(
    battle,
    {},
    () => 1,
    () => 6,
    undefined,
    undefined,
    undefined,
    undefined,
    { actor: 'player' }
  )
  assert.ok(statusIcons(battle.player).some((i) => i.type === 'critical'))
  let index = 0
  battle = advance(
    battle,
    {},
    () => 1,
    () => [6, 7][index++],
    undefined,
    undefined,
    undefined,
    undefined,
    { actor: 'player' }
  )
  assert.equal(
    statusIcons(battle.player).some((i) => i.type === 'critical'),
    false
  )
  assert.equal(
    statusIcons({ isAI: true, criticalReady: true }).some(
      (i) => i.type === 'critical'
    ),
    false
  )
})
