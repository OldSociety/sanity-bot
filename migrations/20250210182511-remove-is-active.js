'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Inventories', 'is_active');
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('Inventories', 'is_active');
  },
};
