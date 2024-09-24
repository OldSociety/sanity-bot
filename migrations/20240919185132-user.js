'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Users', { // Ensure this matches your Sequelize model's table name
        user_id: {
          type: Sequelize.STRING,
          allowNull: false,
          primaryKey: true,
        },
        user_name: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        chat_level: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1,
        },
        chat_exp: {
          type: Sequelize.REAL,
          allowNull: false,
          defaultValue: 0,
        },
        last_chat_message: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        createdAt: {
          type: Sequelize.DATE,
          defaultValue: Sequelize.NOW,
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        fate_points: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        bank: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        boosterTotal: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },

    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Users'); // This should match the name used in the up function
  },
};
