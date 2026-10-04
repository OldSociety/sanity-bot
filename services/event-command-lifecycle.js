const { commandEnabled } = require('./command-environment')
async function reconcile({ client, entries, environment, guildId, clientId, now = Date.now() }) {
  if (!['development', 'production'].includes(environment) || !guildId || !clientId || client.application?.id !== clientId) throw new Error('Event command application/guild must be pinned')
  const inactive = new Set(entries.filter(entry => entry.command.eventKey && !commandEnabled(entry.command, environment, now)).map(entry => entry.name))
  if (!inactive.size) return []
  const guild = await client.guilds.fetch(guildId)
  if (guild.id !== guildId) throw new Error('Unexpected command guild')
  const commands = await guild.commands.fetch(), removed = []
  for (const command of commands.values()) {
    if (!inactive.has(command.name)) continue
    if (command.applicationId !== clientId || command.guildId !== guildId || command.type !== 1) throw new Error('Unexpected event command ownership')
    // Targeted deletes preserve every unrelated or server-only command.
    await guild.commands.delete(command.id)
    removed.push(command.name)
    client.commands.delete(command.name)
  }
  // Also retire already absent handlers, including when a deletion was retried.
  for (const name of inactive) client.commands.delete(name)
  return removed
}
function start(client, entries, { environment = process.env.NODE_ENV, guildId = process.env.GUILDID, clientId = process.env.CLIENTID } = {}) {
  let pending
  const retired = new Set()
  const tick = () => {
    if (pending) return pending
    const now = Date.now()
    const remaining = entries.filter(entry => !retired.has(entry.name))
    pending = reconcile({ client, entries: remaining, environment, guildId, clientId, now }).then(() => {
      for (const entry of remaining) if (entry.command.eventKey && !commandEnabled(entry.command, environment, now)) retired.add(entry.name)
    }).catch(error => console.error('Event command cleanup failed:', error.message)).finally(() => { pending = null })
    return pending
  }
  void tick()
  const timer = setInterval(tick, 60000)
  timer.unref()
  return () => clearInterval(timer)
}
module.exports = { reconcile, start }
