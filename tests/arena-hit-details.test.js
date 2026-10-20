// Recorded-event presentation only; no combat rolls, engine calls or simulations.
const test = require('node:test')
const assert = require('node:assert/strict')
const { actionLines } = require('../services/arena/interface')
const { reportLines } = require('../services/arena/battle-report')
const hit = outcomes => ({kind:'hit',tick:1,actor:'Hendrix',target:'Maxim',damage:12,outcome:'hit',strikes:outcomes.map(outcome=>({outcome}))})

test('three-strike Hendrix basics and Dawn sequences show every outcome in order in both modes', () => {
  const event = hit(['block','block','hit'])
  for (const diagnostic of [true,false]) {
    const text = reportLines([event],actionLines,{diagnostic}).join(' ')
    assert.match(text, /damage \(block, block, hit\)/)
    assert.doesNotMatch(text, /\(blocked\)|block \/ block/)
  }
})
test('six-strike Flurry preserves crit and bleed details while its guaranteed bonus stays separate', () => {
  const event = {...hit(['block','critical','hit','hit','block','critical']),bleeding:true,stressedTargetMultiplier:1.25}
  const bonus = {kind:'special',tick:1,actor:'Hendrix',name:'Flurry of Blows',type:'flurry',slot:'special2',damage:13,resource:'Hope',cost:2}
  for (const diagnostic of [true,false]) {
    const text = reportLines([event,bonus],actionLines,{diagnostic}).join(' ')
    assert.match(text, /\(block, crit, hit, hit, block, crit\) \(bleed\) \(exposed\)/)
    assert.match(text, /\*\*FLURRY OF BLOWS\*\*/)
    assert.match(text, /13\*?\*? guaranteed bonus damage/)
  }
})
test('Combo Strike keeps red triangle dice in parentheses with diagnostic off and on', () => {
  const event = {kind:'special',tick:1,actor:'Marq',name:'Combo Strike',type:'combo',slot:'special2',damage:20,resource:'Hope',cost:2,rolls:[2,1],flatPercent:8,percent:11,outcome:'block'}
  for (const diagnostic of [true,false]) {
    const text = reportLines([event],actionLines,{diagnostic}).join(' ')
    assert.match(text, /\*\*COMBO STRIKE\*\*/)
    assert.match(text, /\(🔺2 \+ 🔺1\)/)
    assert.match(text, /\(blocked\)/)
  }
})
