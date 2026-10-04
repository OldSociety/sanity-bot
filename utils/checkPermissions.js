module.exports = async function checkPermissions(
  interaction,
  requiredRoleId = null
) {
  // All callers are achievement administration/secret views. Missing role
  // configuration must never turn these into public actions.
  if (!await require('./botAdmin').requireBotAdmin(interaction)) return false

  // Define common allowed channels
  const allowedChannelIds = [
    process.env.BOTTESTCHANNELID,
    process.env.MODERATORCHANNELID,
    process.env.HELLBOUNDCHANNELID,
  ]

  // Check if the command is used in one of the allowed channels
  if (!allowedChannelIds.includes(interaction.channel.id)) {
    await interaction.reply({
      content: `This command can only be used in  <#${allowedChannelIds[0]}>.`,
      ephemeral: true,
    })
    return false
  }

  return true
}
