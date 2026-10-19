const test = require('node:test'),
  assert = require('node:assert/strict')
process.env.NODE_ENV = 'development'
const {
  resolveCharacter,
  characterChoices,
  isSelectable,
} = require('../services/arena/characters')
const { balance } = require('../services/arena/rules')
const { newBattle } = require('../services/arena/combat')
test('Hendrix has one finished identity, preserving his saved variant ID', () => {
  const c = resolveCharacter('Hendrix')
  assert.equal(c.id, 'classic:hen')
  assert.equal(c.name, 'Hendrix')
  assert.equal(c.kit, 'classic-hendrix')
  assert.equal(resolveCharacter('Hendrix [Template]'), null)
  assert.equal(resolveCharacter('classic:hen'), c)
  assert(
    require('../config/arena/characters/arena-template-development.json').identity.family !==
      'hendrix'
  )
})
test('Template is an independent placeholder hidden from every development picker', () => {
  const c = resolveCharacter('Template'),
    h = resolveCharacter('Hendrix')
  assert(c)
  assert.notEqual(c.id, h.id)
  assert.notEqual(c.kit, h.kit)
  assert.equal(c.name, 'Template')
  assert.equal(isSelectable(c), false)
  assert.deepEqual(characterChoices('Template'), [])
  assert(
    !require('../services/arena/opponents')
      .availableOpponents()
      .some((o) => o.id === c.id)
  )
  assert(
    !require('../services/arena/selection').roster.some(
      (f) => f.id === 'template'
    )
  )
  const b = newBattle(0, { character: c, opponent: 'Maxim' })
  assert.deepEqual(
    [b.player.hp, b.player.attack, b.player.maxStress],
    [200, 200, 6]
  )
  assert.equal(balance.characters[c.kit].special1.percent, 8)
  assert.equal(balance.characters[c.kit].special2.percent, 24)
})
test('current character and skin payloads expose Hendrix combat abilities without a template label', () => {
  const { screen } = require('../services/arena/interface')
  for (const page of ['characters', 'skins']) {
    const payload = JSON.stringify(
      screen({
        id: 'split',
        revision: 0,
        character: resolveCharacter('Hendrix'),
        opponent: 'Maxim',
        level: 1,
        page,
      })
    )
    assert(!/Template/.test(payload))
    if (page === 'skins') {
      assert(payload.includes('Dawn'))
      assert(payload.includes('Flurry'))
      assert(payload.includes('minimum after Block'))
    }
  }
})
test('Hendrix alone gets the post-Block direct minimum; Bleeding and global floor stay separate', () => {
  const { strike } = require('../services/arena/hendrix'),
    { blockedDamage, basic_damage } = require('../services/arena/damage-types')
  for (const attack of [1, 99, 199, 200, 250])
    for (const outcome of ['hit', 'block', 'critical']) {
      const s = strike({ attack }, outcome, false)
      assert(s.direct >= 2)
      assert.equal(s.bleed, 0)
      assert(s.prevented >= 0)
    }
  assert.deepEqual(
    ['hit', 'block', 'critical'].map(
      (o) => strike({ attack: 200 }, o, true).damage
    ),
    [4, 4, 8]
  )
  assert.equal(strike({ attack: 199 }, 'block', true).bleed, 1)
  assert.equal(strike({ attack: 400 }, 'block', false).direct, 3)
  assert.equal(blockedDamage(2, basic_damage), 1)
  assert.equal(balance.damageRounding, 'floor')
})
