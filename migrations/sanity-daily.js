// Additive cutover: preserve balances/history, begin the daily policy today.
const { dayKey } = require('../services/community-leveling/config')
const { dayIndex, dayAt } = require('../services/sanity-daily-models')
async function up(queryInterface, { transaction: existing, now = new Date(), timezone = 'America/Los_Angeles' } = {}) {
  const db = queryInterface.sequelize, today = dayKey(now, timezone)
  const apply = async transaction => {
    await db.query('CREATE TABLE SanityDay (guildId TEXT NOT NULL, userId TEXT NOT NULL, day TEXT NOT NULL, firstActiveAt DATETIME NOT NULL, channelId TEXT, presenceGranted BOOLEAN NOT NULL DEFAULT 0, conversationGranted BOOLEAN NOT NULL DEFAULT 0, credited INTEGER NOT NULL DEFAULT 0 CHECK(credited BETWEEN 0 AND 3), PRIMARY KEY(guildId,userId,day))', { transaction })
    await db.query('CREATE TABLE SanityDailyState (guildId TEXT NOT NULL, userId TEXT NOT NULL, lastSettledDay TEXT NOT NULL, lastReminderAt DATETIME, lostNotified BOOLEAN NOT NULL DEFAULT 0, PRIMARY KEY(guildId,userId))', { transaction })
    const [accounts] = await db.query('SELECT * FROM SanityAccount', { transaction })
    const { defineDailyModels } = require('../services/sanity-daily-models'), models = defineDailyModels(db)
    for (const account of accounts) {
      await models.State.create({ guildId: account.guildId, userId: account.userId, lastSettledDay: dayAt(dayIndex(today) - 1) }, { transaction })
      // Today's old-policy credits count toward the new cap, never get removed.
      if (account.day === today && account.earned > 0) await models.Day.create({ guildId: account.guildId, userId: account.userId,
        day: today, firstActiveAt: account.lastEarnedAt || account.lastActiveAt, presenceGranted: true,
        conversationGranted: account.earned >= 3, credited: Math.min(3, account.earned) }, { transaction })
    }
  }
  if (existing) return apply(existing)
  return require('../services/spooky/economy').serialize(db, () => db.transaction({ type: require('sequelize').Transaction.TYPES.IMMEDIATE }, apply))
}
module.exports = { up }
