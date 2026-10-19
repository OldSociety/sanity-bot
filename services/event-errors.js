async function reportEventError(eventName, error, args, logger = console) {
  // Discord errors may carry request bodies or webhook URLs; never log those.
  logger.error(
    'Bot event failed:',
    eventName,
    error.code || error.name || 'Error'
  )
  const interaction = args[0]
  if (eventName !== 'interactionCreate' || !interaction?.isRepliable?.()) return
  const payload = {
    content:
      'The action could not complete. Check the current message before retrying; completed actions remain saved.',
    ephemeral: true,
    allowedMentions: { parse: [] },
  }
  try {
    if (interaction.deferred || interaction.replied)
      await interaction.followUp(payload)
    else await interaction.reply(payload)
  } catch {
    /* A deleted message or expired interaction cannot be acknowledged. */
  }
}
function runEvent(event, args, logger = console) {
  return Promise.resolve()
    .then(() => event.execute(...args))
    .catch((error) => reportEventError(event.name, error, args, logger))
}
module.exports = { reportEventError, runEvent }
