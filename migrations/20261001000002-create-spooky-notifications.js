module.exports = {
  async up(queryInterface, { transaction } = {}) {
    await queryInterface.sequelize.query(`CREATE TABLE SpookyNotifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT, operationId TEXT NOT NULL REFERENCES SpookyOperations(operationId) ON DELETE RESTRICT,
      ordinal INTEGER NOT NULL, channelId TEXT NOT NULL, payload JSON NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', messageId TEXT, lastError TEXT,
      UNIQUE(operationId, ordinal)
    )`, { transaction })
  },
  async down(queryInterface) { await queryInterface.sequelize.query('DROP TABLE SpookyNotifications') },
}
