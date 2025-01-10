module.exports = (sequelize, DataTypes) => {
  const PlayerMonsterStat = sequelize.define(
    'PlayerMonsterStats',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      playerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      monsterId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      victories: {
        type: DataTypes.INTEGER,
        defaultValue: 0, // Number of wins against the monster
      },
      unlocked: {
        type: DataTypes.BOOLEAN,
        defaultValue: false, // Whether the monster is unlocked
      },
      lootUnlocked: {
        type: DataTypes.BOOLEAN,
        defaultValue: false, // Whether the monster is unlocked
      },
    },
    {
      timestamps: false, // No `createdAt` or `updatedAt` fields
    }
  )

  return PlayerMonsterStat
}
