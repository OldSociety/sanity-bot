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
        type: Sequelize.STRING,
        allowNull: false,
      },
      rarity: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      theme: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      damageMin: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      damageMax: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      damage2Min: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      damage2Max: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      defense: {
        type: Sequelize.JSON,
        defaultValue: {},
      },
      healing: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      damageType: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      damageType2: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      durability: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      effects: {
        type: Sequelize.JSON,
        defaultValue: {},
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
