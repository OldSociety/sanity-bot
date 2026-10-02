const { SlashCommandBuilder } = require('discord.js')

function spookyCommand(controller) {
  const data = new SlashCommandBuilder().setName('spooky').setDescription('Play Spooky Season or view your collection.')
  const subcommands = {
    welcome: 'Welcome to Spooky Season.', help: 'Read the Spooky rules.', register: 'Join Spooky Season.',
    status: 'View your candy and Evil Eyes.', collection: 'View your character quarters.',
    trick: 'Spend one candy on a random trick.', treat: 'Spend one candy on a random treat.',
    fate: 'Spend ten banked fate on a random quarter.',
  }
  for (const [name, description] of Object.entries(subcommands)) data.addSubcommand(command => command.setName(name).setDescription(description))
  return { data, execute: interaction => controller.execute(interaction) }
}

module.exports = { spookyCommand }
