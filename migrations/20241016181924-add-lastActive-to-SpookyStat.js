'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add the lastActive column to the SpookyStat table
    await queryInterface.addColumn('SpookyStats', 'lastActive', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null, // Optional: You can set a default value if needed
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove the lastActive column if this migration is rolled back
    await queryInterface.removeColumn('SpookyStats', 'lastActive');
  }
};
