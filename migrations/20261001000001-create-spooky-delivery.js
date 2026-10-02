module.exports = {
  async up(queryInterface, { transaction } = {}) {
    await queryInterface.sequelize.query(`CREATE TABLE SpookyDeliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, eventId TEXT NOT NULL, guildId TEXT NOT NULL,
      userId TEXT NOT NULL, kind TEXT NOT NULL, revision TEXT NOT NULL,
      payload JSON NOT NULL, status TEXT NOT NULL DEFAULT 'pending', lastError TEXT,
      UNIQUE(eventId,guildId,userId,kind)
    )`, { transaction })
  },
  async down(queryInterface) { await queryInterface.sequelize.query('DROP TABLE SpookyDeliveries') },
}
