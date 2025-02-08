const cron = require('node-cron')
const moment = require('moment') // Import moment.js to handle the date checks

module.exports = (client) => {
  client.once('ready', async () => {
    // Schedule the reminder to run every week on Thursday at 12:00 PM
    cron.schedule('0 12 * * 4', async () => {
      const currentDate = moment()
      const startDate = moment('2025-01-02') // Set the start date (e.g., 26th September 2024)

      // Check if it's an even week since start date
      const weeksSinceStart = currentDate.diff(startDate, 'weeks')
      const isEvenWeek = weeksSinceStart % 2 === 0

      try {
        const channel = client.channels.cache.get(process.env.MONDAYCHANNELID)
        if (channel && isEvenWeek) {
          await channel.send(
            `This is your ${
              isEvenWeek ? 'Thursday' : 'Saturday'
            } biweekly reminder to check in for this week's game by tomorrow. Please complete any tasks you might have unfinished and review your sheets before reaching out for this week's code.`
          )
        }
      } catch (err) {
        console.error('Error sending reminder:', err)
      }
    })

    // Schedule a second cron job that fires on alternating weeks (odd weeks)
    cron.schedule('0 12 * * 4', async () => {
      const currentDate = moment()
      const startDate = moment('2025-01-11')

      const weeksSinceStart = currentDate.diff(startDate, 'weeks')
      const isOddWeek = weeksSinceStart % 2 !== 0

      try {
        const channel = client.channels.cache.get(process.env.MONDAYCHANNELID)
        if (channel && isOddWeek) {
          ;`This is your ${
            isOddWeek ? 'Thursday' : 'Saturday'
          } biweekly reminder to check in for this week's game by tomorrow. Please complete any tasks you might have unfinished and review your sheets before reaching out for this week's code.`
        }
      } catch (err) {
        console.error('Error sending alternate reminder:', err)
      }
    })

    // Uncomment for testing - Fires every second
    // cron.schedule('* * * * * *', async () => {
    //   console.log('Test cron running every second...');
    // });
  })
}
