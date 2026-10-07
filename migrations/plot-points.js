// Explicit stopped-writer deployment only. No startup/schema synchronization.
async function up(queryInterface, options = {}) {
  const db = queryInterface.sequelize
  const apply = async transaction => {
    for (const sql of [
      'CREATE TABLE PlotGuild (guildId TEXT PRIMARY KEY NOT NULL, total INTEGER NOT NULL DEFAULT 0 CHECK(total >= 0))',
      'CREATE TABLE PlotContribution (guildId TEXT NOT NULL, sourceId TEXT NOT NULL, userId TEXT NOT NULL, eventId TEXT NOT NULL, result JSON NOT NULL, createdAt DATETIME NOT NULL, PRIMARY KEY(guildId, sourceId))',
      'CREATE TABLE PlotMilestone (guildId TEXT NOT NULL, level INTEGER NOT NULL CHECK(level >= 2), unlockedAt DATETIME NOT NULL, PRIMARY KEY(guildId, level))',
    ]) await db.query(sql, { transaction })
  }
  if (options.transaction) return apply(options.transaction)
  return require('../services/spooky/economy').serialize(db, () => db.transaction({ type: require('sequelize').Transaction.TYPES.IMMEDIATE }, apply))
}
module.exports = { up }
