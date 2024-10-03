// const { SlashCommandBuilder, EmbedBuilder } = require('discord.js')
// const { User } = require('../../Models/model.js') // Adjust according to your project structure
// const cron = require('node-cron') // Import node-cron to reset cooldowns

// // Function to calculate time left for cooldown reset
// function getTimeUntilNextReset() {
//   const now = new Date()
//   const nextReset = new Date()
//   nextReset.setUTCHours(14, 0, 0, 0) // 6am PST is 14:00 UTC
//   if (now > nextReset) nextReset.setUTCDate(nextReset.getUTCDate() + 1) // Move to the next day if time is past 6am

//   const msUntilReset = nextReset - now
//   const hours = Math.floor(msUntilReset / (1000 * 60 * 60))
//   const minutes = Math.floor((msUntilReset % (1000 * 60 * 60)) / (1000 * 60))
//   const seconds = Math.floor((msUntilReset % (1000 * 60)) / 1000)

//   return { hours, minutes, seconds }
// }

// module.exports = {
//   data: new SlashCommandBuilder()
//     .setName('daily')
//     .setDescription('Claim your daily fate point.'),
//   async execute(interaction) {
//     const userId = interaction.user.id

//     // Fetch or create user data
//     let userData = await User.findOne({ where: { user_id: userId } })
//     if (!userData) {
//       userData = await User.create({
//         user_id: userId,
//         user_name: interaction.user.username,
//         chat_exp: 0,
//         chat_level: 1,
//         bank: 0,
//         fate_points: 0,
//         last_chat_message: new Date(),
//         last_daily: null, // To track when the user last claimed daily reward
//       })
//     }

//     // Check if the user is on cooldown
//     const lastDaily = userData.last_daily ? new Date(userData.last_daily) : null
//     const now = new Date()
//     const resetTime = new Date()
//     resetTime.setUTCHours(14, 0, 0, 0) // 6am PST (14:00 UTC)

//     if (now > resetTime) resetTime.setUTCDate(resetTime.getUTCDate() + 1) // Move to next day if already past reset time

//     // Check if the last claim was today
//     if (lastDaily && lastDaily >= resetTime) {
//       const { hours, minutes, seconds } = getTimeUntilNextReset()
//       const cooldownEmbed = new EmbedBuilder()
//         .setColor('#FF0000')
//         .setTitle('You are on cooldown!')
//         .setDescription(
//           `You can claim your daily fate point again in: ${hours} hours, ${minutes} minutes, and ${seconds} seconds.`
//         )

//       await interaction.reply({ embeds: [cooldownEmbed], ephemeral: true })
//       return
//     }

//     // Award 1 fate point and update the last_daily field
//     userData.fate_points = Math.min(userData.fate_points + 1, 100) // Cap at 100
//     userData.last_daily = now
//     await userData.save()

//     const successEmbed = new EmbedBuilder()
//       .setColor('#00FF00')
//       .setTitle('Daily Fate Point Claimed!')
//       .setDescription(
//         'You have received 1 fate point as part of your daily reward.'
//       )
//       .addFields(
//         { name: 'Fate Points', value: `${userData.fate_points}`, inline: true },
//         { name: 'Total', value: `${userData.fate_points}`, inline: true }
//       )

//     await interaction.reply({ embeds: [successEmbed], ephemeral: true })
//   },
// }
