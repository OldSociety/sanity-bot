const cron = require('node-cron')
const moment = require('moment') // Import moment.js to handle the date checks

module.exports = (client) => {
    // Schedule the reminder to run every two weeks 
    cron.schedule('0 14 * * 5', async () => {
      const currentDate = moment()
      const startDate = moment('2024-09-26') // Set the start date (e.g., 26th September 2024)

      // Check if today is Thursday and it's been two weeks since the start date
      const weeksSinceStart = currentDate.diff(startDate, 'weeks')
      const isEverySecondWeek = weeksSinceStart % 2 === 0

      if (isEverySecondWeek) {
        try {
          const channel = client.channels.cache.get(process.env.MONDAYCHANNELID) 
          if (channel) {
            await channel.send('This is your bi-weekly reminder to check in for this weeks game. Please complete any tasks you might have unfinished and review your sheets before reaching out for this weeks code.')
          }
        } catch (err) {
          console.error('Error sending reminder:', err)
        }
      }
    })
  }

    module.exports = (client) => {
      // Schedule the reminder to run every two weeks 
      cron.schedule('0 14 * * 5', async () => {
        const currentDate = moment()
        const startDate = moment('2024-12-28')
  
        const weeksSinceStart = currentDate.diff(startDate, 'weeks')
        const isEverySecondWeek = weeksSinceStart % 2 === 0
  
        if (isEverySecondWeek) {
          try {
            const channel = client.channels.cache.get(process.env.WEDNESDAYCHANNELID) 
            if (channel) {
              await channel.send('This is your bi-weekly reminder to check in for this weeks game. Please complete any tasks you might have unfinished and review your sheets before reaching out for this weeks code.')
            }
          } catch (err) {
            console.error('Error sending reminder:', err)
          }
        }
      })
    }
