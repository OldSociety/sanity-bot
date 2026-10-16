const { SlashCommandBuilder } = require('discord.js')

module.exports = {
  environments: ['development'],
  data: new SlashCommandBuilder().setName('arena').setDescription('Choose a character and test active or idle combat.').setDMPermission(false)
    .addStringOption(option => option.setName('character').setDescription('Choose a character and version; defaults to Marq [Spooky].').setAutocomplete(true))
    .addIntegerOption(option => option.setName('level').setDescription('Test level for both fighters (1–60); defaults to 1.').setMinValue(1).setMaxValue(60)),
  async autocomplete(interaction) {
    if (process.env.NODE_ENV !== 'development' || !process.env.GUILDID || interaction.guildId !== process.env.GUILDID) return interaction.respond([])
    const { characterChoices } = require('../../services/arena/characters')
    return interaction.respond(characterChoices(interaction.options.getFocused()))
  },
  async execute(interaction) {
    if (process.env.NODE_ENV !== 'development' || !process.env.GUILDID || interaction.guildId !== process.env.GUILDID) {
      return interaction.reply({ content: 'Arena is available in the development server only.', ephemeral: true, allowedMentions: { parse: [] } })
    }
    const { resolveCharacter } = require('../../services/arena/characters')
    const character = resolveCharacter(interaction.options?.getString?.('character'))
    if (!character) return interaction.reply({ content: 'Choose a character/version from the autocomplete suggestions.', ephemeral: true, allowedMentions: { parse: [] } })
    const level = interaction.options?.getInteger?.('level') ?? 1
    if (!Number.isInteger(level) || level < 1 || level > 60) return interaction.reply({ content: 'Choose a level from 1 to 60.', ephemeral: true, allowedMentions: { parse: [] } })
    return require('../../services/arena/controller').arena.execute(interaction, character, { level })
  },
}
