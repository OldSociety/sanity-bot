const { SlashCommandBuilder } = require('discord.js')

module.exports = {
  environments: ['development', 'production'],
  data: new SlashCommandBuilder()
    .setName('arena')
    .setDescription('Choose a character and test turn-based combat.')
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName('access')
        .setDescription(
          'Server owner: unlock or lock production Arena testing.'
        )
        .addChoices(
          { name: 'Unlock', value: 'unlock' },
          { name: 'Lock', value: 'lock' },
          { name: 'Status', value: 'status' }
        )
    ),
  async autocomplete(interaction) {
    if (require('../../services/arena/access').access.restriction(interaction))
      return interaction.respond([])
    const { fighterChoices } = require('../../services/arena/selection')
    return interaction.respond(fighterChoices(interaction.options.getFocused()))
  },
  async execute(interaction) {
    const { access } = require('../../services/arena/access')
    const action = interaction.options?.getString?.('access')
    if (action) return access.manage(interaction, action)
    if (!(await access.authorize(interaction))) return
    const {
      resolveCharacter,
      isSelectable,
    } = require('../../services/arena/characters')
    const value = interaction.options?.getString?.('character')
    const {
      findFamily,
      variantsFor,
    } = require('../../services/arena/selection')
    const family = findFamily(value)
    const character = value
      ? family
        ? variantsFor(family)[0]
        : resolveCharacter(value)
      : undefined
    if (value && !character)
      return interaction.reply({
        content: 'Choose a fighter from the autocomplete suggestions.',
        ephemeral: true,
        allowedMentions: { parse: [] },
      })
    if (character && !isSelectable(character))
      return interaction.reply({
        content: 'Choose an available fighter from the Arena suggestions.',
        ephemeral: true,
        allowedMentions: { parse: [] },
      })
    return require('../../services/arena/controller').arena.execute(
      interaction,
      character,
      { selection: true }
    )
  },
}
