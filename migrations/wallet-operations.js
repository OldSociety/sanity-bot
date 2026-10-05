const { DataTypes } = require('sequelize')

module.exports = async function migrateWalletOperations(sequelize) {
  const query = sequelize.getQueryInterface()
  if ((await query.showAllTables()).includes('WalletOperations')) return false
  await sequelize.transaction(async transaction => {
    await query.createTable('WalletOperations', {
      operationId: { type: DataTypes.STRING, primaryKey: true },
      guildId: { type: DataTypes.STRING, allowNull: false },
      userId: { type: DataTypes.STRING, allowNull: false },
      kind: { type: DataTypes.STRING, allowNull: false },
      receipt: { type: DataTypes.JSON, allowNull: false },
      notificationStatus: { type: DataTypes.STRING, allowNull: false },
      messageId: { type: DataTypes.STRING, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
    }, { transaction })
  })
  return true
}
