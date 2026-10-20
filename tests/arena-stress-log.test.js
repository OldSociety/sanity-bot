// Presentation fixtures only: no combat exchanges or simulations.
const test = require('node:test')
const assert = require('node:assert/strict')
const { actionLines } = require('../services/arena/interface')
const { reportLines } = require('../services/arena/battle-report')

test('all special log branches emphasize the actual ability name', () => {
  for (const type of ['heal', 'windWall', 'rage', 'combo', 'buff', 'direct', 'bleeding', 'playerFinisher']) {
    const event = {
      kind: 'special', tick: 1, actor: 'Selene', name: 'Fixture Ability',
      type, slot: type === 'playerFinisher' ? 'special3' : 'special1',
      resource: 'Hope', cost: 1, damage: 19, healing: 26, hits: 3,
      percent: 55, choice: 5, rolls: [3, 2], rage: 1,
    }
    assert.match(actionLines([event])[0], /\*\*FIXTURE ABILITY\*\*/)
    assert.match(reportLines([event], actionLines, { diagnostic: false }).join(' '), /\*\*FIXTURE ABILITY\*\*/)
  }
})

test('both log modes retain zero-Stress cause and extra-damage reminders', () => {
  const events = [
    { kind: 'stressed', tick: 14, actor: 'Maxim', multiplier: 1.25,
      sources: [{ actor: 'Selene', type: 'critical', amount: 1 }] },
    { kind: 'hit', tick: 14, actor: 'Selene', target: 'Maxim',
      outcome: 'critical', damage: 19, stressedTargetMultiplier: 1.25 },
    { kind: 'special', tick: 14, actor: 'Selene', name: "Storm's Eye",
      type: 'playerFinisher', slot: 'special3', resource: 'Hope', cost: 5,
      choice: 5, percent: 55, damage: 178, stressedTargetMultiplier: 1.25 },
  ]
  for (const diagnostic of [true, false]) {
    const text = reportLines(events, actionLines, { diagnostic }).join(' ')
    assert.match(text, /Maxim became \*\*Stressed\*\* \(0 Stress\)/)
    assert.match(text, /Selene's critical basic removed 1 Stress/)
    assert.match(text, /\+25% damage taken/)
    assert.equal((text.match(/\(exposed\)/g) || []).length, 2)
  }
})

test('cost and ability sources identify their owner and special; recovery ends the penalty', () => {
  const text = actionLines([
    { kind: 'stressed', tick: 2, actor: 'Your Maxim', multiplier: 1.25,
      sources: [
        { actor: 'Your Maxim', type: 'cost', amount: 2, name: 'Deadly Focus' },
        { actor: 'Maxim', type: 'ability', amount: 1, name: 'Stress Strike' },
      ] },
    { kind: 'stressRelief', tick: 3, actor: 'Your Maxim', stress: 1 },
  ]).join(' ')
  assert.match(text, /Your Maxim spent 2 Stress on \*\*DEADLY FOCUS\*\*/)
  assert.match(text, /Maxim's \*\*STRESS STRIKE\*\* removed 1 Stress/)
  assert.match(text, /\*\*no longer Stressed\*\* \(1 Stress\)/)
})

test('special logs display the actual multi-point Stress removal amount', () => {
  const line = actionLines([{
    kind: 'special', tick: 1, actor: 'Marq', name: 'Overwhelm',
    type: 'direct', slot: 'special1', damage: 7, stressRemoved: 2,
    resource: 'Stress', cost: 1, outcome: 'hit',
  }])[0]
  assert.match(line, /\*\*OVERWHELM\*\*/)
  assert.match(line, /Removed 2 opponent Stress/)
})
