module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('Users', {
    user_id: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
    },
    user_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    chat_level: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    chat_exp: {
      type: DataTypes.REAL,
      allowNull: false,
      defaultValue: 0,
    },
    last_chat_message: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    fate_points: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    bank: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    boosterTotal: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  })

  return User
}
