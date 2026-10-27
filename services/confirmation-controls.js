const { ButtonBuilder, ButtonStyle } = require('discord.js')

// Shared convention: Confirm first/left in green, Cancel last/right in red.
function confirmationButtons(confirmId, cancelId) {
  return [
    new ButtonBuilder().setCustomId(confirmId).setLabel('Confirm').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(cancelId).setLabel('Cancel').setStyle(ButtonStyle.Danger),
  ]
}
module.exports = { confirmationButtons }
