module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Inventories', 'slug', {
      type: Sequelize.STRING,
      allowNull: true,
    })
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('Inventories', 'slug')
  },
}
