// migrations/20231014-create-spookystats.js
'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('SpookyStats', {
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
      treats: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 3,
      },
      lastSpookyUse: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      hasBeenTricked: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      lastActive: { 
        type: Sequelize.DATE,
        allowNull: true,
      }
    })
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('SpookyStats')
  },
}
