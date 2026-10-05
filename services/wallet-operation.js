const { DataTypes, Transaction } = require('sequelize')
const { serialize } = require('./spooky/economy')

function operationModel(sequelize) {
  return sequelize.models.WalletOperation || sequelize.define('WalletOperation', {
    operationId: { type: DataTypes.STRING, primaryKey: true },
    guildId: { type: DataTypes.STRING, allowNull: false },
    userId: { type: DataTypes.STRING, allowNull: false },
    kind: { type: DataTypes.STRING, allowNull: false },
    receipt: { type: DataTypes.JSON, allowNull: false },
    notificationStatus: { type: DataTypes.STRING, allowNull: false },
    messageId: { type: DataTypes.STRING, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  }, { tableName: 'WalletOperations', timestamps: false })
}

function identity(input) {
  for (const key of ['guildId', 'userId', 'operationId', 'kind']) {
    if (typeof input[key] !== 'string' || !input[key].trim()) throw new Error(`Missing wallet ${key}`)
  }
}

async function execute(User, input, mutate) {
  identity(input)
  const Operation = operationModel(User.sequelize)
  return serialize(User.sequelize, () => User.sequelize.transaction({ type: Transaction.TYPES.IMMEDIATE }, async transaction => {
    const prior = await Operation.findByPk(input.operationId, { transaction })
    if (prior) {
      if (['guildId', 'userId', 'kind'].some(key => prior[key] !== input[key])) throw new Error('Wallet replay identity mismatch')
      return { operationId: input.operationId, replayed: true, receipt: prior.receipt }
    }
    const user = await User.findByPk(input.userId, { transaction })
    if (!user || ![user.bank, user.fate_points].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('Invalid wallet')
    const before = user.get({ plain: true })
    const result = mutate(before)
    if (result.success) await user.update({ bank: result.bank, fate_points: result.fate_points }, { transaction })
    const receipt = { ...result, before, after: user.get({ plain: true }) }
    await Operation.create({ ...input, receipt, notificationStatus: input.kind === 'birthday' ? 'pending' : 'none', createdAt: new Date() }, { transaction })
    return { operationId: input.operationId, replayed: false, receipt }
  }))
}

function reroll(User, { guildId, userId, interactionId }) {
  if (typeof interactionId !== 'string' || !interactionId.trim()) throw new Error('Missing reroll interaction ID')
  return execute(User, { guildId, userId, operationId: `reroll:${interactionId}`, kind: 'reroll' }, before => {
    if (before.bank + before.fate_points < 10) return { success: false, reason: 'insufficient' }
    const bankSpent = Math.min(10, before.bank), fateSpent = 10 - bankSpent
    return { success: true, bankSpent, fateSpent, bank: before.bank - bankSpent, fate_points: before.fate_points - fateSpent }
  })
}

function birthday(User, { guildId, userId, year }) {
  if (!Number.isSafeInteger(year) || year < 2020 || year > 9999) throw new Error('Invalid birthday year')
  return execute(User, { guildId, userId, operationId: `birthday:${guildId}:${userId}:${year}`, kind: 'birthday' }, before => {
    const bank = Math.max(before.bank, Math.min(100, before.bank + 10))
    return { success: true, bank, fate_points: before.fate_points, credited: bank - before.bank, year }
  })
}

// Reserve before sending: uncertain Discord outcomes are never resent automatically.
// Currency and annual uniqueness have already committed independently of delivery.
async function notifyBirthday(User, operationId, send) {
  const Operation = operationModel(User.sequelize)
  const claimed = await serialize(User.sequelize, () => Operation.update({ notificationStatus: 'sending' }, {
    where: { operationId, kind: 'birthday', notificationStatus: 'pending' },
  }))
  if (claimed[0] !== 1) return false
  try {
    const message = await send()
    await serialize(User.sequelize, () => Operation.update({ notificationStatus: 'sent', messageId: message?.id || null }, { where: { operationId } }))
    return true
  } catch (error) {
    await serialize(User.sequelize, () => Operation.update({ notificationStatus: 'uncertain' }, { where: { operationId } }))
    throw error
  }
}

module.exports = { operationModel, reroll, birthday, notifyBirthday }
