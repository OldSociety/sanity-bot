const test = require('node:test')
const assert = require('node:assert/strict')
const { newBattle } = require('../services/arena/combat')
const { resolveCharacter } = require('../services/arena/characters')
const {
  legendData,
  legendNameFor,
  legendSvg,
  legendFile,
} = require('../services/arena/legend')
const { screen } = require('../services/arena/interface')

test('fight key filters character-specific icons and omits unapplied Poison', () => {
  const marqs = newBattle(0, { opponent: 'marq' })
  const key = legendSvg(marqs)
  assert.match(key, /Brink available/)
  assert.doesNotMatch(key, /Slayer|Opportunity|Poison|Red bars|Hellfed/)
  const maxims = newBattle(0, {
    character: resolveCharacter('Maxim'),
    opponent: 'maxim',
  })
  assert.match(legendSvg(maxims), /Slayer active/)
  assert.match(legendSvg(maxims), /Opportunity ready/)
  assert.doesNotMatch(legendSvg(maxims), /Brink|Grey HP|Poison|Hellfed/)
})
test('rendered key attachment and embed share a content key that follows relevant effects', async () => {
  const battle = newBattle(0, { opponent: 'marq' })
  const file = await legendFile(battle)
  assert.equal(file.name, legendNameFor(battle))
  assert.equal(
    screen({ id: 'key', revision: 0, battle }).embeds[1].data.image.url,
    `attachment://${file.name}`
  )
  battle.player.hp--
  battle.player.stress--
  assert.equal(legendNameFor(battle), file.name)
  battle.player.poisonTurns = 2
  assert.match(legendSvg(battle), /Poison/)
  assert.notEqual(legendNameFor(battle), file.name)
  assert.equal((await legendFile(battle)).name, legendNameFor(battle))
})
test('Hellfed has a permanent red Rage marker and no Maxim key entries against Marq', () => {
  // UI adapters accept fighter state independently of environment activation.
  const battle = newBattle(0, { opponent: 'marq' })
  Object.assign(battle.player, {
    kit: 'hellfed-marq',
    passive: 'hellfed',
    stress: 0,
    maxStress: 0,
    rage: 0,
  })
  const {
    statusIcons,
    iconSvg,
    colors,
  } = require('../services/arena/status-icons')
  const { basicDamage } = require('../services/arena/damage')
  for (const rage of [0, 1, 2, 3]) {
    battle.player.rage = rage
    assert.ok(statusIcons(battle.player).some((icon) => icon.type === 'rage'))
    assert.ok(
      !statusIcons(battle.player).some((icon) => icon.type === 'exposed')
    )
    assert.equal(basicDamage(battle.enemy, battle.player), 6)
  }
  assert.match(iconSvg('rage', 0, 0), new RegExp(colors.rage))
  const key = legendSvg(battle)
  assert.match(key, /No Stress exhaustion penalty/)
  assert.match(key, /Red bars: Rage/)
  assert.doesNotMatch(key, /Slayer|Opportunity|Poison/)
  assert.ok(legendData(battle).items.some(([type]) => type === 'exposed')) // Normal opponent still uses Stress.
})
