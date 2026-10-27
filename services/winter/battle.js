const { randomUUID, randomInt } = require('node:crypto')
const config = Object.freeze(require('../../config/winter/combat.json'))
function add(value, amount) {
  const result = BigInt(value) + BigInt(amount)
  if (result < 0n || result > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('Winter battle exceeds the safe integer range.')
  return Number(result)
}
function freshBattle(settings = config) {
  return { fightId: randomUUID(), sturdyOwned: 0, idleStarted: 0, defeated: 0, sweat: 0, sweatUnlocked: 0,
    playerHp: settings.playerMaxHp, enemyHp: settings.sturdyBaseHp, enemyMaxHp: settings.sturdyBaseHp,
    active: 0, phase: 'locked', pauseAt: 0, nextPlayerAt: 0, nextEnemyAt: 0, specialReadyAt: 0,
    trainUnlocked: 0, trainIntroPending: 0, losses: 0, throws: 0, hits: 0, enemyAttacks: 0, enemyHits: 0,
    dirtyUnlocked: 0, dirty: 0, dirtyProgress: 0, spicyPurchased: 0,
    gym: { strength: 1, accuracy: 1, defense: 1, attack: 1 }, hendrixUnlocked: 0, requiaUnlocked: 0,
    stunRemaining: 0, stunnedAttacks: 0,
    lastEvent: '', revision: 0 }
}
// nextPlayerAt recognizes already-started fights saved before idleStarted existed.
const hasStarted = state => Boolean(state.sturdyOwned && (state.idleStarted || state.nextPlayerAt > 0))
function creditThrow(state) {
  if (!hasStarted(state)) return
  state.throws = add(state.throws, 1)
  if (state.dirtyUnlocked) {
    state.dirtyProgress = add(state.dirtyProgress || 0, 1)
    if (state.dirtyProgress === 5) {
      state.dirty = add(state.dirty || 0, 1)
      state.dirtyProgress = 0
    }
  }
}
function creditHit(state, settings) {
  if (!hasStarted(state)) return
  state.sweat = add(state.sweat, settings.sweatPerHit)
  state.sweatUnlocked = 1
}
function won(state, at, settings) {
  state.defeated = add(state.defeated, 1)
  state.enemyMaxHp = add(settings.sturdyBaseHp, state.defeated)
  state.enemyHp = state.enemyMaxHp
  state.stunRemaining = 0
  state.playerHp = settings.playerMaxHp
  state.nextPlayerAt = add(at, settings.playerIntervalMs)
  state.nextEnemyAt = add(at, settings.enemyIntervalMs)
  state.lastEvent = 'Snowman defeated! You healed to full. A stronger snowman approaches.'
}
function throwAtEnemy(state, at, damage, random, settings = config) {
  creditThrow(state)
  const hit = random() < settings.playerAccuracy
  if (hit) {
    creditHit(state, settings)
    state.hits = add(state.hits, 1)
    state.enemyHp = Math.max(0, state.enemyHp - damage)
    state.lastEvent = `Your snowball hit for ${damage} damage.`
    if (!state.enemyHp) won(state, at, settings)
  } else state.lastEvent = 'Your snowball missed.'
  state.revision = add(state.revision, 1)
  return hit
}
function throwDirty(state, random, settings = config) {
  creditThrow(state)
  const hit = random() < settings.playerAccuracy
  if (hit) {
    creditHit(state, settings)
    state.hits = add(state.hits, 1)
    let turns = 1
    if (random() < settings.dirtyStunSecondChance) {
      turns = 2
      if (random() < settings.dirtyStunThirdChance) turns = 3
    }
    // Reapplications refresh to the longer remaining stun, never stack.
    state.stunRemaining = Math.max(state.stunRemaining || 0, turns)
    state.lastEvent = `Your Dirty Snowball stunned the snowman for ${turns} turn${turns === 1 ? '' : 's'}!`
  } else state.lastEvent = 'Your Dirty Snowball missed.'
  state.revision = add(state.revision, 1)
  return hit
}
// Production and scheduled attacks settle in timestamp order, under the same
// SQLite transaction. Later snow income cannot fund an earlier throw.
function advanceBattle(player, state, now, accrueTo, random, settings = config) {
  let events = 0
  while (state.active && Math.min(state.nextPlayerAt, state.nextEnemyAt) <= now && events++ < settings.maxEventsPerSettlement) {
    const at = Math.min(state.nextPlayerAt, state.nextEnemyAt)
    accrueTo(at)
    // Player resolves first on an exact tie; defeating a target cancels its old attack.
    if (state.nextPlayerAt <= state.nextEnemyAt) {
      state.nextPlayerAt = add(at, settings.playerIntervalMs)
      if (player.snow >= settings.regularSnowCost) {
        player.snow -= settings.regularSnowCost
        throwAtEnemy(state, at, settings.regularDamage, random, settings)
      } else {
        state.lastEvent = 'Not enough ❄️ for a snowball. You keep collecting snow.'
        state.revision = add(state.revision, 1)
      }
    } else {
      state.nextEnemyAt = add(at, settings.enemyIntervalMs)
      if (state.stunRemaining > 0) {
        state.stunRemaining -= 1
        state.stunnedAttacks = add(state.stunnedAttacks || 0, 1)
        state.lastEvent = 'The snowman is stunned and skips its attack.'
        state.revision = add(state.revision, 1)
        continue
      }
      state.enemyAttacks = add(state.enemyAttacks, 1)
      if (random() < settings.enemyAccuracy) {
        state.enemyHits = add(state.enemyHits, 1)
        state.playerHp = Math.max(0, state.playerHp - settings.enemyDamage)
        state.lastEvent = `The snowman hit you for ${settings.enemyDamage} damage.`
        if (!state.playerHp) {
          state.active = 0
          state.phase = 'defeat'
          state.losses = add(state.losses, 1)
          if (!state.trainUnlocked) state.trainIntroPending = 1
          state.trainUnlocked = 1
        }
      } else state.lastEvent = 'The snowman missed.'
      state.revision = add(state.revision, 1)
    }
  }
  if (state.active && Math.min(state.nextPlayerAt, state.nextEnemyAt) <= now) {
    state.active = 0
    state.phase = 'paused'
    state.pauseAt = Math.min(state.nextPlayerAt, state.nextEnemyAt)
    state.lastEvent = 'The fight paused after a long interruption. Choose Snowman to continue.'
  }
  accrueTo(now)
}
function startBattle(state, now, settings = config) {
  const resume = state.phase === 'paused' && state.playerHp > 0
  const playerWait = Math.max(0, state.nextPlayerAt - state.pauseAt)
  const enemyWait = Math.max(0, state.nextEnemyAt - state.pauseAt)
  state.fightId = randomUUID()
  state.idleStarted = 1
  state.sweatUnlocked = 1
  state.active = 1
  state.phase = 'fighting'
  if (!resume) {
    state.stunRemaining = 0
    state.playerHp = settings.playerMaxHp
    state.enemyMaxHp = add(settings.sturdyBaseHp, state.defeated)
    state.enemyHp = state.enemyMaxHp
  }
  state.nextPlayerAt = add(now, resume ? playerWait : settings.playerIntervalMs)
  state.nextEnemyAt = add(now, resume ? enemyWait : settings.enemyIntervalMs)
  state.specialReadyAt = resume ? Math.max(now, state.specialReadyAt) : now
  state.lastEvent = ''
  state.revision = add(state.revision, 1)
}
const drawAccuracy = () => randomInt(0x1000000) / 0x1000000
module.exports = { config, add, freshBattle, hasStarted, creditThrow, throwAtEnemy, throwDirty, advanceBattle, startBattle, drawAccuracy }
