const { literal } = require('sequelize')
const { serialize } = require('./spooky/economy')

function levelReward(unwanted, booster) {
  return unwanted ? { fate_points: literal('MIN(100, fate_points + 5)'),
    bank: booster ? literal('MAX(bank, MIN(100, bank + MAX(0, fate_points + 5 - 100)))') : literal('bank') } : {}
}

// This entry point runs outside economy callbacks. Sharing the connection queue
// prevents chat writes entering a seasonal transaction; the conditional update
// also claims the old XP/level/timestamp exactly once before awarding fate.
async function applyChatMessage(User, { userId, userName, now, xp, unwanted, booster, rewardFate = true }) {
  if (!Number.isSafeInteger(xp) || xp < 0 || !Number.isFinite(new Date(now).getTime())) throw new Error('Invalid chat progression')
  return serialize(User.sequelize, async () => {
    let user = await User.findByPk(userId)
    if (!user) {
      try {
        user = await User.create({ user_id: userId, user_name: userName, chat_exp: 4, chat_level: 1, last_chat_message: now })
        return { credited: false, levelUp: false, user }
      } catch (error) {
        if (error.name !== 'SequelizeUniqueConstraintError') throw error
        user = await User.findByPk(userId)
      }
    }
    if (!user) throw new Error('Chat user unavailable')
    if (new Date(now) - new Date(user.last_chat_message) < 60000) return { credited: false, levelUp: false, user }
    if (!Number.isFinite(user.chat_exp) || user.chat_exp < 0 || !Number.isSafeInteger(user.chat_level) || user.chat_level < 1) throw new Error('Invalid saved chat progression')
    const threshold = 5 * user.chat_level ** 2 + 50 * user.chat_level + 100
    const levelUp = user.chat_exp + xp >= threshold
    const values = { chat_exp: user.chat_exp + xp - (levelUp ? threshold : 0),
      chat_level: user.chat_level + Number(levelUp), last_chat_message: now,
      ...(levelUp && rewardFate ? levelReward(unwanted, booster) : {}) }
    const [changed] = await User.update(values, { where: { user_id: userId,
      chat_exp: user.chat_exp, chat_level: user.chat_level, last_chat_message: user.last_chat_message } })
    return { credited: changed === 1, levelUp: changed === 1 && levelUp,
      overflow: levelUp && unwanted && rewardFate ? Math.max(0, user.fate_points + 5 - 100) : 0, user: await User.findByPk(userId) }
  })
}

// Existing /fate reads outside a transaction. A compare-and-swap rejects stale
// balances instead of overwriting a committed seasonal purchase or reward.
async function saveWallet(User, user) {
  const bank = user.bank, fate = user.fate_points
  if (![bank, fate].every(value => Number.isSafeInteger(value) && value >= 0) || fate > 100 ||
    bank > Math.max(100, user.previous('bank'))) throw new Error('Invalid fate balance')
  const [changed] = await serialize(User.sequelize, () => User.update({ bank, fate_points: fate }, { where: {
    user_id: user.user_id, bank: user.previous('bank'), fate_points: user.previous('fate_points'),
  } }))
  if (changed !== 1) throw new Error('Your balance changed during this command. Please try again.')
}

async function awardLevelUp(User, userId, values, { unwanted, booster }) {
  // SQLite evaluates all RHS expressions from the same pre-update row. This
  // credits current balances atomically, rather than stale message snapshots.
  if (!Number.isSafeInteger(values.chat_level) || values.chat_level < 2) throw new Error('Invalid level transition')
  return serialize(User.sequelize, async () => {
    await User.update({ ...values, ...levelReward(unwanted, booster) }, {
      where: { user_id: userId, chat_level: values.chat_level - 1 },
    })
    return User.findByPk(userId)
  })
}

async function creditBank(User, userId, amount, { countBoost = false } = {}) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Invalid bank reward')
  return serialize(User.sequelize, async () => {
    await User.update({ bank: literal(`MAX(bank, MIN(100, bank + ${amount}))`), ...(countBoost ? {
    boosterTotal: literal('boosterTotal + CASE WHEN bank < 100 THEN 1 ELSE 0 END'),
  } : {}) }, { where: { user_id: userId } })
    return User.findByPk(userId)
  })
}

async function awardAchievement(User, UserAchievement, { userId, achievementId, amount }) {
  if (User.sequelize !== UserAchievement.sequelize || !Number.isSafeInteger(achievementId) || achievementId < 1 ||
    !Number.isSafeInteger(amount) || amount < 1) throw new Error('Invalid achievement award')
  // Award ownership and its wallet credit commit once together. The same queue
  // prevents this legacy command from joining an unrelated Spooky transaction.
  return serialize(User.sequelize, () => User.sequelize.transaction({ type: require('sequelize').Transaction.TYPES.IMMEDIATE }, async transaction => {
    const user = await User.findByPk(userId, { transaction })
    if (!user || !Number.isSafeInteger(user.bank) || user.bank < 0) throw new Error('Invalid achievement wallet')
    const before = user.bank
    const where = { userId, achievementId }
    if (await UserAchievement.findOne({ where, transaction })) return { awarded: false, before, bank: before, credited: 0 }
    await UserAchievement.create(where, { transaction })
    // Pre-existing above-cap balances are retained, never silently clamped.
    const bank = before >= 100 ? before : Math.min(100, before + amount)
    await user.update({ bank }, { transaction })
    return { awarded: true, before, bank, credited: bank - before }
  }))
}
async function removeAchievement(UserAchievement, where) {
  return serialize(UserAchievement.sequelize, () => UserAchievement.destroy({ where }))
}
module.exports = { saveWallet, awardLevelUp, creditBank, applyChatMessage, awardAchievement, removeAchievement }
