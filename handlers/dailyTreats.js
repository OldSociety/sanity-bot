const { Op } = require('sequelize')
const { SpookyStat } = require('../Models/model')

async function awardDailyTreats(guild) {
  try {
    console.log('🎃 Running daily treat award...')

    const sweetToothRoleId = process.env.SWEETTOOTHROLEID

    // Get the current date and the date 24 hours ago
    const now = new Date()
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // Fetch only users who have been active in the last 24 hours
    const spookyStats = await SpookyStat.findAll({
      where: {
        lastActive: {
          [Op.gte]: yesterday, // Users active in the last 24 hours
        },
      },
    })

    if (spookyStats.length === 0) {
      console.log('⚠️ No active participants to award treats.')
      return
    }

    for (const stat of spookyStats) {
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

    console.log('✅ Daily treat award completed.')
  } catch (error) {
    console.error('❌ Error awarding daily treats:', error)
  }
}

module.exports = { awardDailyTreats }
