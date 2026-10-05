// Explicit additive migration, only during backed-up stopped-writer deployment.
async function up(queryInterface, options = {}) {
  const db = queryInterface.sequelize
  const apply = async transaction => {
    await db.query('CREATE TABLE SanityAccount (guildId TEXT NOT NULL, userId TEXT NOT NULL, balance INTEGER NOT NULL DEFAULT 50 CHECK(balance BETWEEN 0 AND 100), day TEXT NOT NULL, earned INTEGER NOT NULL DEFAULT 0 CHECK(earned BETWEEN 0 AND 8), lastEarnedAt DATETIME, lastActiveAt DATETIME NOT NULL, decayDays INTEGER NOT NULL DEFAULT 0 CHECK(decayDays >= 0), PRIMARY KEY(guildId,userId))', { transaction })
    await db.query('CREATE TABLE SanityReceipt (guildId TEXT NOT NULL, operationId TEXT NOT NULL, userId TEXT NOT NULL, result JSON NOT NULL, PRIMARY KEY(guildId,operationId))', { transaction })
  }
  if (options.transaction) return apply(options.transaction)
  return require('../services/spooky/economy').serialize(db, () => db.transaction({ type: require('sequelize').Transaction.TYPES.IMMEDIATE }, apply))
}
module.exports = { up }
