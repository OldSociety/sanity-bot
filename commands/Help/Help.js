// const { SlashCommandBuilder, EmbedBuilder } = require('discord.js')

// module.exports = {
//   cooldown: 5,
//   data: new SlashCommandBuilder()
//     .setName('help')
//     .setDescription(
//       'Get information about a specific command with `/help COMMAND_NAME`'
//     ),
//   async execute(interaction) {
//     try {
//       const embed = new EmbedBuilder()
//         .setTitle('All Commmands')
//         .setDescription(
//           'Get information about a specific command with `/help COMMAND_NAME`\n**__Any__ form of automating commands is __not allowed__**'
//         )
//         .addFields(
//           { name: 'fate', value: '`/fate` ' },
//           { name: 'achievements', value: '`/achievements` ' }
//         )

//       await interaction.reply({
//         embeds: [embed],
//         ephemeral: true,
//       })

//       return interaction.reply({ embeds: [embed] })
//     } catch (error) {
//       console.error('Error in checking help:', error)
//       return interaction.reply(
//         'Something went wrong while gathering the help commands.'
//       )
//     }
//   },
// }
