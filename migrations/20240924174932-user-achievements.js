'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'UserAchievements',
      {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
        },
        userId: {
          type: Sequelize.STRING, // Make sure this matches the primary key in Users
          allowNull: false,
          references: {
            model: 'Users',
            key: 'user_id',
          },
        },
        achievementId: {
          type: Sequelize.INTEGER, // Reference to Achievements' id
          allowNull: false,
        },
        awardedAt: {
          type: Sequelize.DATE,
          defaultValue: Sequelize.NOW,
        },
      },
      {
        timestamps: false, // Disable createdAt and updatedAt
      }
    )
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('UserAchievement') // This should match the name used in the up function
  },
}
