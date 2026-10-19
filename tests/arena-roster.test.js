const test = require('node:test')
const assert = require('node:assert/strict')
// Configure another kit before loading the engine. No UI code knows these names.
const balance = require('../config/arena/arena-balance.json')
balance.characters['roster-fixture'] = structuredClone(balance.characters.maxim)
balance.ai.characters['roster-fixture'] = structuredClone(balance.ai.characters.maxim)
balance.baseStats['roster-fixture'] = { ...balance.baseStats.maxim }
for (const [index, slot] of ['special1', 'special2', 'special3'].entries()) {
  balance.characters['roster-fixture'][slot].name = `Roster ability ${index + 1}`
  balance.ai.characters['roster-fixture'][slot].name = `Enemy ability ${index + 1}`
}
balance.passives['on-the-brink'].name = 'Roster rescue'
const { newBattle, beginFinisher, advance } = require('../services/arena/combat')
const { screen, actionLog } = require('../services/arena/interface')
const { resolveCharacter } = require('../services/arena/characters')
const { combatReport } = require('../services/arena/statistics')
const fixtureCharacter = { ...resolveCharacter('Maxim'), kit: 'roster-fixture', name: 'Another fighter' }

test('battle creation, a tick, paid finisher and reports use generic actor keys', () => {
  const before = newBattle(6, { character: fixtureCharacter })
  for (const key of ['marq', 'warrior', 'marqDamage', 'maximDamage']) assert.ok(!(key in before))
  const paid = beginFinisher(before)
  assert.equal(before.player.hope, 6)
  assert.equal(paid.player.hope, 0)
  assert.equal(paid.enemy, before.enemy)
  let i = 0
  const next = advance(paid, { special3: true, choice: 5 }, undefined,
    () => [2, 3][i++], () => 99.999, () => 99, () => 99, () => 99.999,
    { rollRecovery: () => 99.999, aiPolicy: 'legacy', rollFinisher: () => 45 })
  assert.equal(next.tick, 1)
  assert.equal(next.special3Damage, 121)
  assert.equal(next.playerBasicDamage, 0)
  assert.equal(next.enemy.hp, before.enemy.hp - 121)
  assert.equal(combatReport(next).player.spent, 6)
  assert.match(actionLog(next.history), /Roster ability 3: picked 5/)
})

test('finisher prompts, buttons and active buff labels read the selected kit', () => {
  const battle = newBattle(6, { character: fixtureCharacter })
  battle.player.slayerCharges = 2
  const view = screen({ id: 'generic', revision: 0, battle,
    character: fixtureCharacter, minigame: { order: [1, 2, 3, 4, 5], revision: 0 } })
  assert.match(view.embeds[0].data.description, /Roster ability 3/)
  assert.equal(require('../services/arena/health-card').cardData({ battle, character: fixtureCharacter }).fighters[0].icons.some(icon => icon.type === 'slayer'), true)
  const ordinary = screen({ id: 'generic', revision: 0, battle, character: fixtureCharacter })
  const labels = ordinary.components.flatMap(row => row.components).map(item => item.data.label)
  assert.ok(labels.some(label => label.startsWith('Roster ability 1')))
  assert.ok(labels.some(label => label.startsWith('Roster ability 3')))
})

test('AI special and survival logs use configuration names', () => {
  const battle = newBattle()
  battle.player.hp = 1
  battle.enemy.kit = 'roster-fixture'
  battle.enemy.fear = 5
  let i = 0
  const next = advance(battle, 'continue', undefined, () => [2, 3][i++],
    () => 0, () => 99, () => 99, () => 99.999, { rollRecovery: () => 99.999, aiPolicy: 'legacy', rollFinisher: () => 45 })
  assert.match(actionLog(next.history), /Enemy ability 3/)
  assert.match(actionLog(next.history), /ROSTER RESCUE/)
  assert.equal(next.player.brinkUsed, true)
})
