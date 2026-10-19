const test = require('node:test'), assert = require('node:assert/strict')
const { ButtonStyle } = require('discord.js')
const { newBattle, advance, takeTurn } = require('../services/arena/combat')
const { resolveCharacter } = require('../services/arena/characters')
const { cardData, cardSvg, cardName } = require('../services/arena/health-card')
const { statusIcons } = require('../services/arena/status-icons')
const { screen, actionLog } = require('../services/arena/interface')
const forbidden = () => { throw Error('Recovery cannot roll an attack or choose an ability') }
function enemyTurn(battle, rollRecovery) {
  return advance(battle, {}, forbidden, forbidden, forbidden, forbidden, forbidden, forbidden,
    { actor: 'enemy', rollRecovery })
}

test('8% recovery replaces both enemy kits entire response, including an affordable finisher', () => {
  for (const opponent of ['marq', 'maxim']) for (const stress of [0, 5]) {
    const battle = newBattle(0, { opponent })
    Object.assign(battle.enemy, { stress, fear: 6, slayerCharges: 2, focusHits: opponent === 'maxim' ? 1 : 0, opportunityReady: opponent === 'maxim' })
    let draws = 0
    const next = enemyTurn(battle, () => { draws++; return 7.999 })
    assert.equal(draws, 1); assert.equal(next.enemy.stress, stress + 1)
    assert.equal(next.enemyOutcome, 'recover'); assert.equal(next.enemySpecial, null); assert.equal(next.enemyDecision, null)
    assert.equal(next.enemyDamage, 0); assert.equal(next.player.hp, battle.player.hp)
    assert.equal(next.enemy.fear, 6); assert.equal(next.fearSpent, 0)
    assert.equal(next.enemy.slayerCharges, 2); assert.equal(next.enemy.focusHits, battle.enemy.focusHits)
    assert.equal(next.enemy.opportunityReady, battle.enemy.opportunityReady)
    assert.equal(next.player.opportunityReady, false)
    assert.equal(next.statistics.enemy.attempts.basic, 0)
    assert.equal(next.statistics.enemy.stressRecovered, 1)
    assert.equal(next.statistics.enemy.stressSpent, 0)
    assert.match(actionLog(next.actions), /recovered 1 Stress instead of attacking/)
    assert.doesNotMatch(actionLog(next.actions), /missed/)
    assert.equal(battle.enemy.stress, stress)
  }
})

test('recovery has exactly eight percentile outcomes, no overfill, and leaves Idle unchanged', () => {
  let recovered = 0
  for (let roll = 0; roll < 100; roll++) {
    const b = newBattle(); b.enemy.stress = 5
    const next = advance(b, {}, undefined, undefined, () => 99.999, () => 0, () => 99, () => 99.999,
      { actor: 'enemy', rollRecovery: () => roll })
    recovered += Number(next.enemyOutcome === 'recover')
    assert.equal(next.enemy.stress, roll < 8 ? 6 : 5)
    assert.equal(next.statistics.enemy.attempts.basic, roll < 8 ? 0 : 1)
  }
  assert.equal(recovered, 8)
  for (const mode of ['active', 'idle']) {
    const b = newBattle(0, { mode }); b.enemy.stress = mode === 'idle' ? 0 : 6
    const next = advance(b, {}, undefined, undefined, () => 99.999, () => 0, () => 99, undefined,
      { actor: 'enemy', rollRecovery: forbidden })
    assert.equal(next.enemyOutcome, 'hit'); assert.equal(next.enemy.stress, b.enemy.stress)
  }
  const b = newBattle(); b.enemy.stress = 0
  for (const value of [-1, 100, NaN]) assert.throws(() => enemyTurn(b, () => value), /recovery percentile/)
})

test('player-first turn can end with recovery and a lethal player hit never rolls recovery', () => {
  const b = newBattle(); b.enemy.stress = 4
  const next = takeTurn(b, 'basic', undefined, () => 6, forbidden, forbidden, forbidden, forbidden, { rollRecovery: () => 0 })
  assert.equal(next.tick, 1); assert.equal(next.actions.length, 2)
  assert.match(actionLog(next.actions), /recovered 1 Stress/)
  assert.equal(next.statistics.player.attempts.basic, 1)
  assert.equal(next.statistics.enemy.attempts.basic, 0)
  b.enemy.hp = 1
  const ended = takeTurn(b, 'basic', undefined, () => 6, forbidden, forbidden, forbidden, forbidden, { rollRecovery: forbidden })
  assert.equal(ended.status, 'victory')
})

test('single-use icon is first; Slayer shows charges beside effects and six Stress bars on right', () => {
  const b = newBattle(); Object.assign(b.player, { stress: 0, slayerCharges: 2, criticalReady: true, opportunityReady: true, poisonTurns: 3 })
  const data = cardData({ battle: b }), player = data.fighters[0]
  assert.equal(statusIcons(b.player)[0].type, 'brink')
  assert.equal(player.icons[0].singleUse, true)
  assert.ok(!player.icons.some(icon => icon.type === 'stress' || (icon.type !== 'slayer' && 'value' in icon)))
  assert.equal(player.icons.find(icon => icon.type === 'slayer').value, '2')
  const svg = cardSvg(data)
  assert.doesNotMatch(svg, /0\/6|×2|\+2|Stress|Slayer/)
  assert.equal((svg.match(/width="17" height="8"/g) || []).length, 12)
  assert.match(svg, /x="256" y="112"/)
  const before = cardName({ battle: b }); b.player.slayerCharges--
  assert.notEqual(cardName({ battle: b }), before)
  b.player.brinkUsed = true
  assert.notEqual(cardName({ battle: b }), before)
  assert.ok(!cardData({ battle: b }).fighters[0].icons.some(icon => icon.type === 'brink'))
  const view = screen({ id: 'grey', revision: 0, battle: newBattle(0, { character: resolveCharacter('Maxim') }) })
  const basic = view.components.flatMap(row => row.components).find(button => button.data.custom_id.endsWith(':basic'))
  assert.equal(basic.data.style, ButtonStyle.Secondary)
})

test('controller forwards recovery into the enemy response and returns usable grey Basic Attack', async () => {
  const { createArena } = require('../services/arena/controller')
  const views = []
  const arena = createArena({ chooseOpponent: () => 'maxim', rollRecovery: () => 0, rollDuality: () => 6,
    rollFearSpend: forbidden, rollAccuracy: forbidden, rollCritical: forbidden, rollEffect: forbidden,
    renderCard: async session => ({ name: cardName(session), attachment: Buffer.from('PNG fixture') }),
    setExpiryTimer: () => null, clearExpiryTimer() {} })
  const interaction = { id: 'recover', guildId: 'g', channelId: 'c', user: { id: 'u' },
    reply: async view => { views.push(view); return { id: 'm' } }, editReply: async view => views.push(view) }
  const click = action => arena.handleButton({ ...interaction, message: { id: 'm' }, deferUpdate: async () => {},
    customId: `arena:recover:${views.at(-1).components[0].components[0].data.custom_id.split(':')[2]}:${action}` })
  try {
    await arena.execute(interaction); await click('start'); await click('basic')
    const view = views.at(-1)
    assert.match(JSON.stringify(view.embeds), /recovered 1 Stress instead of attacking/)
    const basic = view.components.flatMap(row => row.components).find(button => button.data.custom_id.endsWith(':basic'))
    assert.equal(basic.data.style, ButtonStyle.Secondary); assert.equal(basic.data.disabled, false)
  } finally { await arena.dispose() }
})
