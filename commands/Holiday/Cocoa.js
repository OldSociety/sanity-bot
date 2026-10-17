const { SlashCommandBuilder } = require('discord.js')

module.exports = {
  environments: ['development'],
  data: new SlashCommandBuilder()
    .setName('cocoa')
    .setDescription('Fill a cocoa cup without spilling it.')
    .setDMPermission(false),
  async execute(interaction) {
    if (process.env.NODE_ENV !== 'development' || !process.env.GUILDID || interaction.guildId !== process.env.GUILDID) {
      return interaction.reply({ content: 'Cocoa is available in the development server only.', ephemeral: true, allowedMentions: { parse: [] } })
    }
    return require('../../services/cocoa-game').createCocoaCommand()(interaction)
  },
}
