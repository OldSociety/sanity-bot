module.exports = (sequelize, DataTypes) => {
  const WinterMonster = sequelize.define(
    'WinterMonster',
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
      resistance: {
        type: DataTypes.JSON,
        defaultValue: {},
      },
      attacks: {
        type: DataTypes.JSON,
        defaultValue: [],
      },
      flavorText: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      url: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      loot: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      droprate: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
    },
    {
      timestamps: false, // No createdAt or updatedAt fields
    }
  );

  return WinterMonster;
};
