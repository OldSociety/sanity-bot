const { SlashCommandBuilder } = require('discord.js')

module.exports = {
  environments: [], // Closed until the non-game reward catalog is ready.
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Manage and interact with the shop.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add-item')
        .setDescription('Admins: Add an item to the shop.')
        .addStringOption((option) =>
          option.setName('name').setDescription('Item name').setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('description')
            .setDescription('Item description')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('image')
            .setDescription('Item image URL')
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName('cost')
            .setDescription('Item cost in Fate Points')
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName('stock')
            .setDescription('Item stock (-1 for infinite)')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove-item')
        .setDescription('Admins: Remove an item from the shop.')
        .addIntegerOption((option) =>
          option
            .setName('number')
            .setDescription('Item number (as displayed in the shop list) to remove')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('restock')
        .setDescription('Admins: Restock an item in the shop.')
        .addIntegerOption((option) =>
          option
            .setName('number')
            .setDescription('Item number (as displayed in the shop list) to restock')
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName('amount')
            .setDescription('New stock count (-1 for infinite)')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('Displays all available shop items.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('buy')
        .setDescription('Purchase an item from the shop.')
        .addIntegerOption((option) =>
          option
            .setName('number')
            .setDescription('Item number (as displayed in the shop list) to buy')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    return interaction.reply({ content: 'The Fate shop is temporarily closed while new rewards are being planned.', ephemeral: true })
  },
}
