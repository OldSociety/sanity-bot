const { SlashCommandBuilder } = require('discord.js')

module.exports = {
  environments: ['development', 'production'],
  data: new SlashCommandBuilder()
    .setName('achievement-preview')
    .setDescription('Preview achievement embeds with sample progress.')
    .setDMPermission(false)
    .addStringOption(option => option
      .setName('state')
      .setDescription('Example to display; defaults to in progress.')
      .addChoices(
        { name: 'Locked', value: 'locked' },
        { name: 'In progress', value: 'progress' },
        { name: 'Unlocked', value: 'unlocked' },
      )),
  async execute(interaction) {
    if (!interaction.guildId || !['development', 'production'].includes(process.env.NODE_ENV)) {
      return interaction.reply({ content: 'Use this preview in a server.', ephemeral: true })
    }
    await interaction.deferReply({ ephemeral: true })
    try {
      const { achievementPreview } = require('../../services/achievement-preview')
      await interaction.editReply(await achievementPreview(
        interaction.client, interaction.options.getString('state') || 'progress',
      ))
    } catch (error) {
      console.warn('Achievement preview unavailable:', error.message)
      await interaction.editReply({ content: 'The achievement preview could not load. Check the development server progress emojis and local lock icons.', allowedMentions: { parse: [] } })
    }
  },
}
