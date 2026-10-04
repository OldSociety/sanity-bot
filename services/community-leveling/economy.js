const { Transaction } = require('sequelize')
const { serialize } = require('../spooky/economy')
const { rules, dayKey } = require('./config')
function createCommunity({ User, models, config, resolveRecipients }) {
  const db = User.sequelize
  if (Object.values(models).some(model => model.sequelize !== db)) throw new Error('Community and Fate must share storage')
  async function attempt(input, recipients) {
    return serialize(db, () => db.transaction({ type: Transaction.TYPES.IMMEDIATE }, async transaction => {
      const scope = { guildId: input.guildId }, receiptKey = { ...scope, messageId: input.messageId }
      const previous = await models.Receipt.findOne({ where: receiptKey, transaction })
      if (previous) {
        if (previous.userId !== input.userId) throw new Error('Community message identity changed')
        return { ...previous.result, replayed: true }
      }
      const [guild] = await models.Guild.findOrCreate({ where: scope, transaction })
      const day = dayKey(input.now, config.timezone)
      const [daily] = await models.Day.findOrCreate({ where: { ...scope, day }, transaction })
      const [member] = await models.Member.findOrCreate({ where: { ...scope, userId: input.userId }, defaults: { day }, transaction })
      if (![guild.level, guild.xp, daily.earned, member.earned].every(Number.isSafeInteger) || guild.level < 1 || guild.xp < 0 || guild.xp >= rules.levelRequirement || daily.earned < 0 || member.earned < 0) throw new Error('Invalid community state')
      const memberEarned = member.day === day ? member.earned : 0
      const result = { credited: false, levelUp: false, level: guild.level, xp: guild.xp, rewards: [] }
      if ((member.lastEarnedAt && input.now - new Date(member.lastEarnedAt) < rules.intervalMs) ||
        memberEarned >= rules.userDailyCap || daily.earned >= rules.guildDailyCap) {
        await models.Receipt.create({ ...receiptKey, userId: input.userId, result }, { transaction })
        return result
      }
      const levelUp = guild.xp + 1 >= rules.levelRequirement
      if (levelUp && recipients === undefined) { const error = new Error('Campaign roster required'); error.code = 'COMMUNITY_ROSTER'; throw error }
      const rewards = []
      if (levelUp) {
        if (!Array.isArray(recipients) || recipients.some(player => !player?.userId || !player.userName) || new Set(recipients.map(player => player.userId)).size !== recipients.length) throw new Error('Invalid complete campaign roster')
        for (const player of recipients) {
          const [user] = await User.findOrCreate({ where: { user_id: player.userId }, defaults: { user_name: player.userName }, transaction })
          if (!Number.isSafeInteger(user.fate_points) || user.fate_points < 0 || user.fate_points > rules.fateCap) throw new Error('Invalid Fate balance')
          const before = user.fate_points, after = Math.min(rules.fateCap, before + rules.levelReward)
          await user.update({ fate_points: after }, { transaction })
          rewards.push({ userId: player.userId, before, after, credited: after - before })
        }
      }
      await guild.update({ level: guild.level + Number(levelUp), xp: guild.xp + 1 - (levelUp ? rules.levelRequirement : 0) }, { transaction })
      await daily.update({ earned: daily.earned + 1 }, { transaction })
      await member.update({ day, earned: memberEarned + 1, lastEarnedAt: input.now }, { transaction })
      Object.assign(result, { credited: true, levelUp, level: guild.level, xp: guild.xp, rewards })
      await models.Receipt.create({ ...receiptKey, userId: input.userId, result }, { transaction })
      return result
    }))
  }
  async function earn(input) {
    if (!config.enabled || input.guildId !== config.guildId) return { credited: false, disabled: true }
    if (![input.guildId, input.userId, input.messageId].every(value => typeof value === 'string' && value) || !(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) throw new Error('Invalid community message')
    try { return await attempt(input) } catch (error) {
      if (error.code !== 'COMMUNITY_ROSTER') throw error
      // Discord is deliberately outside both the transaction and connection queue.
      const recipients = await resolveRecipients(input.guildId)
      return attempt(input, recipients)
    }
  }
  return { earn }
}
module.exports = { createCommunity }
