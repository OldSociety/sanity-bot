const { PermissionFlagsBits } = require('discord.js')
const { config } = require('./config')
const { privateScreen } = require('./presentation')
const { resolveRuntime } = require('../../config/runtime')
const instances = new WeakMap()

async function authorize(client, guildId, actorId, configuredGuildId, adminRoleId) {
  if (!configuredGuildId || guildId !== configuredGuildId) return false
  const guild = await client.guilds.fetch(guildId)
  const member = await guild.members.fetch({ user: actorId, force: true })
  return member.id === actorId && !member.user.bot &&
    (member.permissions.has(PermissionFlagsBits.Administrator) || Boolean(adminRoleId && member.roles.cache.has(adminRoleId)))
}
function runtime(client) {
  if (instances.has(client)) return instances.get(client)
  const sequelize = require('../../config/sequelize')
  const { User } = require('../../Models/model')
  const models = require('./models').defineSpookyModels(sequelize)
  const economy = require('./economy').createEconomy({ sequelize, models, configVersion: config.version })
  const guildId = process.env.GUILDID
  const member = async (id, userId) => {
    if (id !== guildId) throw new Error('Restoration guild mismatch')
    return (await client.guilds.fetch(id)).members.fetch({ user: userId, force: true })
  }
  const delivery = require('./delivery').createDelivery({ models, read: economy.read,
    canDeliver: require('./winner-awards').createTitleGuard({ models,
      reservedRoleIds: [process.env.CURSEDROLEID, process.env.SWEETTOOTHROLEID, process.env.UNWANTEDROLEID].filter(Boolean),
      onError: error => console.error('Spooky winner configuration failed:', error.message) }),
    adapter: require('./discord-adapter').createDiscordAdapter(async id => {
      if (id !== guildId) throw new Error('Projection guild mismatch')
      return client.guilds.fetch(id)
    }) })
  const notifications = require('./notifications').createNotifications({ models })
  const badges = require('../badges').createBadges({ sequelize })
  const badgeAccess = require('../badge-access').createBadgeAccess({ service: badges, guildId, getGuild: async id => {
    if (id !== guildId) throw new Error('Badge access guild mismatch')
    return client.guilds.fetch(id)
  } })
  const fetchChannel = async channelId => {
    const channel = await client.channels.fetch(channelId)
    if (!channel || channel.guildId !== guildId) throw new Error('Notification channel owner mismatch')
    return channel
  }
  const admin = require('./admin').createAdmin({ sequelize, User, models, economy, guildId,
    badges,
    environment: resolveRuntime(process.env.NODE_ENV).env,
    developmentStorage: resolveRuntime('development').database.storage, delivery, roleIds: { curse: process.env.CURSEDROLEID },
    authorize: input => authorize(client, input.guildId, input.actorId, guildId, process.env.ADMINROLEID),
    readMember: async input => {
      const value = await member(input.guildId, input.userId)
      return { nickname: value.nickname, roleIds: [...value.roles.cache.keys()] }
    },
    readMessage: async input => {
      const value = await (await fetchChannel(input.channelId)).messages.fetch({ message: input.messageId, force: true })
      return { id: value.id, guildId: value.guildId, channelId: value.channelId,
        isBotMessage: Boolean(client.user?.id && value.author.id === client.user.id), content: value.content,
        embeds: value.embeds.map(embed => embed.toJSON()),
        attachments: [...value.attachments.values()].map(attachment => ({ name: attachment.name, url: attachment.url })) }
    },
    finalizeRepair: async (ctx, receipt, input) => {
      const messages = require('./admin-command').repairAwardMessages(receipt, input.displayName)
      await notifications.enqueue(ctx, input.channelId, messages)
      return { ...receipt, messages }
    } })
  const controller = require('./admin-command').createAdminController({ admin, notifications, delivery, fetchChannel, badgeAccess, scope: { eventId: config.eventId, guildId },
    allowedChannelIds: [process.env.SPOOKYCHANNELID, process.env.BOTTESTCHANNELID].filter(Boolean) })
  instances.set(client, controller)
  return controller
}
async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true })
  try {
    // Gate before importing the global database or reading any seasonal state.
    if (!await authorize(interaction.client, interaction.guildId, interaction.user.id, process.env.GUILDID, process.env.ADMINROLEID)) {
      return interaction.editReply(privateScreen('🎃 Admin Access Denied', 'Administrator permission is required in the configured server.'))
    }
    const channels = [process.env.SPOOKYCHANNELID, process.env.BOTTESTCHANNELID].filter(Boolean)
    if (!channels.includes(interaction.channelId)) return interaction.editReply(privateScreen('🎃 Admin Access Denied', 'Use a configured Spooky or bot-test channel.'))
    return await runtime(interaction.client).execute(interaction)
  } catch {
    return interaction.editReply(privateScreen('🎃 Admin Inspection Unavailable', 'Check development configuration, migrations and permissions.'))
  }
}
module.exports = { execute, authorize }
