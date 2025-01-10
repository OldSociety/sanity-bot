'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('WinterMonsters', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      hp: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      strength: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      defense: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      agility: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      attacks: {
        type: Sequelize.JSON,
        allowNull: false, // JSON to store multiple attacks with descriptions and effects
        defaultValue: [],
      },
      flavorText: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      url: {
        type: Sequelize.STRING,
        allowNull: true,
      },
    })
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('WinterMonsters')
  },
}
