const { AttachmentBuilder } = require('discord.js')
const { serialize } = require('./spooky/economy')
const { createBadges, badges: catalog } = require('./badges')
const { renderProfileCard, recentBadges, discordImage } = require('./profile-card')
const { excludedMember, adminMember } = require('./member-policy')

function createProfileCommand({ User, badgeService = createBadges({ sequelize: User.sequelize }),
  render = renderProfileCard, download = discordImage, logger = console }) {
  return async interaction => {
    if (!interaction.guild) return interaction.reply({ content: 'Use /profile in a server.', ephemeral: true })
    await interaction.deferReply()
    try {
      const player = interaction.options.getUser('player') || interaction.user
      const member = await interaction.guild.members.fetch(player.id).catch(() => null)
      if (excludedMember(member || { user: player })) return interaction.editReply('Bots are excluded from production profiles.')
      const user = await serialize(User.sequelize, () => User.findByPk(player.id))
      let rows = [], badgesUnavailable = false
      try { rows = await badgeService.details(interaction.guild.id, player.id) }
      catch { badgesUnavailable = true; logger.error('Profile badge data unavailable') }
      const recent = recentBadges(rows, catalog)
      let emojis = []
      if (recent.some(badge => badge.emojiName)) {
        emojis = [...(await interaction.guild.emojis.fetch().catch(() => new Map())).values()]
      }
      const avatarUrl = (member || player).displayAvatarURL({ extension: 'png', size: 256, forceStatic: true })
      const avatar = await download(avatarUrl).catch(() => null)
      const decorated = await Promise.all(recent.map(async badge => {
        const emoji = emojis.find(item => item.name === badge.emojiName && item.available !== false && /^\d{17,20}$/.test(item.id))
        const image = emoji ? await download(`https://cdn.discordapp.com/emojis/${emoji.id}.png?size=96`).catch(() => null) : null
        return { ...badge, image }
      }))
      const name = member?.displayName || player.globalName || player.username
      const buffer = await render({ displayName: name, username: player.username, user: user?.get({ plain: true }) || {}, avatar,
        badges: decorated, badgesUnavailable, isAdmin: adminMember(member) })
      await interaction.editReply({ files: [new AttachmentBuilder(buffer, { name: 'profile.png', description: `Profile card for ${name}` })],
        allowedMentions: { parse: [] } })
    } catch (error) {
      logger.error('Profile card generation failed:', error.message)
      await interaction.editReply({ content: 'Your profile card could not be generated. Please try again shortly.', allowedMentions: { parse: [] } })
    }
  }
}
module.exports = { createProfileCommand }
