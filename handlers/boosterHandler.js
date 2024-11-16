// handlers/boosterHandler.js

const cron = require('node-cron')

module.exports = (client, User) => {
  const boosterRoleId = process.env.BOOSTERROLEID
  const unwantedRoleId = process.env.UNWANTEDROLEID
  const guildId = process.env.GUILDID

  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (
      newMember.roles.cache.has(boosterRoleId) &&
      newMember.roles.cache.has(unwantedRoleId)
    ) {
      const userId = newMember.id

      let userData = await User.findOne({ where: { user_id: userId } })
      if (!userData) {
        userData = await User.create({
          user_id: userId,
          user_name: newMember.user.username,
          chat_exp: 0,
          chat_level: 1,
          bank: 0,
          fate_points: 0,
          last_chat_message: new Date(),
          boosterTotal: 0,
        })
      }

      userData.bank = Math.min(userData.bank + 1, 100)
      userData.boosterTotal = (userData.boosterTotal || 0) + 1
      await userData.save()

      try {
        await newMember.send(
          `Thank you for boosting the server! Since you also hold the Unwanted role, you will receive **1 extra fate point in your bank daily** as long as you're boosting the server. These points can only be spent on fate rolls and will be **automatically deducted first** whenever you use the /fate roll command.`
        )
      } catch (err) {
        console.error(`Could not send DM to ${newMember.user.tag}.`)
      }
    }
  })

  cron.schedule('0 5 * * *', async () => {
    try {
      const guild = await client.guilds.fetch(guildId)
      if (!guild) return

      await guild.members.fetch()
      const qualifiedMembers = guild.members.cache.filter(
        (member) =>
          member.roles.cache.has(boosterRoleId) &&
          member.roles.cache.has(unwantedRoleId)
      )

      for (const [memberId, member] of qualifiedMembers) {
        let userData = await User.findOne({ where: { user_id: memberId } })
        if (!userData) {
          userData = await User.create({
            user_id: memberId,
            user_name: member.user.username,
            chat_exp: 0,
            chat_level: 1,
            bank: 0,
            fate_points: 0,
            last_chat_message: new Date(),
            boosterTotal: 0,
          })
        }

        const previousBank = userData.bank
        userData.bank = Math.min(userData.bank + 1, 100)

        if (userData.bank > previousBank) {
          userData.boosterTotal = (userData.boosterTotal || 0) + 1

          if (userData.boosterTotal % 15 === 0) {
            const total = userData.boosterTotal
            try {
              await member.send(
                `Thank you for your continued support! You have received a total of ${total} extra fate points since you began boosting the server.`
              )
            } catch (err) {
              console.error(`Could not send DM to ${member.user.tag}.`)
            }
          }
        }

        await userData.save()
      }

      console.log(`Daily booster bank update completed.`)
    } catch (err) {
      console.error('Error during daily booster bank update:', err)
    }
  })
}

