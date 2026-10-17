const { SlashCommandBuilder } = require('discord.js')

module.exports = {
  environments: ['development'],
  data: new SlashCommandBuilder()
    .setName('arena')
    .setDescription('Choose a character and test active or idle combat.')
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName('character')
        .setDescription(
          'Choose a fighter; select their skin inside Arena.',
        )
        .setAutocomplete(true),
    ),
  async autocomplete(interaction) {
    if (
      process.env.NODE_ENV !== 'development' ||
      !process.env.GUILDID ||
      interaction.guildId !== process.env.GUILDID
    )
      return interaction.respond([])
    const { fighterChoices } = require('../../services/arena/selection')
    return interaction.respond(
      fighterChoices(interaction.options.getFocused()),
    )
  },
  async execute(interaction) {
    if (
      process.env.NODE_ENV !== 'development' ||
      !process.env.GUILDID ||
      interaction.guildId !== process.env.GUILDID
    ) {
      return interaction.reply({
        content: 'Arena is available in the development server only.',
        ephemeral: true,
        allowedMentions: { parse: [] },
      })
    }
    const { resolveCharacter, isSelectable } = require('../../services/arena/characters')
    const value = interaction.options?.getString?.('character')
    const { findFamily, variantsFor } = require('../../services/arena/selection')
    const family = findFamily(value)
    const character = value ? (family ? variantsFor(family)[0] : resolveCharacter(value)) : undefined
    if (value && !character)
      return interaction.reply({
        content:
          'Choose a fighter from the autocomplete suggestions.',
        ephemeral: true,
        allowedMentions: { parse: [] },
      })
    if (character && !isSelectable(character))
      return interaction.reply({
        content: 'Only Marq [Spooky] and Maxim [Spooky] are available for Arena testing right now.',
        ephemeral: true,
        allowedMentions: { parse: [] },
      })
    return require('../../services/arena/controller').arena.execute(
      interaction,
      character,
      { selection: true },
    )
  },
}
