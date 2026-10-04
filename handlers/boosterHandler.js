// handlers/boosterHandler.js

const cron = require('node-cron')
const { creditBank } = require('../services/fate-wallet')

module.exports = (client, User) => {
  const boosterRoleId = process.env.BOOSTERROLEID
  const unwantedRoleId = process.env.UNWANTEDROLEID
  const guildId = process.env.GUILDID

  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (
      !oldMember.roles.cache.has(boosterRoleId) &&
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

      userData = await creditBank(User, userId, 1, { countBoost: true })

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

      const roster = await require('../services/guild-members').memberDirectory(guild).get(guild, { fresh: true })
      const qualifiedMembers = [...roster].filter(
        ([_id, member]) =>
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

        const previousTotal = userData.boosterTotal
        userData = await creditBank(User, memberId, 1, { countBoost: true })

        if (userData.boosterTotal > previousTotal) {

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

      }

      console.log(`Daily booster bank update completed.`)
    } catch (err) {
      console.error('Error during daily booster bank update:', err)
    }
  })
}

