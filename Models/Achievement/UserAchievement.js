module.exports = (sequelize, DataTypes) => {
  const UserAchievement = sequelize.define(
    'UserAchievements',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.STRING, // Reference to Users' user_id
        allowNull: false,
      },
      achievementId: {
        type: DataTypes.INTEGER, // Reference to Achievements' id
        allowNull: false,
      }, 
      awardedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      timestamps: false, // Disable createdAt and updatedAt
    }
  )

  return UserAchievement
}
