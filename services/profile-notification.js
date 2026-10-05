const { AttachmentBuilder } = require('discord.js')
const { renderProfileCard, recentBadges, discordImage } = require('./profile-card')
const { createBadges, badges: catalog } = require('./badges')
const { adminMember } = require('./member-policy')
function createProfileNotification({ User, badgeService = createBadges({ sequelize: User.sequelize }), render = renderProfileCard,
  download = discordImage, environment = process.env.NODE_ENV, guildId = process.env.GUILDID, logger = console }) {
  return async ({ message, member = message?.member, guild = message?.guild, user, before, occasion, sanity }) => {
    // Automatic profile artwork retains the existing development-only rollout.
    if (environment !== 'development' || guild?.id !== guildId) return null
    if (sanity === undefined) sanity = await require('./sanity').runtime(User)?.view(guild.id, member.id)
    let rows = [], badgesUnavailable = false
    try { rows = await badgeService.details(guild.id, member.id) } catch { badgesUnavailable = true; logger.error('Notification badge data unavailable') }
    const avatar = await download(member.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true })).catch(() => null)
    const image = await render({ displayName: member.displayName, username: member.user.username, user, before, occasion, sanity,
      avatar, badges: recentBadges(rows, catalog), badgesUnavailable, isAdmin: adminMember(member) })
    return { files: [new AttachmentBuilder(image, { name: `profile-${occasion}.png` })], allowedMentions: { parse: [] } }
  }
}
module.exports = { createProfileNotification }
