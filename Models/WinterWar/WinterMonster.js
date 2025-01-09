module.exports = (sequelize, DataTypes) => {
  const WinterMonster = sequelize.define(
    'WinterMonsters',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      hp: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      strength: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      defense: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      agility: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      attacks: {
        type: DataTypes.JSON,
        allowNull: false, // JSON to store multiple attacks with descriptions and effects
        defaultValue: [],
      },
      flavorText: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      timestamps: false, // No createdAt or updatedAt fields
    }
  )

  return WinterMonster
}
