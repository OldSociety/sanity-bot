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
const WinterWar = require('./WinterWar/WinterWar')(sequelize, DataTypes)
const WinterMonster = require('./WinterWar/WinterMonster')(sequelize, DataTypes)
const PlayerMonsterStat = require('./WinterWar/PlayerMonsterStat')(
  sequelize,
  DataTypes
)
const BaseItem = require('./WinterWar/BaseItem')(sequelize, DataTypes)
const Inventory = require('./WinterWar/Inventory')(sequelize, DataTypes)
// Ensure models are loaded

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
    as: 'user_id',
  })
}

// Add WinterWar associations
WinterWar.associate = (models) => {
  WinterWar.belongsTo(models.User, {
    foreignKey: 'userId',
    as: 'user_id',
  })
  WinterWar.hasMany(models.Inventory, {
    foreignKey: 'winterWarId',
    as: 'inventoryList',
  })
}

BaseItem.associate = (models) => {
  BaseItem.hasMany(models.Inventory, {
    foreignKey: 'itemId',
    as: 'itemInventories',
  })
}

Inventory.associate = (models) => {
  Inventory.belongsTo(models.WinterWar, {
    foreignKey: 'winterWarId',
    as: 'owner',
  })
  Inventory.belongsTo(models.BaseItem, {
    foreignKey: 'itemId',
    as: 'item',
  })
}

WinterWar.associate = (models) => {
  WinterWar.hasMany(models.PlayerMonsterStat, {
    foreignKey: 'playerId',
    as: 'monsterStats',
  });
};

WinterMonster.associate = (models) => {
  WinterMonster.hasMany(models.PlayerMonsterStat, {
    foreignKey: 'monsterId',
    as: 'playerStats',
  });
};

PlayerMonsterStat.associate = (models) => {
  PlayerMonsterStat.belongsTo(models.WinterWar, {
    foreignKey: 'playerId',
    as: 'player',
  });
  PlayerMonsterStat.belongsTo(models.WinterMonster, {
    foreignKey: 'monsterId',
    as: 'monster',
  });
};


// Call the associations
User.associate({ Achievement, UserAchievement, SpookyStat, WinterWar })
Achievement.associate({ User, UserAchievement })
SpookyStat.associate({ User })
WinterWar.associate({ User, Inventory, PlayerMonsterStat })
BaseItem.associate({ Inventory })
Inventory.associate({ BaseItem, WinterWar })
PlayerMonsterStat.associate({ WinterWar, WinterMonster })

module.exports = {
  User,
  Achievement,
  UserAchievement,
  SpookyStat,
  WinterMonster,
  WinterWar,
  BaseItem,
  Inventory,
  PlayerMonsterStat,
}
