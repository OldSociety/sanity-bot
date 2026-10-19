const test = require('node:test'),
  assert = require('node:assert/strict')
const { sheets } = require('../services/arena/character-config')
const { loadBalance } = require('../services/arena/balance-config')
test('development fighters share the same build-file sections and unique kit identifiers', () => {
  const kits = new Set()
  for (const sheet of Object.values(sheets)) {
    assert.equal(typeof sheet.enabled, 'boolean')
    assert.equal(typeof sheet.identity.name, 'string')
    assert(!kits.has(sheet.identity.kit))
    kits.add(sheet.identity.kit)
    for (const key of ['hp', 'attack']) assert(sheet.baseStats[key] > 0)
    for (const slot of ['special1', 'special2', 'special3'])
      assert(sheet.abilities[slot].type)
  }
  assert.equal(sheets.template.identity.hidden, true)
})
test('editing a fighter sheet changes both roles without affecting other fighters or production', () => {
  const baseline = loadBalance('development'),
    production = loadBalance('production')
  for (const sheet of Object.values(sheets)) {
    const key = sheet.identity.kit,
      oldHp = sheet.baseStats.hp,
      oldAttack = sheet.baseStats.attack,
      oldPercent = sheet.abilities.special2.percent
    try {
      sheet.baseStats.hp = 777
      sheet.baseStats.attack = 333
      sheet.abilities.special2.percent = 42
      const edited = loadBalance('development')
      assert.deepEqual(edited.baseStats[key], {
        ...baseline.baseStats[key],
        hp: 777,
        attack: 333,
      })
      assert.equal(edited.characters[key].special2.percent, 42)
      assert.equal(edited.ai.characters[key].special2.percent, 42)
      for (const other of Object.keys(baseline.baseStats).filter(
        (k) => k !== key
      )) {
        assert.deepEqual(edited.baseStats[other], baseline.baseStats[other])
        assert.deepEqual(edited.characters[other], baseline.characters[other])
      }
      assert.deepEqual(loadBalance('production'), production)
    } finally {
      sheet.baseStats.hp = oldHp
      sheet.baseStats.attack = oldAttack
      if (oldPercent === undefined) delete sheet.abilities.special2.percent
      else sheet.abilities.special2.percent = oldPercent
    }
  }
  assert.deepEqual(loadBalance('development'), baseline)
})
