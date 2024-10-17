const { Op } = require('sequelize')
const { SpookyStat } = require('../Models/model')

async function awardDailyTreats(guild) {
  try {
    console.log('🎃 Running daily treat award...')

    const sweetToothRoleId = process.env.SWEETTOOTHROLEID

    // Get the current date and the date 24 hours ago
    const now = new Date()
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // Fetch users who were active in the last 24 hours
    const activeSpookyStats = await SpookyStat.findAll({
      where: {
        lastActive: {
          [Op.gte]: yesterday, // Users active in the last 24 hours
        },
      },
    })

    // Fetch users who were NOT active in the last 24 hours
    const inactiveSpookyStats = await SpookyStat.findAll({
      where: {
        lastActive: {
          [Op.lt]: yesterday, // Users inactive for more than 24 hours
        },
      },
    })

    // Award treats to active users
    for (const stat of activeSpookyStats) {
      const member = await guild.members.fetch(stat.userId).catch(() => null)

      if (member) {
        const treatBonus = member.roles.cache.has(sweetToothRoleId) ? 5 : 3
        stat.treats += treatBonus
        await stat.save()

        console.log(
          `🎁 Awarded ${treatBonus} treat(s) to ${member.user.username}. Total: ${stat.treats}`
        )
      } else {
        console.log(`⚠️ User with ID ${stat.userId} not found in guild.`)
      }
    }

    // Deduct 1 treat from inactive users
    for (const stat of inactiveSpookyStats) {
      const member = await guild.members.fetch(stat.userId).catch(() => null)

      if (member && stat.treats > 0) {
        stat.treats = Math.max(0, stat.treats - 1) // Deduct 1 treat but ensure it doesn't go below 0
        await stat.save()

        console.log(
          `❌ Deducted 1 treat from inactive user ${member.user.username}. Remaining treats: ${stat.treats}`
        )
      } else {
        console.log(`⚠️ User with ID ${stat.userId} not found in guild or has 0 treats.`)
      }
    }

    console.log('✅ Daily treat award and penalties completed.')
  } catch (error) {
    console.error('❌ Error during daily treat award or penalties:', error)
  }
}

module.exports = { awardDailyTreats }
