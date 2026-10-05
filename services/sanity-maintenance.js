function start(client, User) {
  const service = require('./sanity').runtime(User)
  if (!service) return () => {}
  let pending
  const tick = () => {
    if (pending) return pending
    pending = (async () => {
      const accounts = await service.models.Account.findAll({ where: { guildId: process.env.GUILDID } })
      for (const account of accounts) await service.view(account.guildId, account.userId)
    })().catch(error => console.error('Sanity daily maintenance failed:', error.message)).finally(() => { pending = null })
    return pending
  }
  void tick()
  const task = require('node-cron').schedule('5 0 * * *', tick, { timezone: 'America/Los_Angeles' })
  return async () => { task.stop(); await pending }
}
module.exports = { start }
