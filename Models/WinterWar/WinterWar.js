module.exports = (sequelize, DataTypes) => {
  const WinterWar = sequelize.define(
    'WinterWars',
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
          model: 'Users',
          key: 'user_id',
        },
      },
      snowballs: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      success_ratio: {
        type: DataTypes.INTEGER,
        defaultValue: 100,
      },
      equippedCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      }
    },
    {
      timestamps: false,
    }
  )

  return WinterWar
}
