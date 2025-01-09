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
    },
    {
      timestamps: false,
    }
  )

  return Inventory
}
