const { SlashCommandBuilder } = require('discord.js')
const { createBadges, badgeField, renderBadges } = require('../../services/badges')
module.exports = {
  data: new SlashCommandBuilder().setName('badges').setDescription('View permanent server badges.')
    .setDMPermission(false)
    .addSubcommand(command => command.setName('view').setDescription('View your badges or another member’s.')
      .addUserOption(option => option.setName('player').setDescription('Member to view.')))
    .addSubcommand(command => command.setName('leaderboard').setDescription('See the most collected badges.')
      .addIntegerOption(option => option.setName('page').setDescription('Page number.').setMinValue(1))),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })
    if (!interaction.guild || interaction.guildId !== process.env.GUILDID) return interaction.editReply('Use the configured server.')
    const sequelize = require('../../config/sequelize')
    try {
      if (interaction.options.getSubcommand() === 'view') {
        const player = interaction.options.getUser('player') || interaction.user
        return interaction.editReply({ allowedMentions: { parse: [] }, embeds: [{ title: 'Permanent Badges', color: 0xffd700, description: `<@${player.id}>`,
          fields: [await badgeField(interaction.guild, player.id, sequelize)] }] })
      }
      const page = interaction.options.getInteger('page') || 1
      await require('../../services/badge-access').reconcileGuildUser(interaction.guild, interaction.user.id, sequelize).catch(error => console.error('Badge access pending:', error.message))
      const [leaders, emojiMap] = await Promise.all([createBadges({ sequelize }).leaders(interaction.guildId, page), interaction.guild.emojis.fetch()])
      const fields = leaders.map((row, index) => ({ name: `#${(page - 1) * 10 + index + 1} • ${row.badgeCount}/7`, value: `<@${row.userId}>\n${renderBadges(row.badges, [...emojiMap.values()])}` }))
      await interaction.editReply({ allowedMentions: { parse: [] }, embeds: [{ title: `Badge Leaderboard • Page ${page}`, color: 0xffd700,
        description: fields.length ? undefined : 'No badges collected yet.', fields }] })
    } catch { await interaction.editReply('Badges are unavailable. Check the badge migration and server emoji permissions.') }
  },
}
