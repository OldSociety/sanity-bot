const { SlashCommandBuilder } = require('discord.js')

function spookyCommand(controller) {
  const data = new SlashCommandBuilder().setName('spooky').setDescription('Play Spooky Season or view your collection.')
  const subcommands = {
    help: 'Read the Spooky rules.', register: 'Join Spooky Season and see how to play.',
    collection: 'View your character quarters and balances.',
    leaderboard: 'View the Spooky rankings for Scream Supreme.',
    trick: 'Spend one candy on a random trick.', treat: 'Spend one candy on a random treat.',
    'spend-fate': 'Review and confirm spending ten Fate Points on a random quarter.',
  }
  for (const [name, description] of Object.entries(subcommands)) data.addSubcommand(command => {
    command.setName(name).setDescription(description)
    if (name === 'leaderboard') command.addIntegerOption(option => option.setName('page').setDescription('Rankings page.').setMinValue(1).setMaxValue(1000))
    return command
  })
  return { data, eventKey: 'spooky', execute: interaction => controller.execute(interaction) }
}

module.exports = { spookyCommand }
