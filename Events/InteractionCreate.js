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
      const disabled = require('../services/disabled-commands').disabledMessage(interaction.commandName)
      if (disabled) {
        await interaction.reply({ content: disabled, ephemeral: true, allowedMentions: { parse: [] } }).catch(() => {})
        return
      }
      const command = interaction.client.commands.get(interaction.commandName)
      if (interaction.commandName === 'shop') {
        await interaction.reply({ content: 'The Fate shop is temporarily closed while new rewards are being planned.', ephemeral: true }).catch(() => {})
        return
      }

      if (!command) {
        console.error(
          `No command matching ${interaction.commandName} was found.`
        )
        return
      }

      try {
        if (!require('../services/command-environment').commandEnabled(command, process.env.NODE_ENV)) {
          await interaction.reply({ content: 'This command is not currently available.', ephemeral: true, allowedMentions: { parse: [] } })
          return
        }
        if (process.env.NODE_ENV !== 'development' && ['spooky', 'spooky-admin', 'badges', 'profile', 'user'].includes(interaction.commandName) && interaction.guild) {
          const member = await interaction.guild.members.fetch({ user: interaction.user.id, force: true })
          if (require('../services/member-policy').excludedMember(member)) {
            await interaction.reply({ content: 'Bots are excluded from these commands in production.', ephemeral: true, allowedMentions: { parse: [] } })
            return
          }
          const target = interaction.options.getUser('player')
          if (target && require('../services/member-policy').excludedMember(await interaction.guild.members.fetch({ user: target.id, force: true }))) {
            await interaction.reply({ content: 'Bots cannot be selected for these commands in production.', ephemeral: true, allowedMentions: { parse: [] } })
            return
          }
        }
        await command.execute(interaction)
        if (process.env.NODE_ENV === 'development') {
          try { await require('../services/sanity-reminder').nudge(interaction, require('../Models/model').User) }
          catch (error) { console.error('Sanity reminder unavailable:', error.message) }
        }
      } catch (error) {
        console.error(`Error executing ${interaction.commandName}`)
        console.error(error)
        const payload = { content: 'The command could not complete. Check your saved state before trying another paid action; completed rewards remain saved.', ephemeral: true, allowedMentions: { parse: [] } }
        if (interaction.deferred && !interaction.replied) await interaction.editReply(payload).catch(() => {})
        if (!interaction.replied && !interaction.deferred) await interaction.reply(payload).catch(() => {})
      }
    }
    // Handle Button Interactions
    else if (interaction.isButton()) {
      const customId = interaction.customId;
      if (customId.startsWith('spooky-target:') && !require('../services/spooky/target-choice').hasSession(customId)) {
        await interaction.reply({ content: 'This Halloween choice has ended. This click cannot spend candy or change its result.', ephemeral: true }).catch(() => {})
        return
      }
      if (customId.startsWith('spooky-spend-fate:') && !require('../services/spooky/fate-confirmation').hasSession(customId)) {
        const purchase = require('../services/sanity').selected().spendingEnabled ? 'buy-quarter' : 'spend-fate'
        await interaction.reply({ content: `This confirmation expired. Nothing was spent by this click; use /spooky ${purchase} to review a new purchase.`, ephemeral: true }).catch(() => {})
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
