function isBotAdmin(interaction, env = process.env) {
  return /^\d{17,20}$/.test(env.BOTADMINID || '') && Boolean(env.GUILDID) &&
    interaction.guildId === env.GUILDID && interaction.user?.id === env.BOTADMINID && !interaction.user?.bot
}
async function requireBotAdmin(interaction) {
  if (isBotAdmin(interaction)) return true
  const payload = { content: 'Only the configured bot administrator can use this action.', ephemeral: true, allowedMentions: { parse: [] } }
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload)
  else await interaction.reply(payload)
  return false
}
module.exports = { isBotAdmin, requireBotAdmin }
