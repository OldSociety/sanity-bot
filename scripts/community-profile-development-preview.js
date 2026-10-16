// Read-only development preview: Discord GETs and SQLite OPEN_READONLY.
// No Discord messages, awards, migrations or registry changes.
const fs = require('node:fs/promises')
const path = require('node:path')
async function main() {
  const runtime = require('../config/runtime').loadDiscordEnvironment()
  if (runtime.env !== 'development') throw new Error('This preview is development-only')
  const { REST, Routes } = require('discord.js')
  const rest = new REST().setToken(process.env.TOKEN)
  const guild = await rest.get(Routes.guild(runtime.guildId))
  const members = new Map()
  let after
  do {
    const query = new URLSearchParams({ limit: '1000', ...(after ? { after } : {}) })
    const page = await rest.get(Routes.guildMembers(runtime.guildId), { query })
    for (const member of page) members.set(member.user.id, {
      id: member.user.id, user: member.user, roles: { cache: new Map(member.roles.map(id => [id, { id }])) },
    })
    after = page.length === 1000 ? page.at(-1).user.id : null
  } while (after)
  const emojis = new Map((await rest.get(Routes.guildEmojis(runtime.guildId))).map(emoji => [emoji.id, emoji]))
  const { Sequelize } = require('sequelize')
  const db = new Sequelize({ ...runtime.database, dialectOptions: { mode: require('sqlite3').OPEN_READONLY } })
  try {
    const { popularBadges, showCommunity } = require('../services/community-profile')
    const directory = async () => members
    let reply
    await showCommunity({ guild: { ...guild, emojis: { fetch: async () => emojis } },
      deferReply: async () => {}, editReply: async payload => { reply = payload },
    }, { sequelize: db, directory })
    if (!Buffer.isBuffer(reply?.files?.[0]?.attachment)) throw new Error(reply?.content || 'Preview did not return an image')
    const target = path.resolve(__dirname, '../docs/previews/community-development-current.png')
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, reply.files[0].attachment)
    const rows = await require('../services/badges').defineBadgeModel(db).findAll({ where: { guildId: runtime.guildId } })
    const eligible = new Set([...members.values()].filter(member => !member.user.bot && !require('../services/member-policy').excludedMember(member)).map(member => member.id))
    const shared = await require('../services/plot-points').createPlotPoints({ sequelize: db }).unlockedBadge(runtime.guildId)
    console.log(JSON.stringify({ guild: guild.name, preview: target,
      badges: popularBadges(rows, eligible, shared).map(badge => ({ name: badge.name, owners: badge.ownerCount })),
      minimumOwners: require('../config/plot-points.json').popularBadges.minimumOwners,
      excludedUserIds: require('../config/plot-points.json').popularBadges.excludedUserIds,
      databaseReadOnly: true, discordMessagesSent: 0 }, null, 2))
  } finally { await db.close() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
