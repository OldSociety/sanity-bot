// ./Models/model.js
const { DataTypes } = require('sequelize')
const sequelize = require('../config/sequelize')

// Import models
const User = require('./User/User')(sequelize, DataTypes)
const Achievement = require('./Achievement/Achievement')(sequelize, DataTypes)
const UserAchievement = require('./Achievement/UserAchievement')(
  sequelize,
  DataTypes
)
const SpookyStat = require('./SpookyStat/SpookyStat')(sequelize, DataTypes)
const WinterWar = require('./Winter/WinterWar')(sequelize, DataTypes) 

// Set up associations
User.associate = (models) => {
  User.belongsToMany(models.Achievement, {
    through: models.UserAchievement,
    foreignKey: 'userId',
    otherKey: 'achievementId',
  })
  User.hasOne(models.SpookyStat, {
    foreignKey: 'userId',
    as: 'spookyStat',
  })
}

Achievement.associate = (models) => {
  Achievement.belongsToMany(models.User, {
    through: models.UserAchievement,
    foreignKey: 'achievementId',
    otherKey: 'userId',
  })
}

SpookyStat.associate = (models) => {
  SpookyStat.belongsTo(models.User, {
    foreignKey: 'userId',
    as: 'user',
  })
}

// Add WinterWar associations
WinterWar.associate = (models) => {
  WinterWar.belongsTo(models.User, {
    foreignKey: 'discordId',
    targetKey: 'id', 
    as: 'user',
  })
}

// Call the associations
User.associate({ Achievement, UserAchievement, SpookyStat, WinterWar })
Achievement.associate({ User, UserAchievement })
SpookyStat.associate({ User })
WinterWar.associate({ User })

module.exports = {
  User,
  Achievement,
  UserAchievement,
  SpookyStat,
  WinterWar, 
}
