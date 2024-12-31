module.exports = (sequelize, DataTypes) => {
  const WinterWar = sequelize.define(
    'WinterWars',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      discordId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      team: {
        type: DataTypes.STRING,
        defaultValue: 'Red',
      },
      snow: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      stamina: {
        type: DataTypes.INTEGER,
        defaultValue: 10,
      },
      position: {
        type: DataTypes.STRING,
        defaultValue: 'Center',
      },
      warPoints: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      status: {
        type: DataTypes.STRING,
        defaultValue: 'Active',
      },
    },
    {
      timestamps: false,
    }
  )

  return WinterWar
}
