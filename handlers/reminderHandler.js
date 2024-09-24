const cron = require('node-cron')
const moment = require('moment') // Import moment.js to handle the date checks

module.exports = (client) => {
    // Schedule the reminder to run every Friday at 2:00 PM
    cron.schedule('0 14 * * 5', async () => {
      const currentDate = moment()
      const startDate = moment('2024-09-27') // Set the start date (e.g., 27th September 2024)

      // Check if today is Friday and it's been two weeks since the start date
      const weeksSinceStart = currentDate.diff(startDate, 'weeks')
      const isEverySecondWeek = weeksSinceStart % 2 === 0

      if (isEverySecondWeek) {
        try {
          const channel = client.channels.cache.get(process.env.MONDAYCHANNELID) // Replace with your channel ID
          if (channel) {
            await channel.send('This is your bi-weekly reminder!')
          }
        } catch (err) {
          console.error('Error sending reminder:', err)
        }
      }
    })

//   // Test cron job that runs every minute but only starts on 9/24/2024
//   cron.schedule('* * * * *', async () => {
//     const currentDate = moment()
//     const startDate = moment('2024-09-24') // Set the start date to today (9/24/2024)

//     // Only proceed if the current date is on or after the start date
//     if (currentDate.isSameOrAfter(startDate, 'day')) {
//       try {
//         const channel = client.channels.cache.get(process.env.MONDAYCHANNELID) // Replace with your channel ID
//         if (channel) {
//           await channel.send(
//             'This is a test message for your weekly reminders..'
//           )
//         }
//       } catch (err) {
//         console.error('Error sending test message:', err)
//       }
//     }
//   })
}
