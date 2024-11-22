// commands/report.js

const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ChannelType } = require('discord.js')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('Report activity to the staff anonymously or publicly'),

  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('anonymousReport')
      .setTitle('Anonymous Report')

    // Information Input
    const infoInput = new TextInputBuilder()
      .setCustomId('reportInfo')
      .setLabel('INFORMATION')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter details of the activity...')
      .setRequired(true)

    // Optional Links Input
    const linkInput = new TextInputBuilder()
      .setCustomId('reportLinks')
      .setLabel('OPTIONAL LINKS')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Include any relevant links (optional)')
      .setRequired(false)

    // Public or Anonymous Selection
    const visibilityInput = new TextInputBuilder()
      .setCustomId('reportVisibility')
      .setLabel('PUBLIC OR ANONYMOUS?')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Keep empty for anonymity. Put ANY text here to open a private chat with staff.')
      .setRequired(false)

    modal.addComponents(
      new ActionRowBuilder().addComponents(infoInput),
      new ActionRowBuilder().addComponents(linkInput),
      new ActionRowBuilder().addComponents(visibilityInput)
    )

    await interaction.showModal(modal)
  },
}