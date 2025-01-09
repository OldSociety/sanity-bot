'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('WinterWars', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      userId: {
        type: Sequelize.STRING,
        allowNull: false,
        references: {
          model: 'Users', // Ensure this matches your Users table name
          key: 'user_id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      hp: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 5,
      },
      strength: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 5,
      },
      defense: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 5,
      },
      agility: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 5,
      },
      statPoints: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 10,
      },
      war_points: {
        type: Sequelize.INTEGER,
        defaultValue: 100,
      },
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('WinterWars');
  },
};
