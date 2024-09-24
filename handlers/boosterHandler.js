// handlers/boosterHandler.js

const cron = require('node-cron')

module.exports = (client, User) => {
  // Role IDs
  const boosterRoleId = process.env.BOOSTERROLEID
  const unwantedRoleId = process.env.UNWANTEDROLEID
  const guildId = process.env.GUILDID

  // Event listener for when a member updates (e.g., gains or loses a role)
  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    // Check if the booster role was added
    if (
      !oldMember.roles.cache.has(boosterRoleId) &&
      newMember.roles.cache.has(boosterRoleId)
    ) {
      // Member just gained the booster role
      const userId = newMember.id

      // Ensure the user has the Unwanted role
      if (!newMember.roles.cache.has(unwantedRoleId)) {
        // User does not have the Unwanted role; do not proceed
        return
      }

      // Fetch or create user data
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
          boosterTotal: 0, // Initialize total extra fate points
        })
      }

      // Add 1 point to their bank, ensuring the cap is not exceeded
      userData.bank = Math.min(userData.bank + 1, 100)
      userData.boosterTotal = (userData.boosterTotal || 0) + 1 // Increment total extra fate points
      await userData.save()

      // Send the special welcome message
      try {
        await newMember.send(
          `Thank you for boosting the server! As a token of our appreciation, you will receive **1 extra fate point in your bank daily** as long as you're boosting the server. These points can only be spent on fate rolls and will be **automatically deducted first** whenever you use the /fate roll command. Thank you for your support!`
        )
      } catch (err) {
        console.error(`Could not send DM to ${newMember.user.tag}.`)
      }
    }
  })

  // Schedule a daily job to add 1 point to all boosters' banks
  cron.schedule('0 0 * * *', async () => {
    try {
      const guild = await client.guilds.fetch(guildId)
      if (!guild) return

      // Fetch all members with the booster role
      console.log('daily point')
      await guild.members.fetch() // Ensure all members are cached
      const boosters = guild.members.cache.filter((member) =>
        member.roles.cache.has(boosterRoleId)
      )

      // For each booster, add 1 point to their bank
      for (const [memberId, member] of boosters) {
        // Ensure the user has the Unwanted role
        if (!member.roles.cache.has(unwantedRoleId)) {
          // User does not have the Unwanted role; do not proceed
          continue
        }

        // Fetch or create user data
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
            boosterTotal: 0, // Initialize total extra fate points
          })
        }

        // Add 1 point to their bank, ensuring the cap is not exceeded
        const previousBank = userData.bank
        userData.bank = Math.min(userData.bank + 1, 100)

        // Only increment the total if the bank was not already at the cap
        if (userData.bank > previousBank) {
          userData.boosterTotal = (userData.boosterTotal || 0) + 1

          // Check if total extra fate points is a multiple of 10
          if (userData.boosterTotal % 15 === 0) {
            // Send a special message to the user
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
