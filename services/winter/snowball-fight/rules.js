const config = require('../../../config/winter/snowball-fight.json')
const DAY = 86400000
const dayAt = now => new Date(now).toISOString().slice(0, 10)
const resetAt = now => (Math.floor(now / DAY) + 1) * DAY
// Collection/edition is separate from character identity for future rarity/season variants.
const badgeId = (id, collection = 'classic') => `snowball-fight:${collection}:${id}`
const achievements = [
  ['first-snow', 'First Snow', 'collections', 1],
  ['first-contact', 'First Contact', 'hits', 1],
  ['snow-collector', 'Snow Collector', 'collected', 100],
  ['sharpshooter', 'Sharpshooter', 'bestStreak', 3],
  ['veteran', 'Snowball Veteran', 'throws', 100],
  ['daily-routine', 'Daily Routine', 'dailies', 7],
  ['challenger', 'First Challenger', 'wins', 1],
  ['badge-collector', 'Badge Collector', 'badges', 3],
  ['classic-collector', 'Classic Collector', 'badges', 10]
].map(([id, name, counter, target]) => ({ id, name, counter, target }))
const questPool = [
  { id: 'hits', label: 'Land 3 PvP hits', counter: 'hits', target: 3, reward: 20 },
  { id: 'streak', label: 'Land 3 consecutive PvP hits today', counter: 'bestStreak', target: 3, reward: 25 },
  { id: 'gift', label: 'Gift snowballs once', counter: 'gifts', target: 1, reward: 15 },
  { id: 'victory', label: 'Defeat a character', counter: 'wins', target: 1, reward: 25 },
  { id: 'activity', label: 'Complete 6 gameplay actions', counter: 'activity', target: 6, reward: 15 }
]
function quests(day) {
  const index = Math.floor(Date.parse(day) / DAY) % questPool.length
  return [
    { id: 'collect', label: 'Collect 4 snowballs', counter: 'collected', target: 4, reward: 15 },
    { id: 'challenge', label: 'Take a turn in a character fight', counter: 'fightTurns', target: 1, reward: 20 },
    questPool[index]
  ]
}
function fresh(now) {
  return { joinedAt: now, collected: 0, collections: 0, throws: 0, hits: 0, timesHit: 0,
    streak: 0, bestStreak: 0, wins: 0, badges: 0, dailies: 0, pvpRewards: 0,
    lastCollect: null, lastThrow: null, cocoa: 0, snowflake: 0, equipped: null,
    achievements: [], daily: { day: dayAt(now), quests: quests(dayAt(now)), counters: {}, pvpRewards: 0 } }
}
function currentDay(state, now) {
  if (state.daily.day !== dayAt(now)) state.daily = { day: dayAt(now), quests: quests(dayAt(now)), counters: {}, pvpRewards: 0 }
  state.daily.quests ||= quests(state.daily.day)
}
function progress(state, counter, amount = 1) {
  state.daily.counters[counter] = (state.daily.counters[counter] || 0) + amount
}
// All draws for a fight are persisted with the fight. Delivery/restart never rerolls a turn.
function draw(battle) {
  battle.seed = (Math.imul(1664525, battle.seed) + 1013904223) >>> 0
  return battle.seed / 4294967296
}
function turn(battle, action) {
  const c = battle.rules
  battle.rounds++
  let text
  if (action === 'heal') {
    const amount = Math.min(c.heal, c.playerHp - battle.hp)
    battle.hp += amount
    battle.heals++
    text = `Hot cocoa restores ${amount} HP.`
  } else {
    battle.spent++
    const hit = draw(battle) < c.accuracy
    if (hit) battle.enemyHp = Math.max(0, battle.enemyHp - c.damage)
    text = hit ? `Your snowball hits for ${c.damage}.` : 'Your snowball misses.'
  }
  if (battle.enemyHp === 0) battle.outcome = 'victory'
  else {
    const hit = draw(battle) < battle.character.accuracy
    if (hit) battle.hp = Math.max(0, battle.hp - battle.character.damage)
    text += hit ? ` ${battle.character.name} hits for ${battle.character.damage}.` : ` ${battle.character.name} misses.`
    if (battle.hp === 0) battle.outcome = 'defeat'
    else if (battle.rounds >= c.maxRounds) battle.outcome = 'defeat'
  }
  battle.last = text
  battle.revision++
  return battle
}
module.exports = { config, DAY, dayAt, resetAt, badgeId, achievements, quests, fresh, currentDay, progress, turn }
