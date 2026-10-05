const { AttachmentBuilder } = require('discord.js')
const { serialize } = require('./spooky/economy')
const { createBadges, badges: catalog } = require('./badges')
const { renderProfileCard, recentBadges, discordImage } = require('./profile-card')
const { excludedMember, adminMember } = require('./member-policy')

function createProfileCommand({ User, badgeService = createBadges({ sequelize: User.sequelize }),
  render = renderProfileCard, download = discordImage, logger = console,
  sanityService = process.env.NODE_ENV === 'development' ? require('./sanity').runtime(User) : null }) {
  return async interaction => {
    if (!interaction.guild) return interaction.reply({ content: 'Use /profile in a server.', ephemeral: true })
    const mode = interaction.options.getSubcommand?.(false) || 'view'
    const preview = ['birthday', 'level'].includes(mode)
    if (preview && process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') return interaction.reply({ content: 'Profile previews are available only in development.', ephemeral: true })
    if (!['view', 'birthday', 'level'].includes(mode)) return interaction.reply({ content: 'Unknown profile mode.', ephemeral: true })
    await interaction.deferReply(preview ? { ephemeral: true } : {})
    try {
      const player = preview ? interaction.user : interaction.options.getUser('player') || interaction.user
      const member = await interaction.guild.members.fetch({ user: player.id, force: true }).catch(() => null)
      if (!member) return interaction.editReply('That player is not available in this server. Please try again shortly.')
      if (excludedMember(member)) return interaction.editReply('Bots are excluded from production profiles.')
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
      let sanity = null
      if (sanityService) {
        if (preview) {
          // Preview reads never initialize accounts, settle decay or award funds.
          const account = await sanityService.models.Account.findOne({ where: { guildId: interaction.guild.id, userId: player.id } })
          const config = require('../config/sanity.json')
          sanity = { balance: account?.balance ?? config.starting, maximum: config.capacity }
        } else sanity = await sanityService.view(interaction.guild.id, player.id)
      }
      const saved = user?.get({ plain: true }) || {}
      const example = previewCard(saved, mode)
      const buffer = await render({ displayName: name, username: player.username, ...example, avatar,
        badges: decorated, badgesUnavailable, isAdmin: adminMember(member), sanity })
      await interaction.editReply({ ...(preview ? { content: 'Visual preview only. No points, levels or badges were awarded.' } : {}),
        files: [new AttachmentBuilder(buffer, { name: preview ? `profile-${mode}-preview.png` : 'profile.png', description: `Profile card for ${name}` })],
        allowedMentions: { parse: [] } })
    } catch (error) {
      logger.error('Profile card generation failed:', error.message)
      await interaction.editReply({ content: 'Your profile card could not be generated. Please try again shortly.', allowedMentions: { parse: [] } })
    }
  }
}
function previewCard(saved, mode) {
  if (mode === 'view') return { user: saved, occasion: 'profile' }
  const user = { ...saved, chat_level: saved.chat_level || 1, fate_points: saved.fate_points || 0, bank: saved.bank || 0 }
  const before = { ...user }
  if (mode === 'birthday') user.bank = Math.max(user.bank, Math.min(100, user.bank + 10))
  if (mode === 'level') { user.chat_level++; user.chat_exp = 0 }
  return { user, before, occasion: mode === 'level' ? 'level-up' : 'birthday' }
}
module.exports = { createProfileCommand, previewCard }
