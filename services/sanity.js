const { DataTypes: D, Transaction, Op } = require('sequelize')
const { defineDailyModels, dayIndex, dayAt } = require('./sanity-daily-models')
const { serialize } = require('./spooky/economy')
const { dayKey } = require('./community-leveling/config')
const data = require('../config/sanity.json')
function selected(environment = process.env.NODE_ENV) {
  const enabled = (environment === 'development' && data.developmentEnabled === true) ||
    (environment === 'production' && data.productionEnabled === true)
  return { ...data, enabled, spendingEnabled: enabled && data[`${environment}SpendingEnabled`] === true }
}
function defineModels(db) {
  const key = () => ({ type: D.STRING, primaryKey: true, allowNull: false })
  const integer = defaultValue => ({ type: D.INTEGER, defaultValue, allowNull: false })
  return {
    Account: db.models.SanityAccount || db.define('SanityAccount', { guildId: key(), userId: key(), balance: integer(data.starting),
      day: { type: D.STRING, allowNull: false }, earned: integer(0), lastEarnedAt: D.DATE,
      lastActiveAt: { type: D.DATE, allowNull: false }, decayDays: integer(0) }, { timestamps: false, freezeTableName: true }),
    ...defineDailyModels(db),
    Receipt: db.models.SanityReceipt || db.define('SanityReceipt', { guildId: key(), operationId: key(),
      userId: { type: D.STRING, allowNull: false }, result: { type: D.JSON, allowNull: false } }, { timestamps: false, freezeTableName: true }),
  }
}
function createSanity({ sequelize, config = selected(), models = defineModels(sequelize), timezone = 'America/Los_Angeles' }) {
  const transaction = work => serialize(sequelize, () => sequelize.transaction({ type: Transaction.TYPES.IMMEDIATE }, work))
  async function accountInTransaction(guildId, userId, now, tx) {
    if (!guildId || !userId || !Number.isFinite(+now)) throw new Error('Invalid Sanity identity/time')
    const [account] = await models.Account.findOrCreate({ where: { guildId, userId }, defaults: {
      balance: config.starting, day: dayKey(now, timezone), lastActiveAt: now }, transaction: tx })
    if (!Number.isSafeInteger(account.balance) || account.balance < 0 || account.balance > config.capacity) throw new Error('Invalid saved Sanity')
    const today = dayKey(now, timezone), lastClosed = dayIndex(today) - 1
    const [state] = await models.State.findOrCreate({ where: { guildId, userId }, defaults: { lastSettledDay: dayAt(lastClosed) }, transaction: tx })
    const settled = dayIndex(state.lastSettledDay)
    if (lastClosed < settled) throw Error('Out-of-order Sanity date')
    if (lastClosed > settled) {
      const first = dayAt(settled + 1), last = dayAt(lastClosed)
      const activeDays = await models.Day.count({ where: { guildId, userId, day: { [Op.between]: [first, last] }, presenceGranted: true }, transaction: tx })
      const inactiveDays = lastClosed - settled - activeDays
      const before = account.balance, after = Math.max(0, before - inactiveDays * config.decayAmount)
      await account.update({ balance: after }, { transaction: tx })
      await state.update({ lastSettledDay: last }, { transaction: tx })
      await models.Receipt.create({ guildId, userId, operationId: `daily:${userId}:${first}:${last}`,
        result: { before, after, credited: after - before, kind: 'daily-settlement', fromDay: first, throughDay: last, activeDays, inactiveDays } }, { transaction: tx })
    }
    return account
  }
  async function viewInTransaction(guildId, userId, now, tx) {
    const account = await accountInTransaction(guildId, userId, now, tx)
    return { balance: account.balance, maximum: config.capacity }
  }
  async function spendInTransaction({ guildId, userId, now, cost, expected }, tx) {
    if (!Number.isSafeInteger(cost) || cost <= 0) throw new Error('Invalid Sanity cost')
    const account = await accountInTransaction(guildId, userId, now, tx)
    if (expected !== undefined && account.balance !== expected) throw new Error('Your Sanity changed. Review the purchase again.')
    if (account.balance < cost) throw new Error('Insufficient Sanity')
    const before = account.balance
    await account.update({ balance: before - cost }, { transaction: tx })
    return { sanityBefore: before, sanity: account.balance, sanitySpent: cost }
  }
  async function gain({ guildId, userId, messageId, channelId = null, now }) {
    if (!config.enabled) return null
    return transaction(async tx => {
      const operationId = `chat:${messageId}`, where = { guildId, operationId }
      const old = await models.Receipt.findOne({ where, transaction: tx })
      if (old) { if (old.userId !== userId) throw new Error('Sanity message owner changed'); return { ...old.result, replayed: true } }
      const account = await accountInTransaction(guildId, userId, now, tx), before = account.balance
      if (now < new Date(account.lastActiveAt)) throw new Error('Out-of-order Sanity activity')
      const day = dayKey(now, timezone)
      const [presence] = await models.Day.findOrCreate({ where: { guildId, userId, day }, defaults: { firstActiveAt: now, channelId }, transaction: tx })
      const first = !presence.presenceGranted
      const conversation = !first && !presence.conversationGranted && now - new Date(presence.firstActiveAt) >= config.conversationIntervalMs
      const reward = first ? config.presenceReward : conversation ? config.conversationReward : 0
      const credited = Math.min(reward, config.capacity - before, config.dailyCap - presence.credited)
      if (!first && !conversation) return { before, after: before, credited: 0, kind: 'chat' }
      // Presence/bonus are consumed even at 100: purchases cannot refill them
      // again later today. Messages after these two markers earn nothing.
      await presence.update({ presenceGranted: true, conversationGranted: presence.conversationGranted || conversation,
        credited: presence.credited + credited }, { transaction: tx })
      await account.update({ balance: before + credited, day, earned: presence.credited,
        lastEarnedAt: reward ? now : account.lastEarnedAt, lastActiveAt: now }, { transaction: tx })
      const result = { before, after: account.balance, credited, kind: first ? 'daily-presence' : conversation ? 'daily-conversation' : 'chat' }
      await models.Receipt.create({ ...where, userId, result }, { transaction: tx })
      return result
    })
  }
  const view = (guildId, userId, now = new Date()) => config.enabled ? transaction(tx => viewInTransaction(guildId, userId, now, tx)) : null
  async function claimReminder(guildId, userId, now = new Date()) {
    if (!config.enabled || !config.reminderDelivery) return null
    return transaction(async tx => {
      const account = await accountInTransaction(guildId, userId, now, tx)
      const state = await models.State.findOne({ where: { guildId, userId }, transaction: tx })
      if (account.balance >= 70 || (state.lastReminderAt && now - new Date(state.lastReminderAt) < config.reminderIntervalMs)) return null
      const band = require('./sanity-eye').sanityStage({ balance: account.balance, maximum: config.capacity })
      if (account.balance === 0 && state.lostNotified) return null
      // Reserve before delivery, so concurrent interactions/uncertain sends
      // cannot duplicate the weekly nudge or the special zero notification.
      await state.update({ lastReminderAt: now, lostNotified: state.lostNotified || account.balance === 0 }, { transaction: tx })
      return { balance: account.balance, band, special: account.balance === 0 }
    })
  }
  return { view, gain, viewInTransaction, spendInTransaction, claimReminder, models }
}
const instances = new WeakMap()
function runtime(User) {
  if (!selected().enabled) return null
  if (!instances.has(User.sequelize)) instances.set(User.sequelize, createSanity({ sequelize: User.sequelize }))
  return instances.get(User.sequelize)
}
async function handleMessage(message, User) {
  if (!selected().enabled) return null
  const config = { ...require('./community-leveling/config').selectConfig(), enabled: true }
  if (config.guildId !== process.env.GUILDID) throw new Error('Sanity guild must match selected environment')
  if (!require('./community-leveling/eligibility').qualifies(message, config)) return null
  // Show the settled returning state before this post earns today's presence.
  // A closed DM never prevents activity credit or falls back to public delivery.
  try { await require('./sanity-reminder').nudgeChat(message, runtime(User)) }
  catch (error) { console.error('Sanity private chat nudge failed:', error.code || error.name) }
  return runtime(User).gain({ guildId: message.guild.id, userId: message.author.id, messageId: message.id, channelId: message.channelId, now: new Date(message.createdTimestamp) })
}
module.exports = { selected, defineModels, createSanity, runtime, handleMessage }
