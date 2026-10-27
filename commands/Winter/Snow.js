const { SlashCommandBuilder } = require('discord.js')

module.exports = {
  environments: ['development', 'production'],
  eventKey: process.env.NODE_ENV === 'production' ? 'winter' : undefined,
  data: new SlashCommandBuilder()
    .setName('snow')
    .setDescription('Collect snow and build your Winter Wars equipment.')
    .setDMPermission(false)
    .addSubcommand(option => option.setName('hidden').setDescription('Explore a winter secret.'))
    .addSubcommand(option => option.setName('train').setDescription('Visit Hendrix’s Gym and see the Sweat you have earned.'))
    .addSubcommand(option => option.setName('kitchen').setDescription('Discover and mix secret recipes in Kylax’s Kitchen.'))
    .addSubcommand(option => option.setName('throw').setDescription('Practice throwing snowballs at the training dummy.'))
    .addSubcommand(option => option.setName('help').setDescription('Learn how to collect snow and throw snowballs.'))
    .addSubcommand(option => option.setName('status').setDescription('View your winter resources and production.'))
    .addSubcommand(option => option.setName('snowballs').setDescription('Open the Snowball Factory.'))
    .addSubcommand(option => option.setName('diamonds').setDescription('Open the Diamond Press.'))
    .addSubcommand(option => option.setName('shop').setDescription('Visit Requia’s Winter Shop.'))
    .addSubcommand(option => option.setName('shovel').setDescription('View and upgrade your shovel.')),
  async execute(interaction) {
    return require('../../services/winter/runtime').handle(interaction)
  },
}
