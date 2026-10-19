const test = require('node:test'), assert = require('node:assert/strict')
const sharp = require('sharp')
const { newBattle } = require('../services/arena/combat')
const { renderHealthCard, cardName, cardData, cardSvg } = require('../services/arena/health-card')
const { resolveCharacter } = require('../services/arena/characters')
const { createArena } = require('../services/arena/controller')

async function pixels(session) {
  const file = await renderHealthCard(session)
  const { data, info } = await sharp(file.attachment).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const at = (x, y) => { x *= 2; y *= 2; return [...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)] }
  return { file, info, at }
}
test('generated card contains both correct portraits, exact HP, native bars and actual effects', async () => {
  const battle = newBattle(0, { character: resolveCharacter('Maxim'), opponent: 'marq' })
  battle.player.hp = 154; battle.player.stress = 2; battle.player.slayerCharges = 3
  battle.enemy.stress = 0
  const session = { battle }
  const data = cardData(session), svg = cardSvg(data)
  assert.equal(data.fighters[0].image, resolveCharacter('Maxim').image)
  assert.equal(data.fighters[1].image, resolveCharacter('Marq').image)
  assert.match(svg, /154 \/ 220 HP/)
  assert.match(svg, /70%/)
  assert.equal(data.fighters[0].stress, 2)
  assert.equal(data.fighters[0].maxStress, 6)
  assert.ok(data.fighters[0].icons.some(icon => icon.type === 'slayer'))
  assert.ok(data.fighters[1].icons.some(icon => icon.type === 'exposed'))
  assert.doesNotMatch(svg, /Poison|Exposed|🟥|🟦|⬛/)
  const rendered = await pixels(session)
  assert.equal(rendered.info.width, 800); assert.equal(rendered.info.height, 572)
  assert.deepEqual(rendered.at(112, 82), [45, 200, 141])
  assert.deepEqual(rendered.at(365, 82), [16, 18, 27])
  assert.deepEqual(rendered.at(262, 116), [148, 159, 250])
  assert.deepEqual(rendered.at(302, 116), [16, 18, 27])

})

test('health fill and color reflect full, half, critical, one remaining HP and zero', async () => {
  for (const [hp, color, filled] of [[260, [45, 200, 141], true], [130, [237, 189, 101], true],
    [65, [240, 113, 120], true], [1, [240, 113, 120], false], [0, [16, 18, 27], false]]) {
    const battle = newBattle(); battle.player.hp = hp
    const svg = cardSvg(cardData({ battle })), rendered = await pixels({ battle })
    assert.deepEqual(rendered.at(112, 82), filled ? color : [16, 18, 27])
    assert.match(svg, new RegExp(`${hp} / 260 HP`))
    if (hp === 1) assert.match(svg, /width="1\.061/)
    if (hp === 0) assert.match(svg, /width="0" height="14"/)
  }
})

test('attachment identity tracks visible state and ignores button locks or Finisher shuffles', () => {
  const session = { battle: newBattle() }, original = cardName(session)
  assert.equal(cardName({ ...session, revision: 500, busy: true, minigame: { frame: 8 } }), original)
  assert.equal(cardName({ ...session, battle: { ...session.battle, tick: 99 } }), original)
  session.battle.player.hp--; assert.notEqual(cardName(session), original)
  const hpKey = cardName(session)
  session.battle.player.stress--; assert.notEqual(cardName(session), hpKey)
  const stressKey = cardName(session)
  session.battle.enemy.slayerCharges = 3; assert.notEqual(cardName(session), stressKey)
  session.battle.player.name = 'A<&"\''
  const svg = cardSvg(cardData(session))
  assert.match(svg, /A&lt;&amp;&quot;&apos;/)
  assert.doesNotMatch(svg, /A<&/)
})

function fixture(renderCard) {
  const views = [], warnings = []
  const arena = createArena({ chooseOpponent: () => 'maxim', rollRecovery: () => 99.999, renderCard, rollDuality: () => 6, rollAccuracy: () => 0,
    rollCritical: () => 99, rollFearSpend: () => 99.999, rollEffect: () => 99.999,
    setTimer: () => { throw Error('No automatic combat') },
    setExpiryTimer: () => null, clearExpiryTimer() {},
    logger: { warn: (...args) => warnings.push(args), error: (...args) => { throw Error(args.join(' ')) } } })
  const interaction = { id: 'cards', guildId: 'g', channelId: 'c', user: { id: 'u' },
    reply: async payload => { views.push(payload); return { id: 'm' } }, editReply: async payload => views.push(payload) }
  const click = action => arena.handleButton({ ...interaction, message: { id: 'm' },
    customId: `arena:cards:${views.at(-1).components[0].components[0].data.custom_id.split(':')[2]}:${action}`,
    deferUpdate: async () => {} })
  return { arena, interaction, views, warnings, click }
}
test('only changed combat state renders/uploads; lock frame retains the previous image and results remove it', async () => {
  let renders = 0
  const f = fixture(async session => { renders++; return { name: cardName(session), attachment: Buffer.from('synthetic PNG') } })
  try {
    await f.arena.execute(f.interaction); assert.equal(renders, 0)
    await f.click('start'); assert.equal(renders, 1)
    assert.match(f.views.at(-1).embeds[0].data.image.url, /arena-health-/)
    assert.equal(f.views.at(-1).files.length, 2)
    const before = f.views.at(-1).files[0].name
    await f.click('basic'); assert.equal(renders, 2)
    assert.equal(f.views.at(-2).files, undefined)
    assert.notEqual(f.views.at(-1).files[0].name, before)
    await f.click('quit')
    assert.equal(f.views.at(-1).embeds[0].data.image, undefined)
    assert.ok(f.views.at(-1).files.every(file => file.name.endsWith('.txt')))
    assert.equal(renders, 2)
  } finally { await f.arena.dispose() }
})

test('renderer failure leaves readable values, commits one exchange and can recover on the next move', async () => {
  let fail = true
  const f = fixture(async session => {
    if (fail) throw Error('portrait unavailable')
    return { name: cardName(session), attachment: Buffer.from('synthetic PNG') }
  })
  try {
    await f.arena.execute(f.interaction); await f.click('start'); await f.click('basic')
    assert.equal(f.views.at(-1).embeds[0].data.image, undefined)
    const view = JSON.stringify(f.views.at(-1).embeds)
    assert.match(view, /HP 253\/260/)
    assert.match(view, /Stress 6\/6/)
    assert.match(view, /· 1/)
    assert.equal(f.warnings.length, 1)
    assert.ok(f.views.at(-1).components[0].components.some(button => button.data.label === 'Basic Attack' && !button.data.disabled))
    fail = false; await f.click('basic')
    assert.match(f.views.at(-1).embeds[0].data.image.url, /arena-health-/)
    assert.match(JSON.stringify(f.views.at(-1).embeds), /· 2/)
  } finally { await f.arena.dispose() }
})
