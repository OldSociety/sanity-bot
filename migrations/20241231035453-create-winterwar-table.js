'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('WinterWar', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      discordId: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      team: {
        type: Sequelize.STRING,
        defaultValue: 'Frost',
      },
      snow: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      stamina: {
        type: Sequelize.INTEGER,
        defaultValue: 10,
      },
      position: {
        type: Sequelize.STRING,
        defaultValue: 'Center',
      },
      warPoints: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      status: {
        type: Sequelize.STRING,
        defaultValue: 'Active',
      },
    })
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('WinterWar')
  },
}
