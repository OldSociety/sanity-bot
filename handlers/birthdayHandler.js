const cron = require('node-cron')
const { User } = require('../Models/model')

module.exports = client => {
  // Production keeps text greetings; profile/Sanity modules stay development-only.
  const profileNotification = process.env.NODE_ENV === 'development'
    ? require('../services/profile-notification').createProfileNotification({ User }) : null
  client.once('ready', () => {
    cron.schedule('0 6 * * *', () => require('../services/birthday-rewards').runBirthdays({
      client, User, profileNotification,
    }).catch(error => console.error('Birthday job unavailable:', error.message)), { timezone: 'America/Los_Angeles' })
  })
}