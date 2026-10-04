// Read-only Discord inspection. Never open storage or change roles/channels.
async function inspect() {
  const { REST, Routes, PermissionFlagsBits } = require('discord.js')
  const { loadDiscordEnvironment } = require('../config/runtime')
  const result = []
  for (const environment of ['development', 'production']) {
    const selected = {}, runtime = loadDiscordEnvironment(environment, { target: selected })
    const rest = new REST().setToken(selected.TOKEN)
    const [roles, channels] = await Promise.all([rest.get(Routes.guildRoles(runtime.guildId)), rest.get(Routes.guildChannels(runtime.guildId))])
    const view = PermissionFlagsBits.ViewChannel
    result.push({ environment, guildId: runtime.guildId,
      configured: Object.fromEntries(Object.entries(selected).filter(([key]) => /(?:ROLEID|CHANNELID)$/.test(key))),
      roles: roles.map(role => ({ id: role.id, name: role.name, everyoneView: role.id === runtime.guildId ? Boolean(BigInt(role.permissions) & view) : undefined })),
      channels: channels.map(channel => ({ id: channel.id, name: channel.name, type: channel.type, parentId: channel.parent_id,
        viewOverrides: (channel.permission_overwrites || []).filter(overwrite => overwrite.type === 0 && ((BigInt(overwrite.allow) | BigInt(overwrite.deny)) & view))
          .map(overwrite => ({ id: overwrite.id, type: overwrite.type, allow: Boolean(BigInt(overwrite.allow) & view), deny: Boolean(BigInt(overwrite.deny) & view) })) })) })
  }
  return result
}
if (require.main === module) inspect().then(result => {
  require('node:fs').writeFileSync(require('node:path').join(__dirname, '../artifacts/community-baseline-inspection.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result.map(guild => ({ environment: guild.environment, guildId: guild.guildId,
    roleCount: guild.roles.length, channelCount: guild.channels.length })), null, 2))
}).catch(error => { console.error(error.message); process.exitCode = 1 })
module.exports = { inspect }
