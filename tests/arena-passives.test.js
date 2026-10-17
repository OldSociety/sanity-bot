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
  return advance(battle, action, () => [4, 1][combo++], () => dice[index++], () => 99.999, () => accuracy, () => 99, () => 99.999, { aiPolicy: 'legacy' })
}

test('both Marq roles start with ON THE BRINK and both Maxim roles with NOT GOOD ENOUGH', () => {
  const marq = newBattle(0, { opponent: 'marq' })
  const max = newBattle(0, { character: maxim })
  for (const fighter of [marq.marq, marq.warrior]) { assert.equal(fighter.passive, 'on-the-brink'); assert.equal(fighter.brinkUsed, false) }
  for (const fighter of [max.marq, max.warrior]) { assert.equal(fighter.passive, 'not-good-enough'); assert.equal(fighter.opportunityReady, false) }
})

test('Marq survives a lethal exchange at 26 HP once, then can be defeated normally', () => {
  const seed = newBattle(); seed.marq.hp = 1
  const revived = step(seed)
  assert.equal(revived.marq.hp, 26); assert.equal(revived.marq.brinkUsed, true)
  assert.equal(revived.status, 'playing'); assert.equal(seed.marq.brinkUsed, false)
  assert.match(actionLog(revived.history), /ON THE BRINK · survived with 26 HP/)
  assert.equal(revived.statistics.player.brinkActivations, 1)
  assert.equal(revived.statistics.player.hpRestored, 26)
  let battle = revived
  while (battle.status === 'playing') battle = step(battle)
  assert.equal(battle.status, 'defeat'); assert.equal(battle.player.hp, 0)
  assert.equal(battle.statistics.player.brinkActivations, 1)
})

test('both Marqs independently prevent simultaneous KO; the later simultaneous KO remains a player win', () => {
  const seed = newBattle(0, { opponent: 'marq' }); seed.marq.hp = 1; seed.warrior.hp = 1
  const saved = step(seed)
  assert.equal(saved.status, 'playing'); assert.equal(saved.tiedVictory, false)
  assert.equal(saved.marq.hp, 26); assert.equal(saved.warrior.hp, 26)
  saved.marq.hp = 1; saved.warrior.hp = 1
  const end = step(saved)
  assert.equal(end.status, 'victory'); assert.equal(end.tiedVictory, true)
})

test('Brink absorbs the full exchange, including a lethal basic plus special, and preserves nonnegative damage attribution', () => {
  const seed = newBattle(3, { opponent: 'marq' }); seed.warrior.hp = 1
  const next = step(seed, 'special2')
  assert.equal(next.warrior.hp, 26); assert.equal(next.statistics.enemy.brinkActivations, 1)
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
  const seed = newBattle(0, { mode: 'idle' }); seed.marq.hp = 1
  assert.equal(step(seed).marq.hp, 26)
})

test('tactics cannot claim a knockout through unused Brink; survival estimates include its reserve', () => {
  const seed = newBattle(5, { opponent: 'marq' }); seed.warrior.hp = 1
  const protectedPreview = preview(seed.marq, seed.warrior, 'special3')
  assert.equal(protectedPreview.knockout, 0); assert.equal(protectedPreview.guaranteed, false)
  const protectedHorizon = survival(seed.marq, seed.warrior).enemy
  seed.warrior.brinkUsed = true
  assert.equal(preview(seed.marq, seed.warrior, 'special3').guaranteed, true)
  assert.ok(survival(seed.marq, seed.warrior).enemy < protectedHorizon)
})

test('repeated opponent misses do not stack Maxim bonus; misses preserve it and a successful basic consumes it', () => {
  let battle = newBattle(0, { character: maxim })
  for (let i = 0; i < 3; i++) battle = step(battle, 'continue', { dice: [2, 3], accuracy: 99 })
  assert.equal(battle.player.opportunityReady, true); assert.equal(battle.enemy.opportunityReady, true)
  battle = step(battle)
  assert.equal(battle.playerDamage, 9); assert.equal(battle.maximDamage, 11)
  assert.equal(battle.player.opportunityReady, false); assert.equal(battle.enemy.opportunityReady, false)
  battle = step(battle)
  assert.equal(battle.playerDamage, 5); assert.equal(battle.maximDamage, 7)
})

test('Maxim adds percentage points before critical and exhaustion multipliers, without multiplying Slayer or specials', () => {
  const seed = newBattle(3, { character: maxim }); seed.marq.opportunityReady = true
  seed.marq.criticalReady = true; seed.marq.slayerCharges = 3; seed.warrior.stress = 0
  assert.equal(basicDamage(seed.marq, seed.warrior, { critical: true, buff: false }), 22)
  assert.equal(basicDamage(seed.marq, seed.warrior, { critical: true }), 66)
  const next = step(seed, 'special1')
  assert.equal(next.marqDamage, 66); assert.equal(next.special1Damage, 28)
  assert.equal(next.special2Damage, 44)
})

test('a controller rematch resets Brink and restores its fresh HP without leaking old survival state', async () => {
  const timers = new Map(); let serial = 0, view
  const arena = createArena({ aiPolicy: 'legacy', idleTickMs: 1,
    setTimer: callback => { timers.set(++serial, callback); return serial }, clearTimer: id => timers.delete(id),
    setExpiryTimer: () => null, clearExpiryTimer: () => {}, rollDuality: (() => { let i = 0; return () => [6, 7][i++ % 2] })(),
    rollAccuracy: () => 0, rollCritical: () => 99, rollFearSpend: () => 99.999 })
  const interaction = { id: 's', guildId: 'g', channelId: 'c', user: { id: 'u' }, reply: async payload => { view = payload; return { id: 'm' } }, editReply: async payload => { view = payload } }
  const click = action => arena.handleButton({ ...interaction, message: { id: 'm' }, customId: `arena:s:${view.components[0].components[0].data.custom_id.split(':')[2]}:${action}`, deferUpdate: async () => {} })
  try {
    await arena.execute(interaction); await click('idle')
    let sawSurvival = false
    for (let i = 0; i < 100 && timers.size; i++) { const [id, callback] = timers.entries().next().value; timers.delete(id); await callback(); sawSurvival ||= JSON.stringify(view).includes('ON THE BRINK') }
    assert.equal(sawSurvival, true)
    assert.match(view.embeds[0].data.description, /Turns:\*\* 42/)
    await click('start'); assert.match(JSON.stringify(view), /260\/260/)
    assert.doesNotMatch(JSON.stringify(view), /survived with/)
  } finally { await arena.dispose() }
})
