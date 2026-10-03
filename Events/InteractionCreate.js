const { Events } = require('discord.js')


module.exports.run = async (client, message, args) => {
  const { cooldowns } = client

  if (!cooldowns.has(command.data.name)) {
    cooldowns.set(command.data.name, new Collection())
  }

  const now = Date.now()
  const timestamps = cooldowns.get(command.data.name)
  const defaultCooldownDuration = 3
  const cooldownAmount = (command.cooldown ?? defaultCooldownDuration) * 1000

  if (timestamps.has(interaction.user.id)) {
    const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount

    if (now < expirationTime) {
      const expiredTimestamp = Math.round(expirationTime / 1000)
      return interaction.reply({
        content: `Please wait, you are on a cooldown for \`${command.data.name}\`. You can use it again <t:${expiredTimestamp}:R>.`,
        ephemeral: true,
      })
    }
  }

  timestamps.set(interaction.user.id, now)
  setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount)
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    // Handle Slash Commands
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName)

      if (!command) {
        console.error(
          `No command matching ${interaction.commandName} was found.`
        )
        return
      }

      try {
        await command.execute(interaction)
      } catch (error) {
        console.error(`Error executing ${interaction.commandName}`)
        console.error(error)
        const payload = { content: 'The command could not complete. Check your saved state before trying another paid action; completed rewards remain saved.', ephemeral: true, allowedMentions: { parse: [] } }
        if (!interaction.replied && !interaction.deferred) await interaction.reply(payload).catch(() => {})
      }
    }
    // Handle Button Interactions
    else if (interaction.isButton()) {
      const customId = interaction.customId;
      if (customId.startsWith('spooky-spend-fate:') && !require('../services/spooky/fate-confirmation').hasSession(customId)) {
        await interaction.reply({ content: 'This confirmation expired. Nothing was spent by this click; use /spooky spend-fate to review a new purchase.', ephemeral: true }).catch(() => {})
        return
      }

      // Check for the roll button and pass the interaction to Sanity.js
      if (customId === 'roll') {
        try {
          await handlePlayerTurn(interaction); // Call the function to handle player's turn
        } catch (error) {
          console.error('Error handling button interaction:', error);
        }
      }
    }
  },
}
