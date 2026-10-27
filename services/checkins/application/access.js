function createAccess({ config, environment, botAdminId }) {
  function settings() {
    const all = config(), env = environment(), scope = all[env]
    if (!scope || (env === 'development' ? !scope.testCommandEnabled : env !== 'production' || !scope.liveEnabled)) throw Error('Check-ins are disabled.')
    if (!scope.guildId || !scope.reviewGuildId || !scope.reviewChannelId) throw Error('The check-in destination is not configured.')
    return all
  }
  const scope = () => settings()[environment()]
  function validateRecord(record) {
    const c = scope()
    if (record && (record.guildId !== c.guildId || record.reviewGuildId !== c.reviewGuildId || record.reviewChannelId !== c.reviewChannelId || Boolean(record.isTest) !== (environment() === 'development'))) throw Error('This check-in belongs to an older configuration.')
  }
  async function authorize(client, record, actor, purpose = 'player') {
    validateRecord(record)
    const c = scope()
    const guild = await client.guilds.fetch({ guild: c.guildId, force: true })
    if (environment() === 'production' && purpose === 'delivery' && record?.submittedAt) return guild
    const member = await guild.members.fetch({ user: actor, force: true })
    if (environment() === 'development') {
      if (actor !== guild.ownerId || actor !== botAdminId()) throw Error('Only the configured development server owner may use this test.')
      return guild
    }
    if (purpose === 'review') {
      const reviewer = c.reviewerUserIds?.includes(actor) || c.reviewerRoleIds?.some(id => member.roles.cache.has(id))
      if (!reviewer || member.user?.bot || actor === record?.owner) throw Error('You are not authorized to review this check-in.')
    } else if (!(purpose === 'delivery' && record?.submittedAt)) {
      const role = record && c.playerRoleIds?.[record.campaign]
      const serverOwner = actor === guild.ownerId && !record?.isNotice
      if (member.user?.bot || (record ? !role || role !== record.playerRoleId || (!serverOwner && !member.roles.cache.has(role))
        : !serverOwner && !Object.values(c.playerRoleIds || {}).some(id => member.roles.cache.has(id)))) throw Error('Only the server owner or MondaysinHell/WednesdaysinHell players may check in.')
    }
    return guild
  }
  async function command(interaction) {
    const c = scope()
    const channels = require('../../command-channels').withBotTests([c.commandChannelId], { guildId: c.guildId, environment: environment() })
    if (interaction.guildId !== c.guildId || !channels.includes(interaction.channelId)) throw Error(`Use /check-in in ${channels.map(id => `<#${id}>`).join(' or ')}.`)
    if (!interaction.deferred) await interaction.deferReply({ ephemeral: true })
    const guild = await authorize(interaction.client, null, interaction.user.id)
    return guild
  }
  return { settings, scope, validateRecord, authorize, command }
}
module.exports = { createAccess }
