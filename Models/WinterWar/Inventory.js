module.exports = (sequelize, DataTypes) => {
  const Inventory = sequelize.define(
    'Inventory',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      winterWarId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'WinterWars',
          key: 'id',
        },
      },
      itemId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'BaseItems',
          key: 'id',
        },
      },
      equipped: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1, // Default to 1 when a new item is added
      },
    },
    {
      timestamps: false,
    }
  )

  return Inventory
}
