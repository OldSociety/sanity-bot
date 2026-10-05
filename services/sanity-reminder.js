const wording = {
  fading: 'Your sanity is fading... but don’t worry, community helps keep the darkness at bay. Why not leave a post in the server? Fight the darkness together!',
  fraying: 'Your sanity is fraying... but community helps keep the darkness at bay. Why not leave a post in the server? Fight the darkness together!',
  waning: 'Your sanity is waning... but you don’t have to face the darkness alone. Why not leave a post in the server? Fight the darkness together!',
  lost: 'The darkness has taken hold... but your community is still here. Why not leave a post in the server? Fight the darkness together!',
}
async function nudge(interaction, User, service = require('./sanity').runtime(User)) {
  if (!service || require('./sanity').selected().reminderDelivery !== 'private-interaction' ||
    interaction.guildId !== process.env.GUILDID || !interaction.user || interaction.user.bot) return null
  if (interaction.commandName === 'profile' && ['birthday', 'level'].includes(interaction.options.getSubcommand?.(false))) return null
  if (!interaction.replied && !interaction.deferred) return null
  const member = interaction.member
  if (require('./member-policy').excludedMember(member || { user: interaction.user })) return null
  const reminder = await service.claimReminder(interaction.guildId, interaction.user.id)
  if (!reminder) return null
  await interaction.followUp({ ephemeral: true, allowedMentions: { parse: [] },
    embeds: [{ title: reminder.special ? 'Sanity — Lost' : `Sanity — ${reminder.band[0].toUpperCase() + reminder.band.slice(1)}`,
      description: `${wording[reminder.band]}\n\n**Sanity: ${reminder.balance}/100**`, color: reminder.balance < 25 ? 0x9b283d : 0x527f91 }] })
  return reminder
}
async function nudgeChat(message, service) {
  if (!service || require('./sanity').selected().reminderDelivery !== 'private-chat-dm' ||
    message.guild?.id !== process.env.GUILDID || !message.author || message.author.bot) return null
  const reminder = await service.claimReminder(message.guild.id, message.author.id, new Date(message.createdTimestamp))
  if (!reminder) return null
  await message.author.send({ allowedMentions: { parse: [] }, embeds: [{
    title: `Sanity — ${reminder.band[0].toUpperCase() + reminder.band.slice(1)}`,
    description: `${wording[reminder.band]}\n\n**Sanity: ${reminder.balance}/100**`,
    color: reminder.balance < 25 ? 0x9b283d : 0x527f91,
  }] })
  return reminder
}
module.exports = { nudge, nudgeChat, wording }
