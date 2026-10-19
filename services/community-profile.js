const { AttachmentBuilder } = require('discord.js')
const plots = require('./plot-points')
const { serialize } = require('./spooky/economy')
const { badges: catalog, defineBadgeModel } = require('./badges')
const { excludedMember } = require('./member-policy')
const { renderProfileCard, discordImage } = require('./profile-card')
const { readBadgeImage } = require('./profile-badge-art')
function popularBadges(rows, eligibleIds, unlockedBadge = null) {
  const settings = require('../config/leveling/plot-points.json').popularBadges
  const excluded = new Set(settings.excludedUserIds)
  const eligibleOwners = new Set([...eligibleIds].filter(id => !excluded.has(id)))
  const owners = new Map()
  for (const row of rows) {
    if (!eligibleOwners.has(row.userId) || !catalog.some(badge => badge.id === row.badgeId)) continue
    if (!owners.has(row.badgeId)) owners.set(row.badgeId, new Set())
    owners.get(row.badgeId).add(row.userId)
  }
  const result = [...owners].map(([id, people]) => ({ ...catalog.find(badge => badge.id === id), ownerCount: people.size }))
  if (unlockedBadge && eligibleOwners.size) result.push({ ...unlockedBadge, ownerCount: eligibleOwners.size })
  return result.filter(badge => badge.ownerCount >= settings.minimumOwners)
    .sort((a, b) => b.ownerCount - a.ownerCount || a.id.localeCompare(b.id)).slice(0, 10)
}
async function showCommunity(interaction, { sequelize, render = renderProfileCard, download = discordImage,
  directory = guild => require('./guild-members').memberDirectory(guild).get(guild), event = require('./spooky/config').config,
  clock = () => new Date(), logger = console }) {
  await interaction.deferReply({})
  try {
    const members = await directory(interaction.guild)
    const eligibleIds = new Set([...members.values()].filter(member => !member.user?.bot && !excludedMember(member)).map(member => member.id))
    const models = require('./spooky/models').defineSpookyModels(sequelize)
    const Ownership = defineBadgeModel(sequelize), service = plots.createPlotPoints({ sequelize })
    const now = clock()
    const data = await serialize(sequelize, () => sequelize.transaction(async transaction => {
      const progress = await service.view(interaction.guild.id, transaction)
      const spotlight = await plots.resolveSpotlight({ ctx: { scope: { eventId: event.eventId, guildId: interaction.guild.id }, now, transaction }, models, event, readOnly: true })
      const rows = await Ownership.findAll({ where: { guildId: interaction.guild.id }, transaction })
      const active = event.enabled && require('./spooky/config').getEventState(now, event) === 'ACTIVE'
      const currentEvent = active ? require('../config/leveling/plot-points.json').events[event.eventId]?.name || null : null
      const currentEventEmoji = active ? require('../config/leveling/plot-points.json').events[event.eventId]?.emoji || null : null
      return { progress, spotlight, currentEvent, currentEventEmoji, badges: popularBadges(rows, eligibleIds, progress.level >= 2 ? require('../config/leveling/plot-points.json').levelTwoBadge : null) }
    }))
    const emojis = [...(await interaction.guild.emojis.fetch().catch(() => new Map())).values()]
    const imageFor = async name => {
      const emoji = emojis.find(item => item.name === name && item.available !== false && /^\d{17,20}$/.test(item.id))
      return emoji ? download(`https://cdn.discordapp.com/emojis/${emoji.id}.png?size=96`).catch(() => null) : null
    }
    const avatar = await readBadgeImage(data.spotlight)
    const badges = await Promise.all(data.badges.map(async badge => ({ ...badge, image: await imageFor(badge.emojiName) })))
    const buffer = await render({ displayName: interaction.guild.name || 'Our Server', avatar, badges,
      community: data, sanity: null })
    return interaction.editReply({ files: [new AttachmentBuilder(buffer, { name: 'community-profile.png', description: 'Community story progress and most popular badges' })], allowedMentions: { parse: [] } })
  } catch (error) {
    logger.error('Community profile failed:', error.message)
    return interaction.editReply({ content: 'The community profile could not be generated. Please try again shortly.', allowedMentions: { parse: [] } })
  }
}
module.exports = { popularBadges, showCommunity }
