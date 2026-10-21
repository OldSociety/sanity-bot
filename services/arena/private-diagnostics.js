const fs = require('node:fs/promises')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { PermissionFlagsBits } = require('discord.js')
const { formatDiagnostic, playerLabel, utf8Text } = require('./diagnostic-format')

function diagnosticText(report) {
  return formatDiagnostic(report)
}
async function persistReport(report, text) {
  const name = `arena-diagnostic-${createHash('sha256').update(text).digest('hex').slice(0,24)}.txt`
  const file = path.resolve(__dirname, '../../artifacts/arena-private-diagnostics-production', name)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, utf8Text(text))
  await fs.writeFile(file.replace(/\.txt$/, '-details.json'), JSON.stringify(report, null, 2), 'utf8')
  return { file, name }
}
function createPrivateDiagnosticReporter({
  environment = () => process.env.NODE_ENV,
  settings = require('../../config/arena/arena-private-diagnostics-production.json'),
  persist = persistReport,
} = {}) {
  return async function send(report, client) {
    if (environment() !== 'production' || !settings.enabled) return false
    if (report.guildId !== settings.guildId) throw Error('Diagnostic source guild differs')
    if (settings.sourceChannelId && report.channelId !== settings.sourceChannelId) return false
    if (settings.excludedUserIds?.includes(report.ownerId)) return false
    if (!report.ownerUsername && client.users?.fetch) {
      const user = await client.users.fetch(report.ownerId).catch(() => null)
      if (user) report = { ...report, ownerUsername: user.username, ownerDisplayName: user.globalName || user.username }
    }
    const text = diagnosticText(report)
    // Keep a local full copy even if Discord delivery fails. No public fallback.
    const saved = await persist(report, text)
    const channel = await client.channels.fetch(settings.channelId)
    if (!channel?.isTextBased?.() || typeof channel.send !== 'function' ||
        channel.guildId !== settings.guildId) throw Error('Invalid private diagnostic channel')
    const everyone = channel.permissionsFor(channel.guild.roles.everyone)
    if (!everyone || everyone.has(PermissionFlagsBits.ViewChannel))
      throw Error('Diagnostic channel is not private to everyone')
    const own = channel.permissionsFor(client.user)
    if (!own?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles]))
      throw Error('Missing private diagnostic send/file permissions')
    await channel.send({
      content: `${require('./versioning').label(report.arenaVersion || report.battle.arenaVersion)} | ${playerLabel(report)} | ${report.battle.status.toUpperCase()} in ${report.battle.tick} turns | ${report.battle.player.name} vs ${report.battle.enemy.name}`,
      files: [{ attachment: utf8Text(text), name: saved.name }],
      allowedMentions: { parse: [] },
    })
    return true
  }
}
module.exports = { createPrivateDiagnosticReporter, diagnosticText }
