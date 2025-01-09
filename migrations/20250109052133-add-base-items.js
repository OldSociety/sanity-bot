'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('BaseItems', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      type: {
        type: Sequelize.STRING, // e.g., "weapon", "armor", "consumable"
        allowNull: false,
      },
      damageMin: {
        type: Sequelize.INTEGER, // For weapons
        defaultValue: 0,
      },
      damageMax: {
        type: Sequelize.INTEGER, // For weapons
        defaultValue: 0,
      },
      damage2Min: {
        type: Sequelize.INTEGER, // For weapons
        defaultValue: 0,
      },
      damage2Max: {
        type: Sequelize.INTEGER, // For weapons
        defaultValue: 0,
      },
      defense: {
        type: Sequelize.INTEGER, // For shields/armor
        defaultValue: 0,
      },
      healing: {
        type: Sequelize.INTEGER, // For consumables
        defaultValue: 0,
      },
      damageType: {
        type: Sequelize.STRING, // e.g., "fire", "ice"
        allowNull: true,
      },
      damageType2: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      duration: {
        type: Sequelize.INTEGER, // For consumables
        allowNull: true,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
    })
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('BaseItems')
  },
}
