const test = require('node:test')
const assert = require('node:assert/strict')
const { createBadgeAccess, configureEmojiAccess, validateSettings } = require('../services/badge-access')
const { PermissionFlagsBits } = require('discord.js')
const roleId = '111111111111111111', botId = '222222222222222222', guildId = '333333333333333333'
const settings = () => ({ enabled: true, roles: { had: null, hfm: null, mrq: null, max: null, nik: null, qam: null, sel: roleId } })
function fixture() {
  const held = new Set(), writes = [], restrictions = []
  const role = { id: roleId, managed: false, hoist: false, mentionable: false, permissions: { bitfield: 0n } }
  const member = { user: { bot: false }, roles: { cache: { has: id => held.has(id) },
    add: async id => { held.add(id); writes.push(['add', id]) }, remove: async id => { held.delete(id); writes.push(['remove', id]) } } }
  const bot = { permissions: { has: permission => [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageGuildExpressions].includes(permission) },
    roles: { highest: { comparePositionTo: () => 1 }, botRole: { id: botId, managed: true } } }
  const emoji = { id: '444444444444444444', name: 'spooky_selene_badge', managed: false, available: true,
    edit: async options => restrictions.push(options.roles) }
  const guild = { id: guildId, roles: { fetch: async () => new Map([[roleId, role]]) },
    members: { fetch: async () => member, fetchMe: async () => bot }, emojis: { fetch: async () => new Map([[emoji.id, emoji]]) }, channels: { fetch: async () => new Map() } }
  let owned = ['spooky-2026:sel']
  const service = { owned: async () => owned }
  const access = createBadgeAccess({ service, getGuild: async () => guild, guildId, settings: settings() })
  return { guild, role, member, bot, emoji, access, held, writes, restrictions, setOwned: value => { owned = value } }
}

test('explicit bot-only renderer role permits badge embeds when a managed bot role is absent', async () => {
  const f = fixture()
  f.bot.roles.botRole = null
  const renderer = { id: botId, managed: false, hoist: false, mentionable: false, permissions: { bitfield: 0n } }
  f.bot.roles.cache = { has: id => id === botId }
  f.guild.roles.fetch = async () => new Map([[roleId, f.role], [botId, renderer]])
  const config = { ...settings(), botDisplayRoleId: botId }
  await configureEmojiAccess(f.guild, config)
  assert.deepEqual(f.restrictions, [[roleId, botId]])
  renderer.permissions.bitfield = 8n
  await assert.rejects(() => configureEmojiAccess(f.guild, config), /display role/)
  assert.equal(f.restrictions.length, 1)
})
test('disabled projection never fetches Discord or ownership; config requires separate exact role IDs', async () => {
  const disabled = createBadgeAccess({ guildId, getGuild: async () => { throw new Error('network forbidden') }, service: { owned: async () => { throw new Error('DB forbidden') } } })
  assert.deepEqual(await disabled.reconcileUser(guildId, 'alice'), { disabled: true })
  await assert.rejects(() => disabled.reconcileUser('other', 'alice'), /guild mismatch/)
  assert.throws(() => validateSettings({ ...settings(), roles: { ...settings().roles, had: roleId } }), /distinct/)
  assert.throws(() => validateSettings({ enabled: true, roles: {} }), /role IDs/)
})
test('ownership grants exact badge role, replay is no-op, missing ownership removes only its configured role', async () => {
  const f = fixture()
  await Promise.all([f.access.reconcileUser(guildId, 'alice'), f.access.reconcileUser(guildId, 'alice')])
  assert.deepEqual(f.writes, [['add', roleId]])
  f.setOwned([])
  await f.access.reconcileUser(guildId, 'alice')
  assert.deepEqual(f.writes.at(-1), ['remove', roleId])
})
test('role failure is retryable from durable ownership; dangerous roles and permission failures never write', async () => {
  const f = fixture()
  const add = f.member.roles.add
  f.member.roles.add = async () => { throw new Error('network failed') }
  await assert.rejects(() => f.access.reconcileUser(guildId, 'alice'), /network failed/)
  f.member.roles.add = add
  await f.access.reconcileUser(guildId, 'alice')
  f.held.clear(); f.writes.length = 0; f.role.permissions.bitfield = PermissionFlagsBits.Administrator
  await assert.rejects(() => f.access.reconcileUser(guildId, 'alice'), /cosmetic/)
  assert.deepEqual(f.writes, [])
  f.role.permissions.bitfield = 0n; f.guild.channels.fetch = async () => new Map([['private', { permissionOverwrites: { cache: new Map([[roleId, {}]]) } }]])
  await assert.rejects(() => f.access.reconcileUser(guildId, 'alice'), /channel overwrites/)
  f.guild.channels.fetch = async () => new Map()
  f.role.permissions.bitfield = 0n; f.bot.permissions.has = () => false
  await assert.rejects(() => f.access.reconcileUser(guildId, 'alice'), /ManageRoles/)
})
test('explicit emoji setup allows only collector and managed bot role; invalid setup makes no edit', async () => {
  const f = fixture()
  await configureEmojiAccess(f.guild, settings())
  assert.deepEqual(f.restrictions, [[roleId, botId]])
  f.restrictions.length = 0; f.emoji.managed = true
  await assert.rejects(() => configureEmojiAccess(f.guild, settings()), /unmanaged/)
  assert.deepEqual(f.restrictions, [])
  await assert.rejects(() => configureEmojiAccess(f.guild, { ...settings(), enabled: false }), /enabled/)
})
