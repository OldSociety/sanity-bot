module.exports = (sequelize, DataTypes) => {
  const Inventory = sequelize.define(
    'Inventories',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.TEXT,
        defaultValue: false,
      },
      description: {
        type: DataTypes.TEXT,
        defaultValue: false,
      },
      image_url: {
        type: DataTypes.TEXT,
        defaultValue: false,
      },
      cost: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      stock: {
        type: DataTypes.INTEGER,
        defaultValue: -1, //Negative 1 for infinite
      },
    },
    {
      timestamps: false,
    }
  )

  return Inventory
}
