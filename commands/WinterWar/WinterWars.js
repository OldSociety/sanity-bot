// const { SlashCommandBuilder } = require('@discordjs/builders')
// const fs = require('fs')
// const path = require('path')

// module.exports = {
//   data: new SlashCommandBuilder()
//     .setName('winterwars')
//     .setDescription('Winter Wars game hub')
//     .addSubcommand((subcommand) =>
//       subcommand.setName('collect').setDescription('Collect snowballs')
//     )
//     .addSubcommand((subcommand) =>
//       subcommand
//         .setName('throw')
//         .setDescription('Throw snowballs at another player')
//     )
//     .addSubcommand((subcommand) =>
//       subcommand.setName('leaderboard').setDescription('View the leaderboard')
//     )
//     .addSubcommand((subcommand) =>
//       subcommand.setName('stats').setDescription('View your stats')
//     )
//     .addSubcommand((subcommand) =>
//       subcommand
//         .setName('snowball_news')
//         .setDescription('View upcoming bot updates')
//     )
//     .addSubcommand((subcommand) =>
//       subcommand.setName('quests').setDescription('View quests')
//     )
//     .addSubcommand((subcommand) =>
//       subcommand
//         .setName('collection')
//         .setDescription('View your collected items')
//     )
//     .addSubcommand((subcommand) =>
//       subcommand
//         .setName('item_info')
//         .setDescription('View info about collectible items')
//     )
//     .addSubcommand((subcommand) =>
//       subcommand
//         .setName('fight')
//         .setDescription('Fight the Snow Monster for rewards')
//     )
//     .addSubcommand((subcommand) =>
//       subcommand.setName('claim').setDescription('Claim vote rewards')
//     )
//     .addSubcommand((subcommand) =>
//       subcommand.setName('shop').setDescription('View the shop')
//     )
//     .addSubcommand((subcommand) =>
//       subcommand.setName('choose').setDescription('Switch between characters')
//     )
//     .addSubcommand((subcommand) =>
//       subcommand.setName('gift').setDescription('Gift someone')
//     ),

//   async execute(interaction) {
//     const subcommand = interaction.options.getSubcommand()
//     const subcommandFile = path.join(
//       __dirname,
//       'winterwars',
//       `${subcommand}.js`
//     )

//     if (fs.existsSync(subcommandFile)) {
//       const command = require(subcommandFile)
//       return command.execute(interaction)
//     } else {
//       return interaction.reply({
//         content: 'Subcommand not implemented yet.',
//         ephemeral: true,
//       })
//     }
//   },
// }
