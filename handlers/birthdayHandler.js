const cron = require('node-cron')
const moment = require('moment-timezone')
const { User } = require('../Models/model') // Adjust path as necessary

module.exports = (client) => {
  // Schedule the job to run every day at 6:00 AM Los Angeles time.
  client.once('ready', async () => {
    cron.schedule(
      '0 6 * * *',
      async () => {
        try {
          // Get the current LA date
          const laNow = moment().tz('America/Los_Angeles')
          const todayDay = laNow.date()
          const todayMonth = laNow.month() + 1 // month() is zero-indexed

          // Fetch all users (or use a more specific query if possible)
          const users = await User.findAll()

          // Loop through each user and check if today is their birthday.
          for (const user of users) {
            if (!user.birthday) continue // Skip if no birthday stored

            const birthdayDate = new Date(user.birthday)
            // Compare the day and month of the stored birthday with today's date.
            if (
              birthdayDate.getDate() === todayDay &&
              birthdayDate.getMonth() + 1 === todayMonth
            ) {
              // For each birthday user, find them in your guild(s).
              for (const guild of client.guilds.cache.values()) {
                const member = guild.members.cache.get(user.user_id)
                if (!member) continue

                // Check for the unwanted role if needed.
                const hasUnwantedRole = member.roles.cache.has(
                  process.env.UNWANTEDROLEID
                )
                if (!hasUnwantedRole) continue

                // Get the target channel using BOTTESTCHANNELID from your environment.
                const channel = client.channels.cache.get(
                  process.env.FUCKERYCHANNELID
                )
                if (channel && !hasUnwantedRole) {
                  // Send a message to the channel that tags the user.
                  await channel.send(`Happy Birthday <@${member.user.id}> 🎂!`)
                } else if (channel && hasUnwantedRole) {
                  // Award 10 fate points
                  const currentFate = user.bank || 0
                  const updatedFate = currentFate + 10

                  // Update the user's fate points in the database
                  await User.update(
                    { bank: updatedFate },
                    { where: { user_id: user.user_id } }
                  )
                  await channel.send(
                    `Happy Birthday <@${member.user.id}> 🎂! 10 Fate Points have been added to your bank.`
                  )
                }
              }
            }
          }
        } catch (error) {
          console.error('Error in birthday cron job:', error)
        }
      },
      {
        timezone: 'America/Los_Angeles',
      }
    )
  })
}
