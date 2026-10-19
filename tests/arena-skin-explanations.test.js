const test = require('node:test'),
  assert = require('node:assert/strict'),
  { execFileSync } = require('node:child_process')
process.env.NODE_ENV = 'development'
const { characters, isSelectable } = require('../services/arena/characters')
const { screen } = require('../services/arena/interface')
const fields = (c) =>
  screen({ id: 'summary', revision: 0, character: c, level: 1, page: 'skins' })
    .embeds[0].data.fields
test('every playable skin labels all three abilities, resource costs, explanations and passives', () => {
  const available = characters.filter(isSelectable)
  assert.equal(available.length, 5)
  for (const c of available) {
    const all = fields(c)
    for (let n = 1; n <= 3; n++) {
      const field = all.find((f) => f.name.startsWith(`S${n} · `))
      assert(field, c.label)
      assert.match(field.name, /— .*?(Stress|Hope|max HP)/)
      assert(field.value.length > 20)
      assert(field.value.length <= 1024)
    }
    assert.equal(
      all.some((f) => f.name === 'Passive'),
      Boolean(c.passive)
    )
    assert(all.some((f) => f.name === 'Attack rules'))
    assert(JSON.stringify(all).length < 6000)
  }
})
test('summaries explain damage, trigger conditions, recharge, support and actual Finisher timers', () => {
  const get = (name) =>
    JSON.stringify(
      fields(require('../services/arena/characters').resolveCharacter(name))
    )
  assert.match(get('Marq'), /4% Attack \(8 damage\)/)
  assert.match(get('Marq'), /20% chance to remove 1 Stress/)
  assert.match(get('Marq'), /8% Attack \+ 1% per pip/)
  assert.match(get('Marq'), /lower than the previous/)
  assert.match(get('Marq'), /Once per fight/)
  assert.match(get('Maxim'), /2 Stress/)
  assert.match(get('Maxim'), /3 landed basics; starts ready/)
  assert.match(get('Maxim'), /next 3 landed basics gain \+7% Attack/)
  assert.match(get('Maxim'), /Blocked basics keep charges/)
  assert.match(get('Hellfed Marq'), /1 \/ 2 \/ 3% max HP/)
  assert.match(get('Hellfed Marq'), /3 \/ 6 \/ 8 HP/)
  assert.match(get('Hellfed Marq'), /16% Attack \+ 6% per Rage/)
  assert.match(get('Hellfed Marq'), /Add 8% Attack per Rage; Rage is kept/)
  assert.match(get('Azulis'), /14/)
  assert.match(get('Azulis'), /healing works even if it is blocked/)
  assert.match(get('Azulis'), /within 4s/)
  assert.match(get('Hendrix'), /Apply or refresh Bleeding/)
  assert.match(get('Hendrix'), /Six basic strikes total/)
  assert.match(get('Hendrix'), /within 5s/)
})
test('production retains the template explanations while development shows the finished Hendrix kit', () => {
  const source = `const {characters,isSelectable}=require('./services/arena/characters'),{screen}=require('./services/arena/interface');process.stdout.write(JSON.stringify(characters.filter(isSelectable).map(character=>screen({id:'same',revision:0,character,level:1,page:'skins'}))))`
  const read = (env) =>
    execFileSync(process.execPath, ['-e', source], {
      env: { ...process.env, NODE_ENV: env },
      encoding: 'utf8',
    })
  assert.match(read('production'), /8% Attack \(16 damage\)/)
  assert.match(read('production'), /Hendrix.*Template/)
  assert.match(read('development'), /Apply or refresh Bleeding/)
})
