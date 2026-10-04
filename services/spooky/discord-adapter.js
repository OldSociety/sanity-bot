const { PermissionFlagsBits } = require('discord.js')
function createDiscordAdapter(getGuild) {
  return {
    getRoleHolders: async (id, roleId) => {
      const guild = await getGuild(id), holders = []
      let after
      // Full gateway fetches compete with gameplay's directory and can wait
      // 120 seconds after opcode-8 throttling. REST pages are fresh role evidence
      // without issuing gateway membership requests or trusting a partial cache.
      for (;;) {
        const page = await guild.members.list({ limit: 1000, after, cache: false })
        for (const member of page.values()) if (member.roles.cache.has(roleId)) holders.push(member.id)
        if (page.size < 1000) return holders
        const next = [...page.keys()].at(-1)
        if (!next || next === after) throw new Error('Crown membership pagination did not advance')
        after = next
      }
    },
    checkRolePermission: async (id, userId, roleId) => require('./delivery').checkTitleRolePermission(await getGuild(id), userId, roleId),
    getMember: async (id, userId) => {
      const member = await (await getGuild(id)).members.fetch({ user: userId, force: true })
      return { nickname: member.nickname, roleIds: [...member.roles.cache.keys()] }
    },
    setRole: async (id, userId, roleId, present, guard) => {
      const guild = await getGuild(id)
      const [member, bot, roles] = await Promise.all([guild.members.fetch({ user: userId, force: true }), guild.members.fetchMe({ force: true }), guild.roles.fetch()])
      if (guard && !await guard.isCurrent()) return false
      if (member.roles.cache.has(roleId) === present) return true
      const role = roles.get(roleId)
      // Unlike nickname edits, role grants can target the owner or a higher-ranked member.
      if (!role || role.managed || role.id === guild.id || !bot.permissions.has(PermissionFlagsBits.ManageRoles) ||
        bot.roles.highest.comparePositionTo(role) <= 0) throw new Error('Role permissions/hierarchy unavailable')
      return present ? member.roles.add(roleId) : member.roles.remove(roleId)
    },
    setNickname: async (id, userId, nickname, guard) => {
      const guild = await getGuild(id)
      const [member, bot] = await Promise.all([guild.members.fetch({ user: userId, force: true }), guild.members.fetchMe({ force: true })])
      if (guard && !await guard.isCurrent()) return false
      if (member.nickname === nickname) return true
      if (guard && member.nickname !== guard.expectedNickname) { const error = new Error('Independent nickname change'); error.code = 'NICKNAME_CONFLICT'; throw error }
      if (!member.manageable || !bot.permissions.has(PermissionFlagsBits.ManageNicknames)) throw new Error('Nickname permissions/hierarchy unavailable')
      return member.setNickname(nickname)
    },
  }
}
module.exports = { createDiscordAdapter }
