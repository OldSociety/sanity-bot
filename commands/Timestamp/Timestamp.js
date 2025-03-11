// timestamp.js
const { SlashCommandBuilder } = require('discord.js')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timestamp')
    .setDescription('Convert a date/time into a Discord timestamp.')
    .addStringOption((option) =>
      option
        .setName('datetime')
        .setDescription('Date and time (e.g., "2025-03-07 18:30")')
        .setRequired(true)
    ),
  async execute(interaction) {
    const input = interaction.options.getString('datetime')
    const date = new Date(input)

    if (isNaN(date.getTime())) {
      await interaction.reply({
        content: 'Invalid date/time format. Use `YYYY-MM-DD HH:mm`.',
        ephemeral: true,
      })
      return
    }

    const timestamp = Math.floor(date.getTime() / 1000)
    await interaction.reply(
      `Your timestamp: <t:${timestamp}:F>\n\`<t:${timestamp}:F>\``
    )
  },
}
