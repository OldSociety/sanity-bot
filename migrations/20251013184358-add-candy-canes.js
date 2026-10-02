module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('HolidayStats', 'candycanes', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('HolidayStats', 'candycanes');
  },
};