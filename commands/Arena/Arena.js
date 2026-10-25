const { SlashCommandBuilder } = require('discord.js')

const data = new SlashCommandBuilder()
  .setName('arena')
  .setDescription('Choose a character and test turn-based combat.')
  .setDMPermission(false)
const accessOption = (option) =>
  option
    .setName('access')
    .setDescription('Server owner: unlock or lock production Arena testing.')
    .addChoices(
      { name: 'Unlock', value: 'unlock' },
      { name: 'Lock', value: 'lock' },
      { name: 'Status', value: 'status' },
    )
if (process.env.NODE_ENV === 'production') data.addStringOption(accessOption)
else {
  data
    .addSubcommand((command) =>
      command
        .setName('fight')
        .setDescription('Choose a character and start an Arena fight.')
        .addStringOption((option) =>
          option
            .setName('character')
            .setDescription(
              'Your unlocked fighter; leave blank to use the picker.',
            )
            .setAutocomplete(true),
        )
        .addStringOption((option) =>
          option
            .setName('skin')
            .setDescription('An unlocked skin for the chosen character.')
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((command) =>
      command
        .setName('campaign')
        .setDescription('Choose a tower and begin a campaign climb.'),
    )
    .addSubcommand((command) =>
      command.setName('shop').setDescription('Browse Arena character packs.'),
    )
    .addSubcommand((command) =>
      command
        .setName('access')
        .setDescription('Manage production Arena testing access.')
        .addStringOption((option) =>
          accessOption(option).setName('action').setRequired(true),
        ),
    )
    .addSubcommand((command) =>
      command
        .setName('diagnostic')
        .setDescription('Bot admin: choose detailed or compact Arena logs.')
        .addBooleanOption((option) =>
          option
            .setName('enabled')
            .setDescription(
              'Bot admin: enable full Arena logs or compact damage logs.',
            )
            .setRequired(true),
        ),
    )
}

module.exports = {
  environments: ['development', 'production'],
  data,
  async autocomplete(interaction) {
    if (require('../../services/arena/access').access.restriction(interaction))
      return interaction.respond([])
    return require('../../services/arena/fight-options').fightOptions.autocomplete(
      interaction,
    )
  },
  async execute(interaction) {
    const { access } = require('../../services/arena/access')
    const subcommand = interaction.options?.getSubcommand?.(false)
    const action = interaction.options?.getString?.(
      subcommand === 'access' ? 'action' : 'access',
    )
    const diagnostic = interaction.options?.getBoolean?.(
      subcommand === 'diagnostic' ? 'enabled' : 'diagnostic',
    )
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
    if (subcommand === 'campaign')
      return require('../../services/arena/campaign').campaign.execute(
        interaction,
      )
    if (subcommand === 'shop')
      return require('../../services/arena/shop').shop.execute(interaction)
    if (
      subcommand === 'fight' &&
      (interaction.options.getString('character') ||
        interaction.options.getString('skin'))
    ) {
      await interaction.deferReply()
      let options
      try {
        options =
          await require('../../services/arena/fight-options').fightOptions.resolve(
            interaction,
          )
      } catch (error) {
        return interaction.editReply({
          content:
            error.code === 'ARENA_FIGHT_OPTION'
              ? error.message
              : 'Your Arena character data is unavailable. Please try again shortly.',
          components: [],
          allowedMentions: { parse: [] },
        })
      }
      return require('../../services/arena/controller').arena.execute(
        interaction,
        options.character,
        options,
      )
    }
    return require('../../services/arena/controller').arena.execute(
      interaction,
      undefined,
      { selection: true },
    )
  },
}
