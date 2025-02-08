module.exports = (sequelize, DataTypes) => {
  const BaseItem = sequelize.define(
    'BaseItems',
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
      type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      rarity: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      theme: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      damageMin: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      damageMax: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      damage2Min: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      damage2Max: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      defense: {
        type: DataTypes.JSON,
        defaultValue: {},
      },
      healing: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      damageType: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      damageType2: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      durability: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      effects: {
        type: DataTypes.JSON,
        defaultValue: {},
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      timestamps: false,
    }
  )

  return BaseItem
}
