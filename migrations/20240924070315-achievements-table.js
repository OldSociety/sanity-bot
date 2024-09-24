'use strict'

/** @type {import('Sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Achievements', {
      // Ensure this matches your Sequelize model's table name
      id: {
        type: Sequelize.INTEGER, // Fixed "INTERGER" to "INTEGER"
        allowNull: false,
        autoIncrement: true, // Fixed "autoincrement" to "autoIncrement"
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      thumbnail: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      secret: {
        type: Sequelize.BOOLEAN,
        defaultValue: false, // Default to false unless specified as true
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    })
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Achievements') // This should match the name used in the up function
  },
}
