// Explicit additive migration; never called by message handling or startup.
// Apply only during a backed-up, stopped-writer deployment window.
async function up(queryInterface, options = {}) {
  const db = queryInterface.sequelize
  const statements = [
    'CREATE TABLE CommunityGuild (guildId TEXT PRIMARY KEY NOT NULL, level INTEGER NOT NULL DEFAULT 1 CHECK(level >= 1), xp INTEGER NOT NULL DEFAULT 0 CHECK(xp >= 0 AND xp < 300))',
    'CREATE TABLE CommunityDay (guildId TEXT NOT NULL, day TEXT NOT NULL, earned INTEGER NOT NULL DEFAULT 0 CHECK(earned BETWEEN 0 AND 24), PRIMARY KEY(guildId, day))',
    'CREATE TABLE CommunityMember (guildId TEXT NOT NULL, userId TEXT NOT NULL, day TEXT NOT NULL, earned INTEGER NOT NULL DEFAULT 0 CHECK(earned BETWEEN 0 AND 4), lastEarnedAt DATETIME, PRIMARY KEY(guildId, userId))',
    'CREATE TABLE CommunityReceipt (guildId TEXT NOT NULL, messageId TEXT NOT NULL, userId TEXT NOT NULL, result JSON NOT NULL, PRIMARY KEY(guildId, messageId))',
  ]
  const { serialize } = require('../services/spooky/economy')
  const apply = async transaction => {
    for (const sql of statements) await db.query(sql, { transaction })
  }
  if (options.transaction) return apply(options.transaction)
  return serialize(db, () => db.transaction({ type: require('sequelize').Transaction.TYPES.IMMEDIATE }, apply))
}
module.exports = { up }
