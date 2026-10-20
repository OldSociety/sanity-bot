function start(client, User) {
  const service = require('./sanity').runtime(User)
  if (!service) return () => {}
  let pending
  const tick = () => {
    if (pending) return pending
    pending = (async () => {
      const accounts = await service.models.Account.findAll({ where: { guildId: process.env.GUILDID } })
      for (const account of accounts) {
        // A fresh membership check is required before settling any daily decay.
        try {
          const guild = await client.guilds.fetch(account.guildId)
          const member = await guild.members.fetch({ user: account.userId, force: true })
          const membership = require('./sanity-membership')
          await service.syncMember({ guildId: account.guildId, userId: account.userId,
            ...membership.identity(member.user, member), eligible: membership.hasUnwantedRole(member) })
        } catch (error) {
          // Missing members and unavailable Discord data must never cause decay.
          if ([10007, 10013].includes(error.code)) await service.syncMember({ guildId: account.guildId, userId: account.userId, eligible: false })
          console.error('Sanity membership check unavailable:', error.code || error.name)
        }
      }
    })().catch(error => console.error('Sanity daily maintenance failed:', error.message)).finally(() => { pending = null })
    return pending
  }
  void tick()
  const task = require('node-cron').schedule('5 0 * * *', tick, { timezone: 'America/Los_Angeles' })
  return async () => { task.stop(); await pending }
}
module.exports = { start }
