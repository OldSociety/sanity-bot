module.exports = async function checkPermissions(
  interaction,
  requiredRoleId = null
) {
  const member = interaction.member

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

  // If requiredRoleId is provided, check if the user has the required role or is an admin
  const isAdmin = member.roles.cache.has(process.env.ADMINROLEID) // Adjust for admin role
  if (requiredRoleId && !member.roles.cache.has(requiredRoleId) && !isAdmin) {
    await interaction.reply({
      content: 'You do not have permission to use this command.',
      ephemeral: true,
    })
    return false
  }

  return true
}
