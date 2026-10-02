'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      'HolidayStats',
      {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
        },
        userId: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        snowballs: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 10,
        },
        candycanes: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        lastHolidayUse: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        hasBeenFrozen: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        lastActive: {
          // Add this field
          type: Sequelize.DATE,
          allowNull: true,
        },
      },
      {
        timestamps: false, // Disable createdAt and updatedAt
      }
    )
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('HolidayStats') // This should match the name used in the up function
  },
}
