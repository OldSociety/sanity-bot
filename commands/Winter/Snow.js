const { SlashCommandBuilder } = require('discord.js')

const data = new SlashCommandBuilder()
    .setName('snow')
    .setDescription('Collect snow and build your Winter Wars equipment.')
    .setDMPermission(false)
    .addSubcommand(option=>option.setName('admin').setDescription('Development admin testing resources.'))
    .addSubcommand(option => option.setName('emporium').setDescription('Visit Azule’s Emporium.'))
    .addSubcommand(option => option.setName('slots').setDescription('Play Zalathor’s Winter Slots.'))
    .addSubcommand(option => option.setName('hidden').setDescription('Explore a winter secret.'))
    .addSubcommand(option => option.setName('train').setDescription('Visit Hendrix’s Gym and see the Sweat you have earned.'))
    .addSubcommand(option => option.setName('kitchen').setDescription('Discover and mix secret recipes in Kylax’s Kitchen.'))
    .addSubcommand(option => option.setName('throw').setDescription('Practice throwing snowballs at the training dummy.'))
    .addSubcommand(option => option.setName('help').setDescription('Learn how to collect snow and throw snowballs.'))
    .addSubcommand(option => option.setName('status').setDescription('View your winter resources and production.'))
    .addSubcommand(option => option.setName('diamonds').setDescription('Open the Diamond Press.'))
    .addSubcommand(option => option.setName('shop').setDescription('Visit Requia’s Winter Shop.'))
if (process.env.NODE_ENV === 'development') data.addSubcommand(option => option
  .setName('diagnostic').setDescription('Development admin: speed up your Winter profile and report progress.')
  .addStringOption(o => o.setName('mode').setDescription('Start, inspect or stop diagnostics.').setRequired(true)
    .addChoices({ name: 'Start', value: 'start' }, { name: 'Status', value: 'status' }, { name: 'Stop', value: 'stop' }, { name: 'Review saved run', value: 'review' }, { name: 'Export exact audit', value: 'export' }))
  .addIntegerOption(o => o.setName('speed').setDescription('Progression speed while diagnostic mode is enabled.')
    .addChoices({ name: '1×', value: 1 }, { name: '2×', value: 2 }, { name: '5×', value: 5 }))
  .addIntegerOption(o => o.setName('report_minutes').setDescription('Real minutes between channel reports; 0 turns reports off.')
    .setMinValue(0).setMaxValue(1440))
  .addStringOption(o => o.setName('bookmark').setDescription('Start a separate test from a versioned bookmark.')
    .addChoices({ name: 'Chapter 0 — fresh tutorial', value: 'chapter0' }, { name: 'Chapter 1 — Stone shovel', value: 'chapter1' }, { name: 'Chapter 1 — Gym lessons complete (STR3)', value: 'gym' }, { name: 'Chapter 1 — Iron acquired (reference sample)', value: 'iron' }))
  .addStringOption(o => o.setName('stop_at').setDescription('Automatically freeze and save at this milestone.')
    .addChoices({ name: 'Stone shovel — end Chapter 0', value: 'stone' }, { name: 'Iron shovel', value: 'iron' }, { name: 'S3 purchase — end Chapter 1', value: 'chapter1' }, { name: 'Manual stop (Chapter 1 boundary still applies)', value: 'none' }))
  .addIntegerOption(o => o.setName('run').setDescription('Your saved run number to review or export.').setMinValue(1)))
module.exports = {
  environments: ['development', 'production'],
  eventKey: process.env.NODE_ENV === 'production' ? 'winter' : undefined,
  data,
  async execute(interaction) {
    return require('../../services/winter/runtime').handle(interaction)
  },
}
