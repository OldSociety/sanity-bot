const { SlashCommandBuilder } = require('discord.js')
module.exports = {
  environments: ['development', 'production'],
  data: new SlashCommandBuilder().setName('check-in')
    .setDescription('Start or resume your campaign check-in in DMs.')
    .setDMPermission(false)
    .addStringOption(option => option.setName('campaign').setDescription('Choose if you play in both campaigns')
      .addChoices({ name: 'MondaysinHell', value: 'monday' }, { name: 'WednesdaysinHell', value: 'wednesday' })),
  async execute(interaction) { await require('../../services/checkins/runtime').checkIn(interaction) },
}
