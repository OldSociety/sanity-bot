const { DataTypes: D } = require('sequelize')
function defineDailyModels(db) {
  const key = () => ({ type: D.STRING, primaryKey: true, allowNull: false })
  return {
    Day: db.models.SanityDay || db.define('SanityDay', { guildId: key(), userId: key(), day: key(),
      firstActiveAt: { type: D.DATE, allowNull: false }, channelId: D.STRING,
      presenceGranted: { type: D.BOOLEAN, allowNull: false, defaultValue: false },
      conversationGranted: { type: D.BOOLEAN, allowNull: false, defaultValue: false },
      credited: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
    }, { timestamps: false, freezeTableName: true }),
    State: db.models.SanityDailyState || db.define('SanityDailyState', { guildId: key(), userId: key(),
      lastSettledDay: { type: D.STRING, allowNull: false }, lastReminderAt: D.DATE,
      lostNotified: { type: D.BOOLEAN, allowNull: false, defaultValue: false },
    }, { timestamps: false, freezeTableName: true }),
  }
}
const dayIndex = day => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw Error('Invalid saved Sanity day')
  const index = Date.parse(day + 'T00:00:00Z') / 86400000
  if (!Number.isInteger(index) || dayAt(index) !== day) throw Error('Invalid saved Sanity day')
  return index
}
const dayAt = index => new Date(index * 86400000).toISOString().slice(0, 10)
module.exports = { defineDailyModels, dayIndex, dayAt }
