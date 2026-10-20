// Nullable descriptive names plus a membership snapshot. Additive ALTER only;
// safe to apply atomically while older readers continue using their columns.
async function up(queryInterface, options = {}) {
  const db = queryInterface.sequelize
  const apply = async transaction => {
    const columns = await queryInterface.describeTable('SanityAccount', { transaction })
    for (const [name, type] of [['userName', 'TEXT'], ['displayName', 'TEXT'], ['trackingEnabled', 'INTEGER NOT NULL DEFAULT 1']]) {
      if (!columns[name]) await db.query(`ALTER TABLE SanityAccount ADD COLUMN ${name} ${type}`, { transaction })
    }
    const tables = await queryInterface.showAllTables({ transaction })
    if (tables.includes('Users')) await db.query('UPDATE SanityAccount SET userName = COALESCE(userName, (SELECT user_name FROM Users WHERE user_id = SanityAccount.userId)), displayName = COALESCE(displayName, userName, (SELECT user_name FROM Users WHERE user_id = SanityAccount.userId))', { transaction })
  }
  if (options.transaction) return apply(options.transaction)
  return require('../services/spooky/economy').serialize(db, () => db.transaction({ type: require('sequelize').Transaction.TYPES.IMMEDIATE }, apply))
}
module.exports = { up }
