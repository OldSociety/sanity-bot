const test = require('node:test'), assert = require('node:assert/strict')
const { newBattle, advance } = require('../services/arena/combat')
const { basicDamage } = require('../services/arena/damage')
const { preview, survival } = require('../services/arena/tactics')
const { survive } = require('../services/arena/passives')
const { resolveCharacter } = require('../services/arena/characters')
const { actionLog } = require('../services/arena/interface')
const { createArena } = require('../services/arena/controller')
const maxim = resolveCharacter('Maxim [Spooky]')
function step(battle, action = 'continue', { dice = [6, 7], accuracy = 0 } = {}) {
  let index = 0, combo = 0
  return advance(battle, action, () => [4, 1][combo++], () => dice[index++], () => 99.999, () => accuracy, () => 99, () => 99.999, { rollRecovery: () => 99.999, aiPolicy: 'legacy', rollFinisher: () => 45 })
}

test('both Marq roles start with ON THE BRINK and both Maxim roles with NOT GOOD ENOUGH', () => {
  const marq = newBattle(0, { opponent: 'marq' })
  const max = newBattle(0, { character: maxim })
  for (const fighter of [marq.player, marq.enemy]) { assert.equal(fighter.passive, 'on-the-brink'); assert.equal(fighter.brinkUsed, false) }
  for (const fighter of [max.player, max.enemy]) { assert.equal(fighter.passive, 'not-good-enough'); assert.equal(fighter.opportunityReady, false) }
})

test('Marq survives a lethal exchange at 26 HP once, then can be defeated normally', () => {
  const seed = newBattle(); seed.player.hp = 1
  const revived = step(seed)
  assert.equal(revived.player.hp, 26); assert.equal(revived.player.brinkUsed, true)
  assert.equal(revived.status, 'playing'); assert.equal(seed.player.brinkUsed, false)
  assert.match(actionLog(revived.history), /ON THE BRINK · survived with 26 HP/)
  assert.equal(revived.statistics.player.brinkActivations, 1)
  assert.equal(revived.statistics.player.hpRestored, 26)
  let battle = revived
  while (battle.status === 'playing') battle = step(battle)
  assert.equal(battle.status, 'defeat'); assert.equal(battle.player.hp, 0)
  assert.equal(battle.statistics.player.brinkActivations, 1)
})

test('both Marqs independently prevent simultaneous KO; the later simultaneous KO remains a player win', () => {
  const seed = newBattle(0, { opponent: 'marq' }); seed.player.hp = 1; seed.enemy.hp = 1
  const saved = step(seed)
  assert.equal(saved.status, 'playing'); assert.equal(saved.tiedVictory, false)
  assert.equal(saved.player.hp, 26); assert.equal(saved.enemy.hp, 26)
  saved.player.hp = 1; saved.enemy.hp = 1
  const end = step(saved)
  assert.equal(end.status, 'victory'); assert.equal(end.tiedVictory, true)
})

test('Brink absorbs the full exchange, including a lethal basic plus special, and preserves nonnegative damage attribution', () => {
  const seed = newBattle(3, { opponent: 'marq' }); seed.enemy.hp = 1
  const next = step(seed, 'special2')
  assert.equal(next.enemy.hp, 26); assert.equal(next.statistics.enemy.brinkActivations, 1)
  assert.equal(next.statistics.player.hpDamage, 1)
  assert.equal(next.statistics.player.hpDamageBySource.basic, 1)
  assert.equal(next.statistics.player.hpDamageBySource.special2, 0)
  const raw = Object.values(next.statistics.player.damage).reduce((a, b) => a + b)
  assert.equal(next.statistics.player.overkill, raw - 1)
})

test('Brink rounds up fractional ten-percent HP, waits for lethal damage and works in Idle', () => {
  const fighter = { passive: 'on-the-brink', hp: 1, maxHp: 101, brinkUsed: false }
  assert.equal(survive(fighter), 0)
  fighter.hp = 0
  assert.equal(survive(fighter), 11); fighter.hp = 0
  assert.equal(survive(fighter), 0)
  const seed = newBattle(0, { mode: 'idle' }); seed.player.hp = 1
  assert.equal(step(seed).player.hp, 26)
})

test('tactics cannot claim a knockout through unused Brink; survival estimates include its reserve', () => {
  const seed = newBattle(6, { opponent: 'marq' }); seed.enemy.hp = 1
  const protectedPreview = preview(seed.player, seed.enemy, 'special3')
  assert.equal(protectedPreview.knockout, 0); assert.equal(protectedPreview.guaranteed, false)
  const protectedHorizon = survival(seed.player, seed.enemy).enemy
  seed.enemy.brinkUsed = true
  assert.equal(preview(seed.player, seed.enemy, 'special3').guaranteed, true)
  assert.ok(survival(seed.player, seed.enemy).enemy < protectedHorizon)
})

test('repeated opponent misses do not stack Maxim bonus; misses preserve it and a successful basic consumes it', () => {
  let battle = newBattle(0, { character: maxim })
  for (let i = 0; i < 3; i++) battle = step(battle, 'continue', { dice: [2, 3], accuracy: 99 })
  assert.equal(battle.player.opportunityReady, true); assert.equal(battle.enemy.opportunityReady, true)
  battle = step(battle)
  assert.equal(battle.playerBasicDamage, 11); assert.equal(battle.enemyDamage, 11)
  assert.equal(battle.player.opportunityReady, false); assert.equal(battle.enemy.opportunityReady, false)
  battle = step(battle)
  assert.equal(battle.playerBasicDamage, 7); assert.equal(battle.enemyDamage, 7)
})

test('Maxim adds percentage points before critical and exhaustion multipliers, without multiplying Slayer or specials', () => {
  const seed = newBattle(3, { character: maxim }); seed.player.opportunityReady = true
  seed.player.criticalReady = true; seed.player.slayerCharges = 3; seed.enemy.stress = 0
  assert.equal(basicDamage(seed.player, seed.enemy, { critical: true, buff: false }), 28)
  assert.equal(basicDamage(seed.player, seed.enemy, { critical: true }), 72)
  const next = step(seed, 'special1')
  assert.equal(next.playerBasicDamage, 72); assert.equal(next.special1Damage, 28)
  assert.equal(next.special2Damage, 44)
})

test('a controller rematch resets Brink and restores its fresh HP without leaking old survival state', async () => {
  const timers = new Map(); let serial = 0, view
  const arena = createArena({ chooseOpponent: () => 'maxim', rollRecovery: () => 99.999, aiPolicy: 'legacy', rollFinisher: () => 45, idleTickMs: 1,
    setTimer: callback => { timers.set(++serial, callback); return serial }, clearTimer: id => timers.delete(id),
    setExpiryTimer: () => null, clearExpiryTimer: () => {}, rollDuality: (() => { let i = 0; return () => [2, 3][i++ % 2] })(),
    rollAccuracy: () => 0, rollCritical: () => 99, rollFearSpend: () => 99.999 })
  const interaction = { id: 's', guildId: 'g', channelId: 'c', user: { id: 'u' }, reply: async payload => { view = payload; return { id: 'm' } }, editReply: async payload => { view = payload } }
  const click = action => arena.handleButton({ ...interaction, message: { id: 'm' }, customId: `arena:s:${view.components[0].components[0].data.custom_id.split(':')[2]}:${action}`, deferUpdate: async () => {} })
  try {
    await arena.execute(interaction); await click('start')
    let sawSurvival = false
    for (let i = 0; i < 200 && view.embeds[0].data.title.includes('vs'); i++) { await click('basic'); sawSurvival ||= JSON.stringify(view).includes('ON THE BRINK') }
    assert.equal(sawSurvival, true)
    assert.match(view.embeds[0].data.title, /DEFEAT/)
    await click('start'); assert.equal(view.embeds[0].data.image.url, `attachment://${require('../services/arena/health-card').cardName({ battle: newBattle() })}`)
    assert.doesNotMatch(JSON.stringify(view), /survived with/)
  } finally { await arena.dispose() }
})
