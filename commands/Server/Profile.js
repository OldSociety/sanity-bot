const { SlashCommandBuilder } = require('discord.js')
module.exports = {
  environments: ['development', 'production'],
  data: new SlashCommandBuilder().setName('profile').setDescription('Show a profile card with XP, Fate and recent badges.')
    .setDMPermission(false)
    .addUserOption(option => option.setName('player').setDescription('Member to view; defaults to you.')),
  async execute(interaction) {
    if (!['development', 'production'].includes(process.env.NODE_ENV) || !process.env.GUILDID || interaction.guildId !== process.env.GUILDID) {
      return interaction.reply({ content: 'Use /profile in this bot’s configured server.', ephemeral: true, allowedMentions: { parse: [] } })
    }
    // Lazy imports keep command definition review independent of storage.
    const { User } = require('../../Models/model')
    return require('../../services/profile-command').createProfileCommand({ User })(interaction)
  },
}
