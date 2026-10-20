const fs = require('node:fs/promises')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { PermissionFlagsBits } = require('discord.js')
const { recapText, reportLines } = require('./battle-report')

function diagnosticText(report) {
  // Lazy load avoids a cycle through the public presentation helpers.
  const { actionLines } = require('./interface')
  return [
    'PRIVATE ARENA DIAGNOSTIC · PRODUCTION',
    `Session: ${report.sessionId} · Fight: ${report.fightNumber}`,
    `Player ID: ${report.ownerId}`,
    `Source: https://discord.com/channels/${report.guildId}/${report.channelId}/${report.messageId}`,
    '',
    recapText(report.battle, reportLines(report.battle.history, actionLines, {
      diagnostic: true, timings: report.roundTimings,
    }), { diagnostic: true, interactions: report.interactionTimings, completedDelivery: true }),
    '',
    'FULL TIMING DETAILS',
    JSON.stringify(report.interactionTimings, null, 2),
  ].join('\n')
}
async function persistReport(report, text) {
  const name = `arena-diagnostic-${createHash('sha256').update(text).digest('hex').slice(0,24)}.txt`
  const file = path.resolve(__dirname, '../../artifacts/arena-private-diagnostics-production', name)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, text, 'utf8')
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
      content: `Arena · ${report.battle.player.name} vs ${report.battle.enemy.name} · ${report.battle.status.toUpperCase()} · ${report.battle.tick} turns`,
      files: [{ attachment: Buffer.from(text), name: saved.name }],
      allowedMentions: { parse: [] },
    })
    return true
  }
}
module.exports = { createPrivateDiagnosticReporter, diagnosticText }
