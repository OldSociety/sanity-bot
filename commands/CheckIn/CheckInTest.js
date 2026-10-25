const { SlashCommandBuilder } = require('discord.js')
module.exports = {
  environments: ['development'],
  data: new SlashCommandBuilder().setName('checkin-test')
    .setDescription('Server owner: test a private campaign check-in and staff review.')
    .setDMPermission(false)
    .addStringOption(option => option.setName('campaign').setDescription('Campaign questionnaire to test').setRequired(true)
      .addChoices({ name: 'WednesdaysinHell', value: 'wednesday' }, { name: 'Monday party', value: 'monday' })),
  async execute(interaction) { await require('../../services/checkins/runtime').test(interaction) },
}
