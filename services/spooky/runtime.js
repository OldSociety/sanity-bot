const { PermissionFlagsBits } = require('discord.js')
const { config } = require('./config')
const { helpScreen, privateScreen } = require('./presentation')
const instances = new WeakMap()

async function snapshotMembers(guild, roleIds, { actorId, actorOnly = false } = {}) {
  const actorRequest = actorId ? guild.members.fetch({ user: actorId, force: true }) : Promise.resolve(null)
  if (actorOnly) {
    const actor = await actorRequest
    if (!actor || actor.id !== actorId) throw new Error('Actor membership unavailable')
    return [{ userId: actor.id, bot: require('../member-policy').excludedMember(actor), displayName: actor.displayName, nickname: actor.nickname, roleIds: [...actor.roles.cache.keys()] }]
  }
  const [actor, members, bot, roles] = await Promise.all([actorRequest, require('../guild-members').memberDirectory(guild).get(guild), guild.members.fetchMe({ force: true }), guild.roles.fetch()])
  if (actor) { if (!members.has(actor.id)) throw new Error('Actor missing from complete directory'); members.set(actor.id, actor) }
  return [...members.values()].map(member => {
    const canRole = roleId => bot.permissions.has(PermissionFlagsBits.ManageRoles) && roles.get(roleId)?.editable === true
      // Role grants compare the awarded role with the bot, not the recipient's roles.
    return { userId: member.id, bot: require('../member-policy').excludedMember(member), displayName: member.displayName, nickname: member.nickname,
      roleIds: [...member.roles.cache.keys()], canManageCurse: canRole(roleIds.curse), canManageSweetTooth: canRole(roleIds.sweetTooth),
      canManageNickname: member.manageable && bot.permissions.has(PermissionFlagsBits.ManageNicknames) }
  })
}

function runtime(client) {
  if (instances.has(client)) return instances.get(client)
  const sequelize = require('../../config/sequelize')
  const { User } = require('../../Models/model')
  const { defineSpookyModels } = require('./models')
  const models = defineSpookyModels(sequelize)
  const economy = require('./economy').createEconomy({ sequelize, models, configVersion: config.version })
  const roleIds = { curse: process.env.CURSEDROLEID, sweetTooth: (process.env.SWEETTOOTHID || process.env.SWEETTOOTHROLEID), unwanted: process.env.UNWANTEDROLEID }
  const channels = require('./channels').allowedChannels()
  if (!channels.length || Object.values(roleIds).some(id => !id)) throw new Error('Spooky channels/roles are not configured')
  const guildId = process.env.GUILDID
  const guild = async id => {
    if (id !== guildId) throw new Error('Spooky is restricted to the configured server')
    return client.guilds.fetch(id)
  }
  const adapter = require('./discord-adapter').createDiscordAdapter(guild)
  const reservedRoleIds = Object.values(roleIds).filter(Boolean)
  const delivery = require('./delivery').createDelivery({ models, adapter, read: economy.read,
    canDeliver: require('./winner-awards').createTitleGuard({ models, reservedRoleIds,
      onError: error => console.error('Spooky winner configuration failed:', error.message) }) })
  const notifications = require('./notifications').createNotifications({ models })
  const badges = require('../badges').createBadges({ sequelize })
  const badgeAccess = require('../badge-access').createBadgeAccess({ service: badges, getGuild: guild, guildId })
  const controller = require('./controller').createController({ sequelize, User, models, delivery, notifications, roleIds,
    badges, badgeAccess, allowedChannelIds: channels, fetchMembers: async (id, options) => snapshotMembers(await guild(id), roleIds, options) })
  const participants = require('./participants').createParticipants({ models, economy })
  const effects = require('./effects').createEffects({ models, participants })
  const playful = require('./playful').createPlayful({ models, participants, effects, delivery,
    collection: require('./collection').createCollection({ models, participants, badges }), roleIds, listMembers: () => [] })
  const winnerSnapshots = require('./winner-snapshot').createWinnerSnapshot({ models })
  const lifecycle = require('./lifecycle').createLifecycle({ models, economy, playful, delivery, guildId, winnerSnapshots })
  const reminders = require('./reminders').createReminders({ models, economy, notifications, guildId,
    getChannel: async channelId => (await guild(guildId)).channels.fetch(channelId) })
  const fateReminders = require('./reminders').createReminders({ models, economy, notifications, guildId,
    namespace: 'fate-reminder', operationType: 'fate_reminder',
    settings: require('./reminder-settings').fateReminderSettings({ channelId: channels[0], roleId: roleIds.unwanted }),
    payload: settings => ({ content: `<@&${roleIds.unwanted}>`,
      allowedMentions: { parse: [], users: [], roles: settings.roleIds, repliedUser: false },
      embeds: [{ title: config.fate.paymentResource === 'sanity' ? 'Turn Your Sanity Into a Find!' : '🔮 Turn Your Fate Into a Find!', color: 0x9B59B6,
        description: config.fate.paymentResource === 'sanity'
          ? 'Don’t forget: **10 Sanity** buys a random token quarter with **/spooky buy-quarter**! You can trade throughout October, with no daily limit.'
          : 'Don’t forget: **10 Fate Points (Bank first, then Fate)** buy a random token quarter with **/spooky spend-fate**! You can trade throughout October, with no daily limit.' }] }),
    getChannel: async channelId => (await guild(guildId)).channels.fetch(channelId) })
  const reminderMaintenance = require('./reminders').withReminders(key => lifecycle.maintain(key), reminders,
    error => console.error('Spooky reminder failed:', error.message))
  // Defer optional configuration validation into the isolated award step. A bad
  // title setting cannot prevent the root cleanup/snapshot/archive maintenance.
  const winnerAwards = { tick: () => require('./winner-awards').createWinnerAwards({ models, economy, delivery, notifications, guildId, reservedRoleIds,
    getChannel: async channelId => (await guild(guildId)).channels.fetch(channelId) }).tick() }
  const awardMaintenance = require('./winner-awards').withWinnerAwards(reminderMaintenance, winnerAwards,
    error => console.error('Spooky winner awards failed:', error.message))
  const pending = require('./pending-notifications').createPendingNotifications({ models, economy, notifications,
    scope: { eventId: config.eventId, guildId }, getChannel: async channelId => (await guild(guildId)).channels.fetch(channelId) })
  const initialize = async () => {
    // Adopt existing/pending Crown awards once, outside SQLite for the full
    // Discord scan. Bootstrap rechecks inside the serialized root transaction.
    const crownScope = { eventId: config.eventId, guildId }
    const initialized = await economy.read(transaction => models.Ledger.findOne({ where: { ...crownScope, resource: 'crown_holder' }, transaction }))
    if (!initialized && require('./config').getEventState(new Date(), config) === 'ACTIVE') {
      const holders = await adapter.getRoleHolders(guildId, roleIds.sweetTooth)
      await economy.execute({ ...crownScope, actorId: 'system', workerKey: 'crown-exclusive-bootstrap-v18', operationType: 'crown_bootstrap' },
        ctx => require('./crown').createCrown({ models, delivery, roleId: roleIds.sweetTooth }).bootstrap(ctx, holders))
    }
    return Boolean(initialized) || require('./config').getEventState(new Date(), config) === 'ACTIVE'
  }
  const sweep = async key => {
    const result = await awardMaintenance(key)
    try { await fateReminders.tick() }
    catch (error) { console.error('Spooky Fate reminder failed:', error.message) }
    try { return { ...result, pendingNotifications: await pending.tick() } }
    catch (error) { console.error('Spooky notification recovery failed:', error.message); return result }
  }
  const coordinator = require('./maintenance-coordinator').createMaintenanceCoordinator({ initialize, sweep,
    beforeCommand: key => lifecycle.beforeCommand(key) })
  const instance = { controller, ...coordinator, models, economy, effects, notifications }
  instances.set(client, instance)
  return instance
}

async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand()
  // Reject off-channel commands before constructing DB services or maintenance,
  // including help while disabled. Replies to rejections are always private.
  const restricted = require('./channels').channelRestriction(interaction)
  if (restricted) return interaction.deferred ? interaction.editReply(restricted) : interaction.reply({ ...restricted, ephemeral: true })
  if (!config.enabled) return interaction.reply({ ...(subcommand === 'help' ? helpScreen() : privateScreen('🎃 Spooky Not Enabled', 'The redesigned event is not enabled yet.')), ephemeral: true })
  try {
    const service = runtime(interaction.client)
    if (interaction.guildId !== process.env.GUILDID) throw new Error('Use the configured Spooky server')
    // Keep expiry/closure safety immediate; full recovery runs in the worker.
    await interaction.deferReply({ ephemeral: interaction.options.getSubcommand() !== 'leaderboard' })
    await service.beforeCommand(`before:${interaction.id}`)
    await service.controller.execute(interaction)
  } catch (error) {
    // Keep player errors simple, but never discard the diagnostic that explains
    // why an acknowledged command could not complete.
    console.error('Spooky command failed:', error.code || error.name || 'Error', String(error.message).slice(0, 500))
    const payload = privateScreen('🎃 Spooky Unavailable', 'Check event configuration, migrations, and bot permissions. Your completed rewards remain saved.')
    if (interaction.deferred) await interaction.editReply(payload)
    else await interaction.reply({ ...payload, ephemeral: true })
  }
}

async function handleMessage(message) {
  if (!config.enabled || message.guildId !== process.env.GUILDID || message.author.bot) return
  const service = runtime(message.client)
  const scope = { eventId: config.eventId, guildId: message.guildId }
  if (!await service.effects.active({ scope, now: new Date() }, message.author.id, 'curse')) return
  const result = await service.economy.execute({ ...scope, actorId: message.author.id, workerKey: `message:${message.id}`, operationType: 'cursed_message' }, async ctx => {
    const plan = require('./cursed-messages').planCursedMessage({ content: message.content, username: message.author.username,
      avatarURL: message.author.displayAvatarURL?.(),
      cursed: Boolean(await service.effects.active(ctx, message.author.id, 'curse')), hasAttachments: message.attachments.size > 0,
      isReply: Boolean(message.reference), now: ctx.now })
    if (plan) {
      const player = await service.models.Participant.findOne({ where: { ...ctx.scope, userId: message.author.id }, transaction: ctx.transaction })
      const balances = player ? { candy: require('./participants').calculateRefill({ candy: player.candy, refillAnchor: player.refillAnchor, now: ctx.now, event: config }).candy, eyes: player.eyes } : {}
      await service.notifications.enqueue(ctx, message.channelId, [{ public: true,
        payload: require('./presentation').withBalances(plan.payload, balances, ctx.now, config) }])
    }
    return { transformed: Boolean(plan) }
  })
  await deliverCursedMessage(service, result, message)
}

async function deliverCursedMessage(service, result, message) {
  if (!result.receipt.transformed) return
  const delivery = await service.notifications.deliver(result.operationId, message.channel)
  // A cancelled or absent replacement is not successful delivery. A development
  // reset must never turn cancellation into deletion of the original message.
  if (delivery?.allSent !== true) return
  // Only delete after the durable notification is confirmed sent. No raw fallback.
  await message.delete().catch(() => {})
}

const schedulers = new WeakMap()
function startMaintenance(client) {
  if (schedulers.has(client)) return schedulers.get(client)
  const scheduler = require('./lifecycle').createMaintenanceScheduler({
    getService: () => runtime(client), isReady: () => client.isReady(),
    onError: error => console.error('Spooky maintenance failed:', error.message),
  })
  schedulers.set(client, scheduler)
  client.once('invalidated', () => scheduler.stop())
  void scheduler.start()
  return scheduler
}

module.exports = { execute, handleMessage, snapshotMembers, deliverCursedMessage, startMaintenance }
