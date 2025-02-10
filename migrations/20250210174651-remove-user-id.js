'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Inventories', 'userId');
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('Inventories', 'userId');
  },
};
