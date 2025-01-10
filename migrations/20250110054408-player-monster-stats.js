'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('PlayerMonsterStats', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      playerId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      monsterId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      victories: {
        type: Sequelize.INTEGER,
        defaultValue: 0, // Number of wins against the monster
      },
      unlocked: {
        type: Sequelize.BOOLEAN,
        defaultValue: false, // Whether the monster is unlocked
      },
      lootUnlocked: {
        type: Sequelize.BOOLEAN,
        defaultValue: false, // Whether the monster is unlocked
      },
    })
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('PlayerMonsterStats') // This should match the name used in the up function
  },
}
