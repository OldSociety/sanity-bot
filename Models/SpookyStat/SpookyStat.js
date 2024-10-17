// ./Models/Spooky/SpookyStat.js
module.exports = (sequelize, DataTypes) => {
  const SpookyStat = sequelize.define(
    'SpookyStats',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.STRING,
        allowNull: false,
        references: {
          model: 'Users', // Ensure this matches your Users table name
          key: 'user_id',
        },
      },
      treats: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 3,
      },
      lastSpookyUse: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      hasBeenTricked: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      lastActive: { // Add this field
        type: DataTypes.DATE,
        allowNull: true,
      }
    },
    {
      timestamps: false,
    }
  )

  return SpookyStat
}
