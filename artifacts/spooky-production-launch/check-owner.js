const path = require('path'), fs = require('fs')
const environment = process.argv[2]
if (!['development','production'].includes(environment)) throw Error('Explicit environment required')
process.env.NODE_ENV = environment
const runtime = require('../../config/runtime').loadDiscordEnvironment(environment)
const { REST, Routes, PermissionFlagsBits } = require('discord.js')
const rest = new REST().setToken(process.env.TOKEN)
;(async () => {
  const [member, guild, roles] = await Promise.all([rest.get(Routes.guildMember(runtime.guildId, process.env.BOTADMINID)), rest.get(Routes.guild(runtime.guildId)), rest.get(Routes.guildRoles(runtime.guildId))])
  const bits = roles.filter(r => member.roles.includes(r.id) || r.id === runtime.guildId).reduce((n,r) => n | BigInt(r.permissions), 0n)
  const report = { environment, botAdminConfigured: /^\d{17,20}$/.test(process.env.BOTADMINID), humanMember: !member.user.bot,
    canSeeZeroDefaultCommands: guild.owner_id === member.user.id || Boolean(bits & PermissionFlagsBits.Administrator), databaseOpened: false }
  fs.writeFileSync(path.join(__dirname, environment + '-botadmin.json'), JSON.stringify(report,null,2)); console.log(JSON.stringify(report))
  if (!report.humanMember || !report.botAdminConfigured || !report.canSeeZeroDefaultCommands) throw Error('Owner command visibility requires integration permission override')
})().catch(error => { console.error(error.message); process.exitCode = 1 })
