const { Op } = require('sequelize')
const { SpookyStat } = require('../Models/model')

async function awardDailyTreats(guild) {
  try {
    console.log('🎃 Running daily treat award...')

    const sweetToothRoleId = process.env.SWEETTOOTHROLEID

    const now = new Date()
    const hours = now.getHours()
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // Fetch users who were active in the last 24 hours
    const activeSpookyStats = await SpookyStat.findAll({
      where: {
        lastActive: {
          [Op.gte]: yesterday, // Users active in the last 24 hours
        },
        treats: {
          [Op.lt]: 10, // Only award candies if they have less than 10
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
        // Sweet Tooth role gets candy rewards all day, others between 7am-10pm
        const isSweetTooth = member.roles.cache.has(sweetToothRoleId)
        if (isSweetTooth || (hours >= 7 && hours < 22)) {
          const maxCandiesPerDay = isSweetTooth ? 8 : 5
          const treatBonus = 1

          // Calculate candies based on the last award time to give one every 3 hours
          const hoursSinceLastAward =
            (now.getTime() - stat.lastActive.getTime()) / (1000 * 60 * 60)
          const canReceiveCandy = Math.floor(hoursSinceLastAward / 3) > 0

          // Enforce maxCandiesPerDay
          const candiesAwardedToday = Math.min(
            stat.treats + treatBonus,
            maxCandiesPerDay
          )

          if (canReceiveCandy && stat.treats < 10) {
            stat.treats = Math.min(candiesAwardedToday, 10)
            await stat.save()

            console.log(
              `🎁 Awarded ${treatBonus} treat(s) to ${member.user.username}. Total: ${stat.treats}`
            )
          }
        }
      } else {
        console.log(`⚠️ User with ID ${stat.userId} not found in guild.`)
      }
    }

    // Deduct 1 treat from inactive users every 24 hours
    for (const stat of inactiveSpookyStats) {
      const member = await guild.members.fetch(stat.userId).catch(() => null)

      if (member && stat.treats > 0) {
        stat.treats = Math.max(0, stat.treats - 1) // Deduct 1 treat but ensure it doesn't go below 0
        await stat.save()

        console.log(
          `❌ Deducted 1 treat from inactive user ${member.user.username}. Remaining treats: ${stat.treats}`
        )
      } else {
        console.log(
          `⚠️ User with ID ${stat.userId} not found in guild or has 0 treats.`
        )
      }
    }

    console.log('✅ Daily treat award and penalties completed.')
  } catch (error) {
    console.error('❌ Error during daily treat award or penalties:', error)
  }
}

module.exports = { awardDailyTreats }
