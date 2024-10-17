module.exports = (sequelize, DataTypes) => {
  const Achievement = sequelize.define('Achievements', {
    id: {
      type: DataTypes.INTEGER, 
      allowNull: false,
      autoIncrement: true, 
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    thumbnail: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    secret: {
      type: DataTypes.BOOLEAN,
      defaultValue: false, 
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  })

  return Achievement
}
