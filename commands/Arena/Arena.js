const { SlashCommandBuilder } = require('discord.js')

const data = new SlashCommandBuilder()
  .setName('arena')
  .setDescription('Choose a character and test turn-based combat.')
  .setDMPermission(false)
  .addStringOption((option) =>
    option
      .setName('access')
      .setDescription('Server owner: unlock or lock production Arena testing.')
      .addChoices(
        { name: 'Unlock', value: 'unlock' },
        { name: 'Lock', value: 'lock' },
        { name: 'Status', value: 'status' },
      ),
  )
if (process.env.NODE_ENV !== 'production')
  data.addBooleanOption((option) =>
    option
      .setName('diagnostic')
      .setDescription(
        'Bot admin: enable full Arena logs or compact damage logs.',
      ),
  )

module.exports = {
  environments: ['development', 'production'],
  data,
  async execute(interaction) {
    const { access } = require('../../services/arena/access')
    const action = interaction.options?.getString?.('access')
    const diagnostic = interaction.options?.getBoolean?.('diagnostic')
    if (typeof diagnostic === 'boolean') {
      if (action)
        return interaction.reply({
          content: 'Choose access or diagnostic in one command, not both.',
          ephemeral: true,
          allowedMentions: { parse: [] },
        })
      return require('../../services/arena/diagnostics').manageDiagnostic(
        interaction,
        diagnostic,
      )
    }
    if (action) return access.manage(interaction, action)
    if (!(await access.authorize(interaction))) return
    return require('../../services/arena/controller').arena.execute(
      interaction,
      undefined,
      { selection: true },
    )
  },
}
