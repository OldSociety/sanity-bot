'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Inventories', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      winterWarId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'WinterWars',
          key: 'id',
        },
      },
      itemId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'BaseItems',
          key: 'id',
        },
      },
      equipped: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1, // Default to 1 when a new item is added
      },
    })
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Inventories')
  },
}
