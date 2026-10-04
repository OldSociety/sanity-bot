const { DataTypes: D } = require('sequelize')
function defineModels(db) {
  const define = (name, fields) => db.models[name] || db.define(name, fields, { timestamps: false, freezeTableName: true })
  const key = () => ({ type: D.STRING, primaryKey: true, allowNull: false })
  const integer = defaultValue => ({ type: D.INTEGER, allowNull: false, defaultValue })
  return {
    Guild: define('CommunityGuild', { guildId: key(), level: integer(1), xp: integer(0) }),
    Day: define('CommunityDay', { guildId: key(), day: key(), earned: integer(0) }),
    Member: define('CommunityMember', { guildId: key(), userId: key(), day: { type: D.STRING, allowNull: false }, earned: integer(0), lastEarnedAt: D.DATE }),
    Receipt: define('CommunityReceipt', { guildId: key(), messageId: key(), userId: { type: D.STRING, allowNull: false }, result: { type: D.JSON, allowNull: false } }),
  }
}
module.exports = { defineModels }
