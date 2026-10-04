// Explicit selected-environment emoji/role setup; no gateway or database access.
// Runtime awards only project membership in this dedicated zero-permission role.
const fs = require('node:fs'), path = require('node:path')
const root = path.resolve(__dirname, '..')
async function main(args) {
  if (args.length !== 5 || args[0] !== '--environment' || !['development','production'].includes(args[1]) || args[2] !== '--character' || !['sel','mrq'].includes(args[3]) || !['--inspect','--setup'].includes(args[4])) throw new Error('Use --environment development|production --character sel|mrq --inspect|--setup')
  const environment = args[1], characterId = args[3], mode = args[4], characterName = characterId === 'sel' ? 'Selene' : 'Marq'
  const emojiName = 'spooky_' + (characterId === 'sel' ? 'selene' : 'marq') + '_badge'
  process.env.NODE_ENV = environment
  const runtime = require('../config/runtime').loadDiscordEnvironment(environment)
  const { REST, Routes, PermissionFlagsBits: P } = require('discord.js')
  const rest = new REST().setToken(process.env.TOKEN)
  const identity = await rest.get(Routes.user('@me'))
  if (identity.id !== runtime.clientId) throw new Error('Development token/application mismatch')
  const [guild, roles, member, channels, emojis] = await Promise.all([
    rest.get(Routes.guild(runtime.guildId)), rest.get(Routes.guildRoles(runtime.guildId)),
    rest.get(Routes.guildMember(runtime.guildId, identity.id)), rest.get(Routes.guildChannels(runtime.guildId)),
    rest.get(Routes.guildEmojis(runtime.guildId)),
  ])
  if (guild.id !== runtime.guildId) throw new Error('Development guild mismatch')
  const mine = roles.filter(role => member.roles.includes(role.id) || role.id === guild.id)
  const permissions = mine.reduce((n, role) => n | BigInt(role.permissions), 0n)
  const admin = Boolean(permissions & P.Administrator)
  const allowed = bit => admin || Boolean(permissions & bit)
  const highest = Math.max(...mine.map(role => role.position))
  let botRole = roles.find(role => role.managed && role.tags?.bot_id === identity.id)
  const accessPath = path.join(root, 'config/badge-access.json')
  const settings = JSON.parse(fs.readFileSync(accessPath, 'utf8'))
  const roleName = `Spooky 2026 - ${characterName} Collector`
  const matchingRoles = roles.filter(role => role.name === roleName)
  if (matchingRoles.length > 1) throw new Error('Duplicate Selene collector roles require inspection')
  let role = matchingRoles[0]
  function validateRole(value) {
    if (!value || value.id === guild.id || value.managed || value.hoist || value.mentionable || BigInt(value.permissions) !== 0n ||
      value.position >= highest || channels.some(channel => channel.permission_overwrites?.some(overwrite => overwrite.id === value.id))) {
      throw new Error('Selene access requires a dedicated editable zero-permission role without channel overwrites')
    }
  }
  if (role) validateRole(role)
  const rendererName = 'Spooky 2026 - Badge Renderer'
  const renderers = roles.filter(role => role.name === rendererName)
  if (renderers.length > 1) throw new Error('Duplicate badge renderer roles require inspection')
  if (renderers[0]) validateRole(renderers[0])
  const matches = emojis.filter(emoji => emoji.name?.toLowerCase() === emojiName)
  if (matches.length > 1 || matches.some(emoji => emoji.managed || emoji.available === false)) throw new Error('Selene emoji requires unique available unmanaged artwork')
  let emoji = matches[0]
  const report = { environment: runtime.env, guildId: guild.id, applicationId: identity.id,
    canManageRoles: allowed(P.ManageRoles), canManageExpressions: allowed(P.ManageGuildExpressions),
    collectorRoleId: role?.id || null, emojiId: emoji?.id || null, emojiName: emoji?.name || emojiName,
    managedBotRoleId: botRole?.id || null, ownedManagedRoles: mine.filter(role => role.managed).map(role => ({ id: role.id, name: role.name, tags: role.tags || null })),
    productionChanged: environment === 'production' && mode === '--setup', databaseOpened: false }
  if (mode === '--inspect') return report
  if (!report.canManageRoles || !report.canManageExpressions) throw new Error('Development bot requires ManageRoles and ManageGuildExpressions')
  const image = fs.readFileSync(path.join(root, 'assets/badges/SPOOKY_' + characterName.toUpperCase() + '_BADGE.png'))
  if (image.length > 256 * 1024 || image.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Invalid/oversized badge PNG')
  if (!botRole) {
    botRole = renderers[0] || await rest.post(Routes.guildRoles(guild.id), { body: { name: rendererName, permissions: '0', hoist: false, mentionable: false }, reason: 'Development bot-only badge rendering' })
    validateRole(botRole)
    // An existing shared role would accidentally unlock the emoji for others.
    let after
    do {
      const query = new URLSearchParams({ limit: '1000', ...(after ? { after } : {}) })
      const page = await rest.get(Routes.guildMembers(guild.id), { query })
      if (page.some(entry => entry.user.id !== identity.id && entry.roles.includes(botRole.id))) throw new Error('Renderer role belongs to another member; inspect before setup')
      after = page.length === 1000 ? page.at(-1).user.id : null
    } while (after)
    if (!member.roles.includes(botRole.id)) await rest.put(Routes.guildMemberRole(guild.id, identity.id, botRole.id), { reason: 'Allow bot to render earned badge emoji' })
    const fresh = await rest.get(Routes.guildMember(guild.id, identity.id))
    if (!fresh.roles.includes(botRole.id)) throw new Error('Bot renderer membership verification failed')
  }
  if (!role) role = await rest.post(Routes.guildRoles(guild.id), { body: { name: roleName, permissions: '0', hoist: false, mentionable: false }, reason: 'Development Selene badge access testing' })
  validateRole(role)
  const allowedRoles = [role.id, botRole.id]
  if (!emoji) emoji = await rest.post(Routes.guildEmojis(guild.id), { body: { name: emojiName, image: `data:image/png;base64,${image.toString('base64')}`, roles: allowedRoles }, reason: 'Development earned Selene badge emoji' })
  else emoji = await rest.patch(Routes.guildEmoji(guild.id, emoji.id), { body: { roles: allowedRoles }, reason: 'Restrict Selene badge to its collectors and bot' })
  const verified = await rest.get(Routes.guildEmoji(guild.id, emoji.id))
  if (verified.managed || verified.available === false || JSON.stringify([...(verified.roles || [])].sort()) !== JSON.stringify([...allowedRoles].sort())) throw new Error('Emoji restriction verification failed; configuration remains disabled')
  const developmentRoles = Object.fromEntries(Object.keys(settings.roles).map(key => [key,
    key === characterId ? role.id : settings[environment]?.guildId === guild.id ? settings[environment].roles?.[key] ?? null : null]))
  settings[environment] = { enabled: true, guildId: guild.id, roles: developmentRoles,
    botDisplayRoleId: botRole.managed ? null : botRole.id }
  fs.writeFileSync(accessPath, JSON.stringify(settings, null, 2) + '\n')
  const catalogPath = path.join(root, 'config/badges.json'), catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
  catalog.badges.find(badge => badge.characterId === characterId).emojiName = verified.name
  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n')
  return { ...report, configured: true, collectorRoleId: role.id, emojiId: emoji.id, emojiName: verified.name, allowedRoles }
}
if (require.main === module) main(process.argv.slice(2)).then(report => console.log(JSON.stringify(report, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1 })
module.exports = { main }
