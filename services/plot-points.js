const { DataTypes: D } = require('sequelize')
const { serialize } = require('./spooky/economy')
const defaults = require('../config/plot-points.json')
function enabled(environment = process.env.NODE_ENV, settings = defaults) {
  return settings[`${environment}Enabled`] === true
}
function defineModels(db) {
  const define = (name, fields) => db.models[name] || db.define(name, fields, { timestamps: false, freezeTableName: true })
  const key = () => ({ type: D.STRING, primaryKey: true, allowNull: false })
  return {
    Guild: define('PlotGuild', { guildId: key(), total: { type: D.INTEGER, allowNull: false, defaultValue: 0 } }),
    Contribution: define('PlotContribution', { guildId: key(), sourceId: key(), userId: { type: D.STRING, allowNull: false },
      eventId: { type: D.STRING, allowNull: false }, result: { type: D.JSON, allowNull: false }, createdAt: { type: D.DATE, allowNull: false } }),
    Milestone: define('PlotMilestone', { guildId: key(), level: { type: D.INTEGER, primaryKey: true, allowNull: false },
      unlockedAt: { type: D.DATE, allowNull: false } }),
  }
}
function progression(total = 0, settings = defaults) {
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid community Plot total')
  let xp = total, level = 1
  for (const threshold of settings.thresholds) {
    if (!Number.isSafeInteger(threshold) || threshold <= 0) throw new Error('Invalid community threshold')
    if (xp < threshold) return { level, xp, required: threshold, fraction: xp / threshold, total }
    xp -= threshold; level++
  }
  // Keep subsequent contributions until another threshold is approved.
  return { level, xp, required: null, fraction: 1, total }
}
function plotEmoji(spotlight, emojis = []) {
  const emoji = emojis.find(item => item.name === spotlight.emojiName && item.available !== false && /^\d{17,20}$/.test(item.id))
  return emoji ? `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>` : '📖'
}
function spotlightName(spotlight = {}) {
  const name = spotlight.emojiName?.replace(/_badge(?:_.*)?$/i, '').split('_').filter(Boolean)
  return name?.length ? name.map(word => word[0].toUpperCase() + word.slice(1).toLowerCase()).join(' ') : spotlight.name || 'Selene'
}
async function resolveSpotlight({ ctx, models, event, settings = defaults, readOnly = false }) {
  const rule = settings.events[event?.eventId]
  if (!rule || !event.enabled || require('./spooky/config').getEventState(ctx.now, event) !== 'ACTIVE') return settings.fallback
  if (rule.spotlightProvider !== 'spooky') throw new Error('Unsupported event spotlight provider')
  let current
  if (readOnly) {
    const rows = await models.Operation.findAll({ where: { ...ctx.scope, operationType: 'spotlight_plan' }, transaction: ctx.transaction })
    const slot = require('./spooky/reminders').latestReminderSlot(ctx.now, require('../config/spooky-spotlight.json'), event)
    current = rows.find(row => row.completedAt && row.receipt?.slot === slot)?.receipt
    // A profile read never writes a spotlight plan. Follow the same calendar
    // rotation when the worker has not committed the current slot yet.
    if (!current && slot) {
      const rotation = require('../config/spooky-spotlight.json')
      const previous = rows.filter(row => row.completedAt && row.receipt?.slot < slot)
        .sort((a,b) => b.receipt.slot.localeCompare(a.receipt.slot))[0]?.receipt
      const days = (Date.parse(slot) - Date.parse(previous?.slot || rotation.anchorDate)) / 86400000
      const index = (previous ? rotation.characters.indexOf(previous.characterId) : 0) + days / rotation.everyDays
      const characterId = rotation.characters[index % rotation.characters.length]
      current = require('../config/badges.json').badges.find(badge => badge.characterId === characterId)
    }
  } else current = await require('./spooky/spotlight').ensureSpotlight(ctx, models, event)
  return current ? { ...current, emojiName: rule.emojiNames[current.characterId] || settings.fallback.emojiName } : settings.fallback
}
function createPlotPoints({ sequelize, models = defineModels(sequelize), settings = defaults }) {
  async function contribute(ctx, { userId, sourceId = ctx.operationId, eventId = ctx.scope.eventId, amount = 1 }) {
    if (ctx.transaction?.sequelize !== sequelize || !ctx.scope.guildId || !userId || !sourceId || !eventId || amount !== 1) throw new Error('Invalid Plot contribution context')
    const where = { guildId: ctx.scope.guildId, sourceId }
    const prior = await models.Contribution.findOne({ where, transaction: ctx.transaction })
    if (prior) {
      if (prior.userId !== userId || prior.eventId !== eventId) throw new Error('Plot contribution replay identity mismatch')
      return prior.result
    }
    const [guild] = await models.Guild.findOrCreate({ where: { guildId: where.guildId }, transaction: ctx.transaction })
    const before = progression(guild.total, settings), after = progression(guild.total + 1, settings)
    await guild.update({ total: after.total }, { transaction: ctx.transaction })
    const unlocked = []
    for (let level = before.level + 1; level <= after.level; level++) {
      const [, created] = await models.Milestone.findOrCreate({ where: { guildId: where.guildId, level }, defaults: { unlockedAt: ctx.now }, transaction: ctx.transaction })
      if (created) unlocked.push(level)
    }
    const result = { plotPoints: 1, communityLevel: after.level, unlockedLevels: unlocked }
    await models.Contribution.create({ ...where, userId, eventId, result, createdAt: ctx.now }, { transaction: ctx.transaction })
    await ctx.record({ userId, resource: 'plotPoints', delta: 1, before: before.total, after: after.total, metadata: { community: true, sourceId, unlockedLevels: unlocked } })
    return result
  }
  async function view(guildId, transaction) {
    const read = async () => progression((await models.Guild.findByPk(guildId, { transaction }))?.total || 0, settings)
    return transaction ? read() : serialize(sequelize, read)
  }
  async function unlockedBadge(guildId) {
    return (await view(guildId)).level >= 2 ? settings.levelTwoBadge : null
  }
  return { contribute, view, unlockedBadge, models }
}
module.exports = { enabled, defineModels, progression, createPlotPoints, resolveSpotlight, plotEmoji, spotlightName }
