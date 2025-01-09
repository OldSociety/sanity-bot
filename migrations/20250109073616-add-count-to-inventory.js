module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Inventory', 'count', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('Inventory', 'count');
  },
};
