const { Transaction } = require('sequelize')
const { serialize } = require('./spooky/economy')
const { operationModel } = require('./wallet-operation')

// Used only during a stopped-writer rollout or on an isolated rehearsal copy.
// No command or startup worker invokes this destructive operation.
async function resetPersonalXp(User, { guildId, launchId, now = new Date() }) {
  if (![guildId, launchId].every(value => typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value)) || !Number.isFinite(new Date(now).getTime())) throw Error('Invalid personal XP reset identity')
  if (User.sequelize.getDialect() !== 'sqlite') throw Error('Personal XP reset requires SQLite')
  const Operation = operationModel(User.sequelize), operationId = `personal-xp-reset:${guildId}:${launchId}`
  return serialize(User.sequelize, () => User.sequelize.transaction({ type: Transaction.TYPES.IMMEDIATE }, async transaction => {
    const prior = await Operation.findByPk(operationId, { transaction })
    if (prior) {
      if (prior.guildId !== guildId || prior.kind !== 'personal_xp_reset') throw Error('Personal XP reset replay mismatch')
      return { replayed: true, receipt: prior.receipt }
    }
    const before = await User.findAll({ attributes: ['user_id', 'chat_exp', 'chat_level', 'last_chat_message'], order: [['user_id', 'ASC']], raw: true, transaction })
    // Raw SQL changes exactly these three columns, leaving updatedAt/history alone.
    await User.sequelize.query('UPDATE Users SET chat_exp = 0, chat_level = 1, last_chat_message = NULL', { transaction })
    const receipt = { count: before.length, level: 1, xp: 0, before }
    await Operation.create({ operationId, guildId, userId: 'server', kind: 'personal_xp_reset', receipt,
      notificationStatus: 'none', createdAt: now }, { transaction })
    return { replayed: false, receipt }
  }))
}
module.exports = { resetPersonalXp }
