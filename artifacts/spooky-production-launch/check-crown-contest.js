const fs = require('node:fs'), path = require('node:path')
const environment = process.argv[2]
if (!['development', 'production'].includes(environment)) throw new Error('Explicit environment required')
const runtime = require('../../config/runtime').loadDiscordEnvironment(environment)
const { REST, Routes, PermissionFlagsBits } = require('discord.js')
const rest = new REST().setToken(process.env.TOKEN)
;(async () => {
  const roleId = process.env.SWEETTOOTHID || process.env.SWEETTOOTHROLEID
  const [roles, bot] = await Promise.all([rest.get(Routes.guildRoles(runtime.guildId)), rest.get(Routes.guildMember(runtime.guildId, runtime.clientId))])
  let after, holders = [], count = 0
  do {
    const page = await rest.get(Routes.guildMembers(runtime.guildId), { query: new URLSearchParams({ limit: '1000', ...(after ? { after } : {}) }) })
    holders.push(...page.filter(member => member.roles.includes(roleId)))
    count += page.length; after = page.length === 1000 ? page.at(-1).user.id : null
  } while (after)
  const role = roles.find(row => row.id === roleId), botRoles = roles.filter(row => bot.roles.includes(row.id)),
    permissions = botRoles.concat(roles.filter(row => row.id === runtime.guildId)).reduce((bits, row) => bits | BigInt(row.permissions), 0n)
  const manageable = Boolean(role && !role.managed && role.id !== runtime.guildId &&
    botRoles.some(row => row.position > role.position) && permissions & (PermissionFlagsBits.ManageRoles | PermissionFlagsBits.Administrator))
  const Sqlite = require('sqlite3')
  const sqlite = await new Promise((resolve, reject) => {
    const opened = new Sqlite.Database(runtime.database.storage, Sqlite.OPEN_READONLY, error => error ? reject(error) : resolve(opened))
  })
  const query = (sql, ...parameters) => new Promise((resolve, reject) => sqlite.get(sql, parameters, (error, row) => error ? reject(error) : resolve(row)))
  let evidence
  try {
    const ownership = await query('SELECT metadata FROM SpookyLedger WHERE eventId=? AND guildId=? AND resource=? ORDER BY id DESC LIMIT 1', 'spooky-2026', runtime.guildId, 'crown_holder')
    const activeReversals = (await query("SELECT COUNT(*) AS n FROM SpookyEffects e JOIN SpookyParticipants p ON p.id=e.participantId WHERE p.eventId=? AND p.guildId=? AND e.effectType='reversed_nickname'", 'spooky-2026', runtime.guildId)).n
    const state = ownership ? JSON.parse(ownership.metadata) : null
    evidence = { ownershipInitialized: Boolean(ownership), logicalHolderMatchesRole: state ? (state.holderId === null ? holders.length === 0 : holders.some(member => member.user.id === state.holderId)) : null, activeReversalRows: activeReversals }
  } finally { await new Promise((resolve, reject) => sqlite.close(error => error ? reject(error) : resolve())) }
  const report = { at: new Date().toISOString(), environment, membersChecked: count, crownRoleManageable: manageable,
    actualCrownHolders: holders.length, ...evidence, readOnly: true }
  fs.writeFileSync(path.join(__dirname, `crown-contest-${environment}-readiness.json`), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
  if (!manageable) process.exitCode = 1
})().catch(error => { console.error(String(error.message).replaceAll(process.env.TOKEN, '[redacted]').slice(0, 250)); process.exitCode = 1 })
