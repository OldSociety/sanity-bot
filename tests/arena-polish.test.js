const test = require('node:test'), assert = require('node:assert/strict')
const sharp = require('sharp')
const { newBattle, advance } = require('../services/arena/combat')
const { preview, decide } = require('../services/arena/tactics')
const { canUse } = require('../services/arena/rules')
const { statusIcons } = require('../services/arena/status-icons')
const { cardData, cardName, cardSvg, renderHealthCard } = require('../services/arena/health-card')

test('both enemy finishers spend six Fear and sample the complete 35–45 range once per move', () => {
  for (const opponent of ['marq', 'maxim']) for (let percent = 35; percent <= 45; percent++)
    for (const stress of [0, 6]) for (const accuracy of [0, 99]) for (const critical of [0, 99]) {
      const seed = newBattle(0, { opponent }); seed.player.stress = stress; seed.enemy.fear = 6
      let calls = 0
      const next = advance(seed, {}, undefined, undefined, () => 0, () => accuracy, () => critical, () => 99.999,
        { actor: 'enemy', rollRecovery: () => 99.999, aiPolicy: 'legacy', rollFinisher: () => { calls++; return percent } })
      const multiplier = stress === 0 ? 1.25 : 1
      const damage = Math.ceil(seed.enemy.attack * percent / 100 * multiplier)
      assert.equal(next.enemySpecial, 'special3'); assert.equal(next.fearSpent, 6); assert.equal(next.enemy.fear, 0)
      assert.equal(next.statistics.enemy.damage.special3, damage); assert.equal(calls, 1)
      assert.equal(next.statistics.enemy.hits.special3, 1)
      const basic = accuracy === 99 ? 0 : Math.ceil(seed.enemy.attack * .03 * multiplier * (critical === 0 ? 2 : 1))
      assert.equal(next.enemyDamage, damage + basic)
      const withoutPenalty = Math.ceil(seed.enemy.attack * percent / 100) + (accuracy === 99 ? 0 : Math.ceil(seed.enemy.attack * .03 * (critical === 0 ? 2 : 1)))
      assert.equal(next.statistics.player.vulnerabilityDamageTaken, damage + basic - withoutPenalty)
      assert.equal(seed.enemy.fear, 6)
    }
})

test('five Fear cannot afford either finisher and tactical guarantees use the lowest possible roll', () => {
  for (const opponent of ['marq', 'maxim']) {
    const b = newBattle(0, { opponent }), actor = b.enemy
    actor.fear = 5; actor.hope = 5; b.player.brinkUsed = true
    assert.equal(canUse(actor, 'special3'), false)
    assert.notEqual(decide(actor, b.player, { roll: () => 0 }).slot, 'special3')
    const low = Math.ceil(actor.attack * .35), high = Math.ceil(actor.attack * .45)
    b.player.hp = low; assert.equal(preview(actor, b.player, 'special3').guaranteed, true)
    b.player.hp = low + 1; assert.equal(preview(actor, b.player, 'special3').guaranteed, false)
    b.player.hp = high; const result = preview(actor, b.player, 'special3')
    assert.ok(result.knockout > 0 && result.knockout < 1)
    actor.fear = 6; actor.hope = 6; assert.equal(canUse(actor, 'special3'), true)
  }
})

test('status symbols expose only current effects and Brink disappears when its one use is spent', async () => {
  const battle = newBattle(), session = { battle }, before = cardName(session)
  assert.ok(statusIcons(battle.player).some(icon => icon.type === 'brink'))
  assert.ok(!statusIcons(battle.player).some(icon => icon.type === 'poison'))
  battle.player.hp = 1
  const triggered = advance(battle, {}, undefined, undefined, () => 99.999, () => 0, () => 99, undefined, { actor: 'enemy', rollRecovery: () => 99.999, aiPolicy: 'legacy' })
  assert.equal(triggered.player.brinkUsed, true); assert.equal(triggered.player.hp, 26)
  const data = cardData({ battle: triggered })
  assert.equal(data.fighters[0].brinkTriggered, true)
  assert.ok(!data.fighters[0].icons.some(icon => icon.type === 'brink'))
  assert.match(cardSvg(data), /#a8adb8/); assert.notEqual(cardName({ battle: triggered }), before)
  triggered.player.stress = 0; triggered.player.poisonTurns = 3
  const icons = statusIcons(triggered.player)
  assert.equal(triggered.player.stress, 0)
  assert.equal(icons.find(icon => icon.type === 'exposed').value, '1')
  assert.equal(icons.find(icon => icon.type === 'poison').value, '3')
  const file = await renderHealthCard({ battle: triggered }), metadata = await sharp(file.attachment).metadata()
  assert.equal(metadata.width, 800); assert.equal(metadata.height, 572)
})
