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
        type: DataTypes.STRING, // e.g., "weapon", "armor", "consumable"
        allowNull: false,
      },
      damageMin: {
        type: DataTypes.INTEGER, // For weapons
        defaultValue: 0,
      },
      damageMax: {
        type: DataTypes.INTEGER, // For weapons
        defaultValue: 0,
      },
      damage2Min: {
        type: DataTypes.INTEGER, // For weapons
        defaultValue: 0,
      },
      damage2Max: {
        type: DataTypes.INTEGER, // For weapons
        defaultValue: 0,
      },
      defense: {
        type: DataTypes.INTEGER, // For shields/armor
        defaultValue: 0,
      },
      healing: {
        type: DataTypes.INTEGER, // For consumables
        defaultValue: 0,
      },
      damageType: {
        type: DataTypes.STRING, // e.g., "fire", "ice"
        allowNull: true,
      },
      damageType2: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      duration: {
        type: DataTypes.INTEGER, // For consumables
        allowNull: true,
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
