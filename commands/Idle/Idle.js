const { SlashCommandBuilder } = require('discord.js')
const available = interaction => process.env.NODE_ENV === 'development' &&
  Boolean(process.env.GUILDID) && interaction.guildId === process.env.GUILDID

module.exports = {
  environments: ['development'],
  data: new SlashCommandBuilder().setName('idle')
    .setDescription('Simulate one automated Arena fight with Power, Technique and Composure.')
    .setDMPermission(false)
    .addStringOption(option => option.setName('character').setDescription('Choose an available Arena character.').setRequired(true).setAutocomplete(true))
    .addStringOption(option => option.setName('skin').setDescription('Choose an eligible skin for that character.').setRequired(true).setAutocomplete(true))
    .addStringOption(option => option.setName('stats').setDescription('Power,Technique,Composure: three integers totaling 100, e.g. 50,30,20.').setRequired(true)),
  async autocomplete(interaction) {
    if (!available(interaction)) return interaction.respond([])
    const { characterChoices, skinChoices } = require('../../services/idle/selection')
    const focused = interaction.options.getFocused(true)
    return interaction.respond(focused.name === 'character' ? characterChoices(focused.value) :
      focused.name === 'skin' ? skinChoices(interaction.options.getString('character'), focused.value) : [])
  },
  async execute(interaction) {
    const privateError = content => interaction.reply({ content, ephemeral: true, allowedMentions: { parse: [] } })
    if (!available(interaction)) return privateError('Idle is available in the development server only.')
    const { resolveSelection } = require('../../services/idle/selection')
    const { parseStats, simulate } = require('../../services/idle/combat')
    const { resultEmbed } = require('../../services/idle/results')
    let selection, stats
    try {
      stats = parseStats(interaction.options.getString('stats', true))
      selection = resolveSelection(interaction.options.getString('character', true), interaction.options.getString('skin', true))
    } catch (error) { return privateError(error.message) }
    await interaction.deferReply()
    try {
      const battle = simulate({ ...selection, stats })
      return await interaction.editReply({ embeds: [resultEmbed(battle)], allowedMentions: { parse: [] } })
    } catch (error) {
      console.error('Idle simulation failed:', error.message)
      return interaction.editReply({ content: 'This prototype could not resolve the fight. No progression or rewards were changed.', allowedMentions: { parse: [] } })
    }
  },
}
