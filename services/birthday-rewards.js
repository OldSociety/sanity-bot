const { birthday, notifyBirthday } = require('./wallet-operation')
const { excludedMember } = require('./member-policy')
function pacificDate(value) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(value))
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]))
}

async function runBirthdays({ client, User, profileNotification = null, now = new Date(),
  guildId = process.env.GUILDID, roleId = process.env.UNWANTEDROLEID,
  channelId = process.env.FUCKERYCHANNELID || (process.env.NODE_ENV === 'development' ? process.env.HELLBOUNDCHANNELID : undefined), logger = console }) {
  const today = pacificDate(now), guild = client.guilds.cache.get(guildId)
  const channel = client.channels.cache.get(channelId)
  if (!guild || !channel || (channel.guildId && channel.guildId !== guildId)) return
  for (const user of await User.findAll()) {
    try {
      if (!user.birthday) continue
      const date = pacificDate(user.birthday)
      if (date.month !== today.month || date.day !== today.day) continue
      const member = await guild.members.fetch({ user: user.user_id, force: true })
      if (!member || member.user.bot || excludedMember(member) || !member.roles.cache.has(roleId)) continue
      const result = await birthday(User, { guildId, userId: user.user_id, year: today.year })
      await notifyBirthday(User, result.operationId, async () => {
        let card = null
        if (profileNotification) {
          try { card = await profileNotification({ guild, member, user: result.receipt.after, before: result.receipt.before, occasion: 'birthday' }) }
          catch (error) { logger.error('Birthday card unavailable:', error.message) }
        }
        return channel.send(card || `Happy Birthday <@${member.user.id}> 🎂! A bonus of ${result.receipt.credited} Fate Points has been added to your bank (100-point cap).`)
      })
    } catch (error) { logger.error(`Birthday reward unavailable for ${user.user_id}:`, error.message) }
  }
}
module.exports = { runBirthdays, pacificDate }
