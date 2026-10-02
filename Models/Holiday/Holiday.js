// ./Models/Spooky/SpookyStat.js
module.exports = (sequelize, DataTypes) => {
    const HolidayStat = sequelize.define(
      'HolidayStats',
      {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
        },
        userId: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
          },
        snowballs: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 3,
        },
        candycanes: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        lastHolidayUse: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        hasBeenFrozen: {
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
  
    return HolidayStat
  }
  