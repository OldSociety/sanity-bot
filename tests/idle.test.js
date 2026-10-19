const test = require('node:test')
const assert = require('node:assert/strict')
const idle = require('../services/idle/combat')
const { characters, resolveCharacter, isSelectable } = require('../services/arena/characters')
const { resultEmbed } = require('../services/idle/results')
const { characterChoices, skinChoices, resolveSelection } = require('../services/idle/selection')
const command = require('../commands/Idle/Idle')

function battle(player = 'marq', enemy = 'maxim', stats = [34, 33, 33], enemyStats = stats) {
  return { player: idle.createCombatant(resolveCharacter(player), stats),
    enemy: idle.createCombatant(resolveCharacter(enemy), enemyStats),
    elapsedMs: 0, events: 0, status: 'playing', log: [] }
}
const neverStress = { base: 0, stressWeight: 0, missingHealthWeight: 0, exhaustionPenalty: 0, minimum: 0, maximum: 0 }
// 2 vs 3: ordinary Fear, no recovery or critical bonus.
function fearRng() { let i = 0; return () => [0.1, 0.2, 0.99][i++ % 3] }

test('allocation requires three bounded integers totaling exactly 100', () => {
  for (const value of ['50,30,20', '100,0,0', '25,25,50', ' 50 , 30, 20 '])
    assert.equal(idle.parseStats(value).reduce((a, b) => a + b), 100)
  for (const value of ['30,30,30', '50,60,-10', '20.5,30,49.5', '100', '50,50', '0,0,0,100', '100,,0', '101,0,0', 'NaN,0,100', '1e2,0,0', '', null])
    assert.throws(() => idle.parseStats(value), /Stats|Power/)
})
test('Power and Composure implement exact endpoints and fractions', () => {
  for (const power of [0, 20, 40, 60, 80, 100]) assert.equal(idle.intervalMs(power), 3000 - 10 * power)
  for (const [c, multiplier] of [[0, 1], [25, .875], [50, .75], [75, .625], [100, .5]])
    assert.equal(idle.stressMultiplier(c), multiplier)
})
test('Technique preserves natural criticals with expected probabilities across 120000 rolls', () => {
  for (const technique of [0, 50, 100]) {
    const rng = idle.seededRandom(12), counts = { Hope: 0, Fear: 0, Critical: 0 }
    for (let i = 0; i < 120000; i++) counts[idle.rollAction(technique, rng).outcome]++
    assert.ok(Math.abs(counts.Critical / 120000 - 1 / 12) < .005)
    assert.ok(Math.abs(counts.Hope / 120000 - (11 / 24 * (1 + technique * .003))) < .006)
    assert.ok(Math.abs(counts.Fear / 120000 - (11 / 24 * (1 - technique * .003))) < .006)
  }
})
test('natural critical resolved before conversion, ordinary Fear converts', () => {
  let i = 0
  assert.equal(idle.rollAction(100, () => [.2, .2][i++]).outcome, 'Critical')
  i = 0
  const roll = idle.rollAction(100, () => [0, .9, .1][i++])
  assert.equal(roll.outcome, 'Hope')
  assert.equal(roll.converted, true)
})
test('independent clocks are unrelated to Fear and player success', () => {
  const b = battle('marq', 'maxim', [100, 0, 0], [0, 0, 100])
  for (let i = 0; i < 5; i++) idle.step(b, fearRng(), neverStress)
  assert.deepEqual(b.log.filter(e => !e.event).map(e => [e.at, e.side]),
    [[2000, 'player'], [3000, 'enemy'], [4000, 'player'], [6000, 'player'], [6000, 'enemy'], [8000, 'player']])
  assert.ok(b.player.summary.basic > 0 && b.enemy.summary.basic > 0)
  assert.ok(b.player.hp < b.player.maxHp && b.enemy.hp < b.enemy.maxHp)
})
test('Hope abilities replace basics at first eligible event; costs precede roll', () => {
  const b = battle('maxim', 'maxim')
  b.player.hope = 2
  // Natural critical grants the third Hope, but cannot spend it that same action.
  idle.step(b, () => .2, neverStress)
  assert.equal(b.player.summary.basic, 1)
  assert.equal(b.player.hope, 3)
  idle.step(b, () => .2, neverStress)
  assert.equal(b.player.summary.hopeAbilities, 1)
  assert.equal(b.player.summary.basic, 1)
  assert.equal(b.player.summary.hopeSpent, 3)
  assert.equal(b.player.hope, 1)
  assert.equal(b.player.slayerCharges, 3)
  assert.equal(b.log.find(e => e.slot === 'special2').damage, 0)
})
test('finishers cannot be selected even at full Hope on either side', () => {
  const b = battle()
  for (const actor of [b.player, b.enemy]) {
    actor.hope = 6
    assert.equal(idle.chooseAction(actor, b.enemy, 10000, () => 0), 'special2')
  }
  const fight = idle.simulate({ random: idle.seededRandom(42) })
  assert.ok(fight.log.every(event => event.slot !== 'special3'))
})
test('fractional Stress ability cost, exhaustion and recharge stay enforced', () => {
  const b = battle('maxim', 'maxim', [0, 0, 100])
  idle.step(b, fearRng(), { ...neverStress, minimum: 1, maximum: 1 })
  assert.equal(b.player.summary.stressSpent, 1) // 2 * 0.5
  assert.equal(b.enemy.summary.stressSpent, 1)
  assert.equal(b.player.focusHits, 1)
  assert.equal(idle.ready(b.player, 'special1', 10000), false)
  b.player.focusHits = 3
  b.player.stress = .9
  assert.equal(idle.ready(b.player, 'special1', 10000), false)
  b.player.stress = 1
  assert.equal(idle.ready(b.player, 'special1', 10000), true)
  b.player.cooldowns.special1 = 20000
  assert.equal(idle.ready(b.player, 'special1', 19999), false)
  assert.equal(idle.ready(b.player, 'special1', 20000), true)
  const m = battle('marq', 'maxim', [0, 50, 50])
  idle.step(m, fearRng(), { ...neverStress, minimum: 1, maximum: 1 })
  assert.equal(m.player.summary.stressSpent, .75)
})
test('critical bonus persists through ability, applies once to next basic; incoming loss is mitigated', () => {
  const b = battle('maxim', 'maxim', [0, 0, 100])
  idle.step(b, () => .2, neverStress)
  assert.equal(b.player.summary.stressLost, .5)
  assert.equal(b.enemy.summary.stressLost, .5)
  assert.equal(b.player.criticalReady, true)
  b.player.hope = b.enemy.hope = 3
  idle.step(b, fearRng(), neverStress)
  assert.equal(b.player.criticalReady, true)
  idle.step(b, fearRng(), neverStress)
  assert.equal(b.player.criticalReady, false)
  const doubled = b.log.filter(e => e.side === 'player' && e.slot === 'basic').at(-1).damage
  idle.step(b, fearRng(), neverStress)
  const normal = b.log.filter(e => e.side === 'player' && e.slot === 'basic').at(-1).damage
  assert.ok(doubled >= 2 * normal - 1)
})
test('incoming ability Stress damage respects Composure and immediately exposes exhaustion', () => {
  const b = battle('marq', 'maxim', [100, 0, 0], [0, 0, 100])
  b.enemy.stress = .5
  // Choose Stress, trigger Overwhelm's removal, then 2/3 ordinary Fear.
  let i = 0
  idle.step(b, () => [.0, .0, .1, .2, .99][i++])
  assert.equal(b.enemy.stress, 0)
  assert.equal(b.enemy.summary.stressLost, .5)
  assert.equal(b.player.summary.stressSpent, 1)
  assert.equal(b.log[0].damage, 10) // 4% of 200 * 1.25 exhausted multiplier.
})
test('weighted Stress policy responds to health, reserves and exhaustion; confirmed lethal overrides random skip', () => {
  const b = battle('maxim', 'maxim')
  const healthy = idle.stressChance(b.player, 2)
  b.player.hp = 22
  assert.ok(idle.stressChance(b.player, 2) > healthy)
  b.player.stress = 2
  assert.ok(idle.stressChance(b.player, 2) < healthy)
  b.enemy.hp = 1
  assert.equal(idle.chooseAction(b.player, b.enemy, 3000, () => .999), 'special1')
  b.enemy.passive = 'on-the-brink'
  assert.equal(idle.confirmedLethal(b.player, b.enemy, 'special1'), false)
})
test('equal-clock lethal actions finish together; Arena player-win tie and survival are preserved', () => {
  const b = battle('maxim', 'maxim')
  b.player.hp = b.enemy.hp = 1
  idle.step(b, fearRng(), neverStress)
  assert.equal(b.status, 'victory')
  assert.equal(b.tiedVictory, true)
  assert.equal(b.log.filter(e => e.event === 'KO').length, 2)
  const m = battle('marq', 'maxim')
  m.player.hp = 1
  idle.step(m, fearRng(), neverStress)
  assert.equal(m.player.brinkUsed, true)
  assert.equal(m.player.hp, Math.ceil(m.player.maxHp * .1))
})
test('symmetrical player coefficients, Hope accounting, exhaustion and conservation for both sides', () => {
  const b = battle('maxim', 'maxim', [100, 0, 0])
  b.player.stress = b.enemy.stress = 0
  idle.step(b, fearRng(), neverStress)
  assert.equal(b.player.summary.damageDealt, b.enemy.summary.damageDealt)
  assert.equal(b.player.fear, 1)
  assert.equal(b.enemy.fear, 1)
  for (let seed = 0; seed < 50; seed++) {
    const fight = idle.simulate({ random: idle.seededRandom(seed) })
    assert.notEqual(fight.status, 'limit')
    for (const actor of [fight.player, fight.enemy]) {
      const s = actor.summary
      assert.equal(s.hopeGenerated - s.hopeSpent, actor.hope)
      assert.ok(Math.abs(6 - s.stressSpent + s.stressRecovered - s.stressLost - actor.stress) < 1e-8)
      assert.ok(actor.stress >= 0 && actor.stress <= 6)
    }
    assert.equal(fight.player.summary.damageDealt, fight.enemy.summary.damageTaken)
  }
  const actor = b.player, target = b.enemy
  const { basicDamage } = require('../services/arena/damage')
  const normal = basicDamage(actor, target)
  target.stress = 0
  assert.ok(basicDamage(actor, target) >= normal)
})
test('engine handles every existing registry variant without character-name branches; selector respects Arena eligibility', () => {
  for (const character of characters) {
    const fight = idle.simulate({ character, random: idle.seededRandom(13) })
    assert.notEqual(fight.status, 'limit')
    assert.equal(fight.player.characterId, character.id)
    assert.equal(Boolean(skinChoices(character.name.toLowerCase()).find(e => e.value === character.id)), isSelectable(character))
  }
  assert.deepEqual(characterChoices().map(e => e.value), ['marq', 'maxim'])
  assert.equal(resolveSelection('marq', 'spooky-2026:mrq').level, 1)
  assert.throws(() => resolveSelection('marq', 'spooky-2026:max'), /matching skin/)
  assert.throws(() => resolveSelection('marq', 'spooky-2026:hfm'), /matching skin/)
  const custom = { id: 'fixture', label: 'Other', name: 'Other', kit: 'maxim', passive: null }
  assert.equal(idle.simulate({ character: custom, random: idle.seededRandom(15) }).player.characterId, 'fixture')
})
test('bounded deterministic harness and Discord embed limits', () => {
  const { report, allocations } = require('../scripts/idle-balance-report')
  assert.deepEqual(report({ trials: 3 }), report({ trials: 3 }))
  assert.equal(report({ trials: 1 }).length, allocations.length)
  const b = idle.simulate({ random: idle.seededRandom(17) })
  const embed = resultEmbed(b).toJSON()
  assert.ok(embed.fields.every(f => f.value.length <= 1024))
  assert.ok(embed.fields.reduce((sum, f) => sum + f.name.length + f.value.length, embed.title.length + embed.description.length + embed.footer.text.length) < 6000)
  assert.match(JSON.stringify(embed), /Power 34/)
  assert.match(JSON.stringify(embed), /events omitted/)
  assert.equal(idle.simulate({ maxEvents: 1 }).status, 'limit')
})
test('exact command schema, environment policy and direct invalid requests', async () => {
  const definition = command.data.toJSON()
  assert.deepEqual(definition.options.map(o => [o.name, o.type, o.required]), [['character', 3, true], ['skin', 3, true], ['stats', 3, true]])
  assert.ok(definition.options.slice(0, 2).every(o => o.autocomplete))
  const { commandEnabled } = require('../services/command-environment')
  assert.equal(commandEnabled(command, 'production'), false)
  assert.equal(commandEnabled({ name: 'idle' }, 'production'), false)
  const oldEnv = process.env.NODE_ENV, oldGuild = process.env.GUILDID
  try {
    process.env.NODE_ENV = 'development'; process.env.GUILDID = 'test-guild'
    let reply
    await command.execute({ guildId: 'test-guild', options: { getString: () => '30,30,30' }, reply: async payload => { reply = payload } })
    assert.equal(reply.ephemeral, true)
    assert.match(reply.content, /total exactly 100/)
    await command.execute({ guildId: 'wrong', reply: async payload => { reply = payload } })
    assert.equal(reply.ephemeral, true)
    let choices
    await command.autocomplete({ guildId: 'wrong', respond: async value => { choices = value } })
    assert.deepEqual(choices, [])
  } finally {
    if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv
    if (oldGuild === undefined) delete process.env.GUILDID; else process.env.GUILDID = oldGuild
  }
})
test('successful command skips selection pages and returns one completed-fight embed', async () => {
  const oldEnv = process.env.NODE_ENV, oldGuild = process.env.GUILDID
  try {
    process.env.NODE_ENV = 'development'; process.env.GUILDID = 'test-guild'
    let deferred = false, payload
    await command.execute({ guildId: 'test-guild',
      options: { getString: name => ({ character: 'marq', skin: 'spooky-2026:mrq', stats: '50,30,20' })[name] },
      deferReply: async () => { deferred = true }, editReply: async value => { payload = value } })
    assert.equal(deferred, true)
    assert.equal(payload.embeds.length, 1)
    assert.equal(payload.components, undefined)
    assert.match(payload.embeds[0].data.description, /Winner/)
  } finally {
    if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv
    if (oldGuild === undefined) delete process.env.GUILDID; else process.env.GUILDID = oldGuild
  }
})
test('real dispatcher routes Idle autocomplete and filters by selected fighter', async () => {
  const oldEnv = process.env.NODE_ENV, oldGuild = process.env.GUILDID
  try {
    process.env.NODE_ENV = 'development'; process.env.GUILDID = 'test-guild'
    let choices
    await require('../Events/InteractionCreate').execute({
      isAutocomplete: () => true, commandName: 'idle', guildId: 'test-guild',
      options: { getFocused: () => ({ name: 'skin', value: '' }), getString: () => 'maxim' },
      respond: async rows => { choices = rows },
    })
    assert.deepEqual(choices.map(choice => choice.value), ['spooky-2026:max'])
  } finally {
    if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv
    if (oldGuild === undefined) delete process.env.GUILDID; else process.env.GUILDID = oldGuild
  }
})
