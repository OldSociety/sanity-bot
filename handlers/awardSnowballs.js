const { Op } = require('sequelize')
const { HolidayStat } = require('../Models/model')

async function awardSnowballs(guild) {
//   try {
//     console.log('Running daily snowball award...')

//     // const sweetToothRoleId = process.env.SWEETTOOTHROLEID
//     const stats = await HolidayStat.findAll();

//     // Award snowballs to active users
//     for (const stat of stats) {
//       const member = await guild.members.fetch(stat.userId).catch(() => null)

//       if (member) {
//         // Only award snowballs if the player has fewer than 10
//         if (stat.snowballs < 10) {
//           stat.snowballs = Math.min(stat.snowballs + 1, 10) // Cap snowballs at 10
//           await stat.save()

//           console.log(
//             `Refilled a ⚪ snowball for ${member.user.username}. Total: ${stat.snowballs}`
//           )
//         } 
//       } else {
//         console.log(`⚠️ User with ID ${stat.userId} not found in guild.`)
//       }
//     }
//   } catch (error) {
//     console.error('❌ Error during daily snowball award or penalties:', error)
//   }
}

module.exports = awardSnowballs
