'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Inventory', {
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
    })
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Inventory')
  },
}
