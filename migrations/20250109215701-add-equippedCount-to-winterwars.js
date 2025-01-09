'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('WinterWars', 'equippedCount', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0, // Initialize with 0 equipped items
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('WinterWars', 'equippedCount');
  },
};
