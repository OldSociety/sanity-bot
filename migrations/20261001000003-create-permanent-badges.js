// Permanent ownership has no foreign key to seasonal participants or inventory.
module.exports = {
  async up(queryInterface, { transaction } = {}) {
    await queryInterface.sequelize.query(`CREATE TABLE BadgeOwnership (
      guildId TEXT NOT NULL, userId TEXT NOT NULL, badgeId TEXT NOT NULL,
      sourceEventId TEXT NOT NULL, awardedAt DATETIME NOT NULL,
      PRIMARY KEY (guildId, userId, badgeId)
    )`, { transaction })
  },
  async down(queryInterface) { await queryInterface.sequelize.query('DROP TABLE BadgeOwnership') },
}
