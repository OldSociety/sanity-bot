const { Transaction } = require('sequelize')
const { randomUUID, randomBytes } = require('node:crypto')
const { serialize } = require('../../spooky/economy')
const migration = require('../../../migrations/snowball-fight')
const R = require('./rules')
class GameError extends Error {}
const requireRule = (condition, message) => { if (!condition) throw new GameError(message) }
function createStore({ sequelize, clock = Date.now, random = Math.random, seed = () => randomBytes(4).readUInt32LE(), config = R.config }) {
  let initialized
  function initialize() {
    return initialized ||= serialize(sequelize, () => sequelize.transaction({ type: Transaction.TYPES.IMMEDIATE },
      transaction => migration.up(sequelize.getQueryInterface(), { transaction }))).catch(error => { initialized = null; throw error })
  }
  async function execute(input) {
    for (const key of ['guildId', 'userId', 'interactionId', 'action'])
      if (typeof input[key] !== 'string' || !input[key]) throw Error(`Missing ${key}`)
    await initialize()
    return serialize(sequelize, () => sequelize.transaction({ type: Transaction.TYPES.IMMEDIATE }, async transaction => {
      const now = clock(), day = R.dayAt(now)
      const identity = JSON.stringify([input.guildId, input.userId, input.action, input.targetId || null,
        input.characterId || null, input.itemId || null, input.amount ?? null, input.questId || null,
        input.battleId || null, input.revision ?? null, input.metric || null, input.page ?? null])
      const query = (sql, bind = {}) => sequelize.query(sql, { bind, transaction })
      const rows = async (sql, bind) => (await query(sql, bind))[0]
      const prior = (await rows('SELECT * FROM SnowFightReceipts WHERE id=$id', { id: input.interactionId }))[0]
      if (prior) {
        if (prior.identity !== identity) throw Error('Snowball interaction replay identity mismatch')
        return { ...JSON.parse(prior.response), replayed: true }
      }
      const scope = { guild: input.guildId, user: input.userId }
      const readPlayer = async user => {
        const row = (await rows('SELECT * FROM SnowFightPlayers WHERE guildId=$guild AND userId=$user', { ...scope, user }))[0]
        if (!row) return null
        const state = JSON.parse(row.state)
        R.currentDay(state, now)
        return { userId: user, snowballs: row.snowballs, buttons: row.buttons, state }
      }
      const save = p => query(`UPDATE SnowFightPlayers SET state=$state,snowballs=$snowballs,buttons=$buttons,
        throws=$throws,hits=$hits,wins=$wins,badges=$badges WHERE guildId=$guild AND userId=$user`,
      { ...scope, user: p.userId, state: JSON.stringify(p.state), snowballs: p.snowballs, buttons: p.buttons,
        throws: p.state.throws, hits: p.state.hits, wins: p.state.wins, badges: p.state.badges })
      let p = await readPlayer(input.userId)
      const ledger = async (player, resource, delta, reason) => {
        if (!delta) return
        requireRule(Number.isSafeInteger(delta) && Number.isSafeInteger(player[resource] + delta) && player[resource] + delta >= 0,
          `Not enough ${resource}.`)
        player[resource] += delta
        await query(`INSERT INTO SnowFightLedger(interactionId,guildId,userId,resource,delta,balance,reason,at)
          VALUES($id,$guild,$user,$resource,$delta,$balance,$reason,$at)`,
        { ...scope, user: player.userId, id: input.interactionId, resource, delta, balance: player[resource], reason, at: now })
      }
      const snow = (player, amount, reason) => ledger(player, 'snowballs', Math.min(amount, config.collection.capacity - player.snowballs), reason)
      const coins = (amount, reason) => ledger(p, 'buttons', amount, reason)
      const activity = () => R.progress(p.state, 'activity')
      const target = async () => {
        requireRule(input.targetId && input.targetId !== input.userId && !input.targetBot, 'Choose another participating human member.')
        const other = await readPlayer(input.targetId)
        requireRule(other, 'That member must join with /snowball-fight start first.')
        return other
      }
      const receipt = { action: input.action, at: now, resetAt: R.resetAt(now), notices: [] }
      if (!p) {
        requireRule(input.action === 'start', 'Join first with /snowball-fight start.')
        p = { userId: input.userId, snowballs: 0, buttons: 0, state: R.fresh(now) }
        await query(`INSERT INTO SnowFightPlayers(guildId,userId,state,snowballs,buttons) VALUES($guild,$user,$state,0,0)`,
          { ...scope, state: JSON.stringify(p.state) })
        await snow(p, config.collection.starting, 'registration')
        receipt.message = 'Welcome! Collect snowballs, challenge characters, and throw at other participants.'
      } else if (input.action === 'start') receipt.message = 'Your existing profile is ready. Your progress has been preserved.'
      let battle = (await rows('SELECT state FROM SnowFightBattles WHERE guildId=$guild AND userId=$user', scope))[0]
      battle = battle ? JSON.parse(battle.state) : null
      const closeBattle = async () => {
        await query(`INSERT INTO SnowFightEncounters(id,guildId,userId,characterId,outcome,rounds,snowballs,at)
          VALUES($id,$guild,$user,$character,$outcome,$rounds,$snowballs,$at)`,
        { ...scope, id: battle.id, character: battle.character.id, outcome: battle.outcome, rounds: battle.rounds, snowballs: battle.spent, at: now })
        await query('DELETE FROM SnowFightBattles WHERE guildId=$guild AND userId=$user', scope)
      }
      // Expiry only records an abandoned encounter. Never advances combat or grants rewards.
      if (battle && now >= battle.expiresAt) {
        battle.outcome = 'expired'
        await closeBattle()
        receipt.notices.push('Your previous encounter expired without rewards.')
        battle = null
      }
      const s = p.state
      if (input.action === 'collect') {
        requireRule(s.lastCollect === null || now - s.lastCollect >= config.collection.cooldownMs,
          `Collect again <t:${Math.ceil(((s.lastCollect || 0) + config.collection.cooldownMs) / 1000)}:R>.`)
        requireRule(p.snowballs < config.collection.capacity, `Your snowball inventory is full (${config.collection.capacity}/${config.collection.capacity}).`)
        const amount = Math.min(config.collection.amount, config.collection.capacity - p.snowballs)
        await snow(p, amount, 'collection')
        s.lastCollect = now; s.collected += amount; s.collections++
        R.progress(s, 'collected', amount); activity()
        receipt.message = `Collected ${amount} snowballs.`
      } else if (input.action === 'daily') {
        requireRule(!(await rows('SELECT 1 FROM SnowFightDaily WHERE guildId=$guild AND userId=$user AND day=$day', { ...scope, day })).length,
          `Already claimed today. Next reset <t:${Math.floor(R.resetAt(now) / 1000)}:R>.`)
        await query('INSERT INTO SnowFightDaily VALUES($guild,$user,$day)', { ...scope, day })
        const amount = Math.min(config.daily.snowballs, config.collection.capacity - p.snowballs)
        await snow(p, amount, 'daily'); await coins(config.daily.buttons, 'daily')
        s.dailies++; activity()
        receipt.message = `Daily claimed: ${amount} snowballs and ${config.daily.buttons} Buttons. Snowballs are limited by your inventory capacity.`
      } else if (input.action === 'throw') {
        const other = await target()
        requireRule(s.lastThrow === null || now - s.lastThrow >= config.pvp.cooldownMs,
          `Throw again <t:${Math.ceil(((s.lastThrow || 0) + config.pvp.cooldownMs) / 1000)}:R>.`)
        requireRule(p.snowballs >= config.pvp.cost, 'Collect more snowballs before throwing.')
        const recent = await rows(`SELECT attacker,target FROM SnowFightThrows WHERE guildId=$guild AND
          ((attacker=$user AND target=$target AND at>$same) OR (attacker=$target AND target=$user AND at>$reciprocal))`,
        { ...scope, target: input.targetId, same: now - config.pvp.sameTargetMs, reciprocal: now - config.pvp.reciprocalMs })
        const hit = random() < config.pvp.hitChance
        const eligible = hit && recent.length === 0 && s.daily.pvpRewards < config.pvp.dailyCap
        await ledger(p, 'snowballs', -config.pvp.cost, 'pvp-throw')
        s.lastThrow = now; s.throws++; s.hits += Number(hit); s.streak = hit ? s.streak + 1 : 0
        s.bestStreak = Math.max(s.bestStreak, s.streak)
        if (hit) { other.state.timesHit++; R.progress(s, 'hits') }
        s.daily.counters.bestStreak = hit ? Math.max(s.daily.counters.bestStreak || 0, (s.daily.counters.streak || 0) + 1) : s.daily.counters.bestStreak || 0
        s.daily.counters.streak = hit ? (s.daily.counters.streak || 0) + 1 : 0
        if (eligible) {
          await coins(config.pvp.reward, 'pvp-hit'); s.pvpRewards += config.pvp.reward; s.daily.pvpRewards += config.pvp.reward
        }
        await query('INSERT INTO SnowFightThrows VALUES($id,$guild,$user,$target,$hit,$reward,$at)',
          { ...scope, id: input.interactionId, target: input.targetId, hit: Number(hit), reward: eligible ? config.pvp.reward : 0, at: now })
        await save(other); activity()
        receipt.message = `Your snowball ${hit ? 'hits' : 'misses'} <@${input.targetId}>!${eligible ? ` +${config.pvp.reward} Button.` : hit ? ' Hit recorded; repeat-target, reciprocal or daily reward limit applies.' : ''}`
      } else if (input.action === 'gift') {
        const other = await target(), amount = input.amount
        requireRule(Number.isSafeInteger(amount) && amount > 0 && amount <= config.collection.capacity, `Choose 1–${config.collection.capacity} snowballs to gift.`)
        requireRule(other.snowballs + amount <= config.collection.capacity, 'The recipient does not have enough inventory space.')
        await ledger(p, 'snowballs', -amount, 'gift-sent'); await ledger(other, 'snowballs', amount, 'gift-received')
        await query('INSERT INTO SnowFightGifts VALUES($id,$guild,$user,$target,$amount,$at)',
          { ...scope, id: input.interactionId, target: other.userId, amount, at: now })
        R.progress(s, 'gifts'); activity(); await save(other)
        receipt.message = `Gifted ${amount} snowballs to <@${other.userId}>.`
      } else if (input.action === 'buy') {
        const item = config.items.find(item => item.id === input.itemId)
        requireRule(item, 'Unknown shop item.')
        if (item.id === 'snowballs') requireRule(p.snowballs + item.quantity <= config.collection.capacity, 'Make room for the complete snowball bundle first.')
        else requireRule((s[item.id] || 0) + item.quantity <= item.capacity, 'You already own the maximum quantity.')
        await coins(-item.price, `purchase:${item.id}`)
        if (item.id === 'snowballs') await snow(p, item.quantity, 'shop')
        else s[item.id] = (s[item.id] || 0) + item.quantity
        receipt.message = `Purchased ${item.name} for ${item.price} Buttons.`
      } else if (input.action === 'claim') {
        const available = s.daily.quests.filter(q => !input.questId || q.id === input.questId)
        requireRule(available.length > 0, 'That quest is not assigned today.')
        let count = 0
        for (const q of available) {
          const claimed = (await rows('SELECT 1 FROM SnowFightQuestClaims WHERE guildId=$guild AND userId=$user AND day=$day AND questId=$quest',
            { ...scope, day, quest: q.id })).length
          if (claimed || (s.daily.counters[q.counter] || 0) < q.target) continue
          await query('INSERT INTO SnowFightQuestClaims VALUES($guild,$user,$day,$quest)', { ...scope, day, quest: q.id })
          await coins(q.reward, `quest:${q.id}`); count++
        }
        requireRule(count > 0, 'No completed, unclaimed quests yet.')
        receipt.message = `Claimed ${count} quest reward${count === 1 ? '' : 's'}.`
      } else if (input.action === 'choose') {
        requireRule(config.characters.some(c => c.id === input.characterId), 'Unknown character.')
        const owned = await rows('SELECT 1 FROM BadgeOwnership WHERE guildId=$guild AND userId=$user AND badgeId=$badge',
          { ...scope, badge: R.badgeId(input.characterId) })
        requireRule(owned.length, 'Unlock that character badge before equipping it.')
        s.equipped = input.characterId
        receipt.message = `Equipped Classic ${config.characters.find(c => c.id === s.equipped).name}.`
      } else if (input.action === 'fight') {
        if (!battle) {
          const character = config.characters.find(c => c.id === input.characterId && c.enabled)
          requireRule(character, 'Choose an available character: Hendrix, Kylax or Azulis.')
          requireRule(p.snowballs > 0, 'Collect snowballs before starting a character fight.')
          battle = { id: randomUUID(), revision: 0, seed: seed() >>> 0, rules: { ...config.combat }, character: { ...character },
            hp: config.combat.playerHp, enemyHp: character.hp, rounds: 0, spent: 0, heals: 0, expiresAt: now + config.combat.expiresMs, outcome: null }
        }
        receipt.message = `Challenge: Classic ${battle.character.name}. Each attack uses one snowball. Cocoa uses your turn. Defeat after ${battle.rules.maxRounds} turns; no automatic turns.`
      } else if (['attack', 'heal', 'retreat'].includes(input.action)) {
        requireRule(battle && battle.id === input.battleId && battle.revision === input.revision, 'These fight controls expired. Reopen /snowball-fight fight to resume your saved encounter.')
        if (input.action === 'retreat') {
          battle.outcome = 'retreat'; battle.revision++; battle.last = 'You retreated safely. No rewards were granted.'
        } else {
          if (input.action === 'heal') {
            requireRule(s.cocoa > 0 && battle.heals < battle.rules.maxHeals && battle.hp < battle.rules.playerHp, 'Cocoa is unavailable, HP is full, or the encounter limit was reached.')
            s.cocoa--
          } else await ledger(p, 'snowballs', -1, 'character-attack')
          R.turn(battle, input.action); R.progress(s, 'fightTurns'); activity()
        }
        if (battle.outcome) {
          if (battle.outcome === 'victory') {
            s.wins++; R.progress(s, 'wins')
            const character = battle.character.id
            const qualified = !(await rows(`SELECT 1 FROM SnowFightCharacterDays WHERE guildId=$guild AND userId=$user AND characterId=$character AND day=$day`, { ...scope, character, day })).length
            if (qualified) {
              await query('INSERT INTO SnowFightCharacterDays VALUES($guild,$user,$character,$day)', { ...scope, character, day })
              await coins(battle.rules.reward, `victory:${character}`)
              await query(`INSERT INTO SnowFightBadgeProgress VALUES($guild,$user,$character,1)
                ON CONFLICT(guildId,userId,characterId) DO UPDATE SET marks=MIN(marks+1,$cap)`,
              { ...scope, character, cap: battle.rules.badgeVictories })
              const marks = (await rows('SELECT marks FROM SnowFightBadgeProgress WHERE guildId=$guild AND userId=$user AND characterId=$character', { ...scope, character }))[0].marks
              receipt.notices.push(`Classic ${battle.character.name}: ${marks}/${battle.rules.badgeVictories} badge marks. +${battle.rules.reward} Buttons.`)
              if (marks >= battle.rules.badgeVictories) {
                const badge = R.badgeId(character)
                const existing = await rows('SELECT 1 FROM BadgeOwnership WHERE guildId=$guild AND userId=$user AND badgeId=$badge', { ...scope, badge })
                if (!existing.length) {
                  await require('../../badges').awardOwnership({ sequelize, transaction, guildId: input.guildId, userId: input.userId,
                    badgeId: badge, sourceEventId: 'snowball-fight', now: new Date(now) })
                  s.badges++; receipt.unlocked = character
                }
              }
            } else receipt.notices.push('Victory recorded. Badge marks and Buttons are limited to the first victory per character per UTC day.')
          }
          await closeBattle()
        }
        receipt.message = `${battle.last}${battle.outcome ? ` Result: ${battle.outcome}.` : ''}`
      } else if (!['start', 'stats', 'quests', 'achievements', 'collection', 'shop', 'item-info', 'leaderboard', 'news', 'help'].includes(input.action)) {
        throw new GameError('Unknown snowball-fight action.')
      }
      for (const achievement of R.achievements) {
        if ((s[achievement.counter] || 0) < achievement.target || s.achievements.includes(achievement.id)) continue
        await query('INSERT INTO SnowFightAchievements VALUES($guild,$user,$achievement,$at)', { ...scope, achievement: achievement.id, at: now })
        s.achievements.push(achievement.id)
        await coins(config.achievementReward, `achievement:${achievement.id}`)
        receipt.notices.push(`Achievement unlocked: ${achievement.name}! +${config.achievementReward} Buttons.`)
      }
      await save(p)
      if (battle && !battle.outcome) await query(`INSERT INTO SnowFightBattles VALUES($guild,$user,$state)
        ON CONFLICT(guildId,userId) DO UPDATE SET state=excluded.state`, { ...scope, state: JSON.stringify(battle) })
      receipt.player = p
      if (['stats', 'start'].includes(input.action)) receipt.rank = 1 + (await rows(`SELECT COUNT(*) AS count FROM SnowFightPlayers
        WHERE guildId=$guild AND (hits>$hits OR (hits=$hits AND userId<$user))`, { ...scope, hits: s.hits }))[0].count
      if (['fight', 'attack', 'heal', 'retreat'].includes(input.action)) receipt.battle = battle
      if (input.action === 'collection') {
        receipt.marks = await rows('SELECT characterId,marks FROM SnowFightBadgeProgress WHERE guildId=$guild AND userId=$user', scope)
        receipt.owned = (await rows('SELECT badgeId FROM BadgeOwnership WHERE guildId=$guild AND userId=$user', scope)).map(row => row.badgeId)
      }
      if (['quests', 'claim'].includes(input.action)) receipt.claimed = (await rows('SELECT questId FROM SnowFightQuestClaims WHERE guildId=$guild AND userId=$user AND day=$day', { ...scope, day })).map(q => q.questId)
      if (input.action === 'item-info') requireRule(config.items.some(item => item.id === input.itemId), 'Unknown item.')
      receipt.itemId = input.itemId || null
      if (input.action === 'leaderboard') {
        const metric = input.metric || 'hits', page = input.page || 1
        requireRule(['hits', 'accuracy', 'wins', 'badges'].includes(metric) && Number.isSafeInteger(page) && page >= 1 && page <= 10000, 'Invalid leaderboard selection.')
        const score = metric === 'accuracy' ? '100.0*hits/throws' : metric
        const where = metric === 'accuracy' ? `AND throws >= ${config.pvp.accuracyMinimum}` : ''
        receipt.leaders = await rows(`SELECT userId,${score} AS score FROM SnowFightPlayers WHERE guildId=$guild ${where}
          ORDER BY score DESC,userId ASC LIMIT 10 OFFSET $offset`, { guild: input.guildId, offset: (page - 1) * 10 })
        receipt.metric = metric; receipt.page = page
      }
      await query('INSERT INTO SnowFightReceipts VALUES($id,$identity,$response,$at)',
        { id: input.interactionId, identity, response: JSON.stringify(receipt), at: now })
      return receipt
    }))
  }
  return { initialize, execute }
}
module.exports = { createStore, GameError }
