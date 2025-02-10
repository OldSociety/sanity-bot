'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Inventories', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: Sequelize.TEXT,
        defaultValue: false,
      },
      description: {
        type: Sequelize.TEXT,
        defaultValue: false,
      },
      image_url: {
        type: Sequelize.TEXT,
        defaultValue: false,
      },
      cost: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      stock: {
        type: Sequelize.INTEGER,
        defaultValue: -1, //Negative 1 for infinite
      },
    },
    {
      timestamps: false,
    })
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Inventories')
  },
}
