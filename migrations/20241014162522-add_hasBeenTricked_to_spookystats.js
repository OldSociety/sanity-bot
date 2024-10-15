// migrations/20231014-add_hasBeenTricked_to_spookystats.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('SpookyStats', 'hasBeenTricked', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('SpookyStats', 'hasBeenTricked');
  },
};
