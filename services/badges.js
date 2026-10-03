const { DataTypes } = require('sequelize')
const { serialize } = require('./spooky/economy')
const catalog = require('../config/badges.json')
const badges = Object.freeze(catalog.badges.map(item => Object.freeze({ ...item, id: `${catalog.collectionId}:${item.characterId}` })))
function defineBadgeModel(sequelize) {
  return sequelize.models.BadgeOwnership || sequelize.define('BadgeOwnership', {
    guildId: { type: DataTypes.STRING, primaryKey: true }, userId: { type: DataTypes.STRING, primaryKey: true },
    badgeId: { type: DataTypes.STRING, primaryKey: true }, sourceEventId: { type: DataTypes.STRING, allowNull: false },
    awardedAt: { type: DataTypes.DATE, allowNull: false },
  }, { tableName: 'BadgeOwnership', timestamps: false })
}
function createBadges({ sequelize }) {
  const Ownership = defineBadgeModel(sequelize)
  async function award(ctx, userId, characterId) {
    const badge = badges.find(item => item.characterId === characterId)
    if (!badge || ctx.scope.eventId !== catalog.collectionId || ctx.transaction?.sequelize !== sequelize) throw new Error('Invalid badge award context')
    const where = { guildId: ctx.scope.guildId, userId, badgeId: badge.id }
    if (await Ownership.findOne({ where, transaction: ctx.transaction })) return null
    await Ownership.create({ ...where, sourceEventId: ctx.scope.eventId, awardedAt: ctx.now }, { transaction: ctx.transaction })
    await ctx.record({ userId, resource: `badge:${badge.id}`, delta: 1, before: 0, after: 1, metadata: { reason: 'character_complete' } })
    return badge.id
  }
  async function owned(guildId, userId, transaction) {
    const read = () => Ownership.findAll({ where: { guildId, userId }, transaction })
    return (await (transaction ? read() : serialize(sequelize, read))).map(row => row.badgeId)
  }
  async function details(guildId, userId, transaction) {
    const read = () => Ownership.findAll({ where: { guildId, userId }, order: [['badgeId', 'ASC']], transaction })
    return (await (transaction ? read() : serialize(sequelize, read))).map(row => row.get({ plain: true }))
  }
  async function latest(guildId, transaction) {
    const read = () => Ownership.findAll({ where: { guildId, sourceEventId: catalog.collectionId },
      order: [['awardedAt', 'DESC'], ['badgeId', 'ASC'], ['userId', 'ASC']], transaction })
    return (await (transaction ? read() : serialize(sequelize, read))).map(row => badges.find(badge => badge.id === row.badgeId))
      .find(Boolean) || badges.find(badge => badge.characterId === 'sel')
  }
  async function leaders(guildId, page = 1) {
    if (!Number.isSafeInteger(page) || page < 1) throw new Error('Invalid badge leaderboard page')
    const [rows] = await serialize(sequelize, () => sequelize.query('SELECT userId, COUNT(*) AS badgeCount FROM BadgeOwnership WHERE guildId = :guildId GROUP BY userId ORDER BY badgeCount DESC, userId ASC LIMIT 10 OFFSET :offset', { replacements: { guildId, offset: (page - 1) * 10 } }))
    return Promise.all(rows.map(async row => ({ ...row, badges: await owned(guildId, row.userId) })))
  }
  return { award, owned, leaders, details, latest }
}
function renderBadges(ownedIds, emojis = []) {
  const owned = new Set(ownedIds)
  return badges.map(badge => {
    if (!owned.has(badge.id)) return '❔'
    const emoji = emojis.find(item => item.name === badge.emojiName && /^\d{17,20}$/.test(item.id) && item.available !== false)
    return emoji ? `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>` : '🏅'
  }).join(' ')
}
async function badgeField(guild, userId, sequelize) {
  // Role projection is year-round and never called inside an award transaction.
  // Projection failure does not hide or revoke the durable badge itself.
  await require('./badge-access').reconcileGuildUser(guild, userId, sequelize).catch(error => console.error('Badge access pending:', error.message))
  const service = createBadges({ sequelize })
  const [ownedIds, emojiMap] = await Promise.all([service.owned(guild.id, userId), guild.emojis.fetch()])
  return { name: 'Spooky 2026 Badges', value: `${renderBadges(ownedIds, [...emojiMap.values()])}\n${ownedIds.length}/7 collected` }
}
module.exports = { badges, defineBadgeModel, createBadges, renderBadges, badgeField }
