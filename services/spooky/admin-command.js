const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js')
const { privateScreen, actionMessages } = require('./presentation')

function adminCommand(controller) {
  const data = new SlashCommandBuilder().setName('spooky-admin').setDescription('Inspect and repair Spooky event state.').setDMPermission(false)
  data.addSubcommand(command => command.setName('player').setDescription('Inspect stored player balances, inventory and effects.')
    .addUserOption(option => option.setName('player').setDescription('Player to inspect.').setRequired(true))
    .addIntegerOption(pageOption))
  data.addSubcommand(command => command.setName('config').setDescription('Inspect event rules and stored pause/archive state.').addIntegerOption(pageOption))
  for (const name of ['transactions', 'deliveries']) data.addSubcommand(command => command.setName(name)
    .setDescription(name === 'transactions' ? 'Inspect recent scoped ledger and operation receipts.' : 'Inspect role/nickname and public notification queues.')
    .addUserOption(option => option.setName('player').setDescription('Optional player filter.'))
    .addIntegerOption(option => option.setName('before').setDescription('Only rows with IDs lower than this cursor.').setMinValue(1))
    .addIntegerOption(option => option.setName('limit').setDescription('Rows per queue (default 20).').setMinValue(1).setMaxValue(50))
    .addIntegerOption(pageOption))
  data.addSubcommand(command => command.setName('adjust').setDescription('Apply an audited candy or Evil Eye balance correction.')
    .addUserOption(option => option.setName('player').setDescription('Existing player to repair.').setRequired(true))
    .addStringOption(option => option.setName('resource').setDescription('Balance to correct.').setRequired(true)
      .addChoices({ name: 'Candy', value: 'candy' }, { name: 'Evil Eyes', value: 'eyes' }))
    .addIntegerOption(option => option.setName('delta').setDescription('Signed adjustment: candy ±80, Eyes ±100; no zero.').setRequired(true).setMinValue(-100).setMaxValue(100))
    .addStringOption(reasonOption))
  for (const name of ['grant-quarter', 'remove-quarter']) data.addSubcommand(command => {
    command.setName(name).setDescription(name === 'grant-quarter' ? 'Grant one named quarter; duplicate exchange runs automatically.' : 'Remove one named quarter; last copies need explicit permission.')
      .addUserOption(option => option.setName('player').setDescription('Registered player to repair.').setRequired(true))
      .addStringOption(option => option.setName('piece').setDescription('Stable piece ID, for example had_tl.').setRequired(true).setMaxLength(16))
      .addStringOption(reasonOption)
    if (name === 'remove-quarter') command.addBooleanOption(option => option.setName('last-copy').setDescription('Explicitly permit removal of an erroneous only copy.'))
    return command
  })
  data.addSubcommand(command => command.setName('clear-effect').setDescription('Clear an effect and queue safe Discord restoration.')
    .addUserOption(option => option.setName('player').setDescription('Existing player to repair.').setRequired(true))
    .addStringOption(option => option.setName('effect').setDescription('Effect to clear.').setRequired(true)
      .addChoices({ name: 'Curse', value: 'curse' }, { name: 'Reversed nickname', value: 'reversed_nickname' }, { name: 'Theft protection', value: 'theft_protection' }))
    .addStringOption(reasonOption))
  data.addSubcommand(command => command.setName('pause').setDescription('Pause or resume event actions without changing event dates.')
    .addBooleanOption(option => option.setName('paused').setDescription('True to pause; false to resume.').setRequired(true))
    .addStringOption(reasonOption))
  data.addSubcommand(command => command.setName('reset-development').setDescription('Reset one development seasonal player, retaining audit and wallet.')
    .addUserOption(option => option.setName('player').setDescription('Development participant to reset.').setRequired(true))
    .addBooleanOption(option => option.setName('confirm').setDescription('Explicitly confirm the seasonal development reset.').setRequired(true))
    .addStringOption(reasonOption))
  data.addSubcommand(command => command.setName('reset-testing').setDescription('Fresh development test: clear event state, badges and Crown; retain Fate/Bank and audit.')
    .addUserOption(option => option.setName('player').setDescription('Development player to fully reset.').setRequired(true))
    .addBooleanOption(option => option.setName('confirm').setDescription('Confirm clearing event badges and Crown eligibility too.').setRequired(true))
    .addStringOption(reasonOption))
  data.addSubcommand(command => command.setName('recompute-badges').setDescription('Reconcile earned permanent badges without changing quarters.')
    .addUserOption(option => option.setName('player').setDescription('Registered event participant.').setRequired(true))
    .addBooleanOption(option => option.setName('confirm').setDescription('Confirm permanent badge eligibility reconciliation.').setRequired(true))
    .addStringOption(reasonOption))
  for (const target of ['notification', 'delivery']) data.addSubcommand(command => {
    command.setName(`resolve-${target}`).setDescription('Resolve one inspected queue row with an audited explicit decision.')
      .addIntegerOption(option => option.setName('id').setDescription('Inspected queue row ID.').setRequired(true).setMinValue(1))
      .addStringOption(option => option.setName('action').setDescription('Resend deliberately risks a duplicate; retry only an unclaimed send.').setRequired(true)
        .addChoices(...(target === 'notification' ? ['acknowledge', 'cancel', 'retry', 'resend'] : ['acknowledge', 'cancel', 'retry']).map(value => ({ name: value, value }))))
      .addStringOption(option => option.setName('status').setDescription('Exact status shown by inspection.').setRequired(true)
        .addChoices(...(target === 'notification' ? ['pending', 'sending', 'uncertain'] : ['pending', 'conflict']).map(value => ({ name: value, value }))))
    if (target === 'delivery') command.addStringOption(option => option.setName('revision').setDescription('Exact inspected delivery revision.').setRequired(true).setMaxLength(200))
    command.addBooleanOption(option => option.setName('confirm').setDescription('Confirm this decision, including possible duplicate risk for resend.').setRequired(true))
      .addStringOption(reasonOption)
    if (target === 'notification') command.addStringOption(option => option.setName('message').setDescription('Observed bot message ID, required for acknowledge.').setMaxLength(20))
    return command
  })
  // Custom admin roles can be allowed in server command permissions; fresh
  // runtime authorization remains required independently of picker visibility.
  data.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  const commands = [...data.options]
  data.options = []
  const groups = { inspect: ['player', 'config', 'transactions', 'deliveries'],
    repair: ['adjust', 'grant-quarter', 'remove-quarter', 'clear-effect', 'recompute-badges'],
    event: ['pause', 'reset-development', 'reset-testing'], queue: ['resolve-notification', 'resolve-delivery'] }
  for (const [name, names] of Object.entries(groups)) data.addSubcommandGroup(group => {
    group.setName(name).setDescription(`Spooky ${name} tools.`)
    for (const command of commands.filter(command => names.includes(command.name))) group.addSubcommand(command)
    if (name === 'inspect') group.addSubcommand(command => command.setName('wording').setDescription('Privately browse trick and treat embed designs.'))
    return group
  })
  return { data, execute: interaction => controller.execute(interaction) }
}
function reasonOption(option) {
  return option.setName('reason').setDescription('Required private audit reason for this correction.').setRequired(true).setMinLength(1).setMaxLength(500)
}
function pageOption(option) {
  return option.setName('page').setDescription('Page of this private inspection result (default 1).').setMinValue(1).setMaxValue(10000)
}
function inspectionScreen(view, result, page = 1) {
  // JSON remains audit data, not executable Markdown or mentions. Chunk before
  // embedding to keep complete results available without exceeding Discord limits.
  const text = JSON.stringify(result, null, 2).replace(/`/g, '\\u0060')
  const pages = Math.max(1, Math.ceil(text.length / 3000))
  if (!Number.isSafeInteger(page) || page < 1 || page > pages) throw new Error(`Page must be between 1 and ${pages}`)
  return { ...privateScreen(`🎃 Admin ${view} • ${page}/${pages}`, `\`\`\`json\n${text.slice((page - 1) * 3000, page * 3000)}\n\`\`\``), allowedMentions: { parse: [] } }
}
function repairAwardMessages(receipt, displayName) {
  const userId = receipt.request.userId
  const messages = actionMessages(receipt, { actorId: userId, members: [{ userId, displayName }], registeredIds: new Set([userId]) })
    .filter(message => message.public)
  // Only awards/completions go public; private repair reasons and balances stay
  // in the admin receipt. Award ownership is the repaired player, not the admin.
  return messages.map(message => ({ ...message, payload: { ...message.payload, content: `<@${userId}>`,
    allowedMentions: { parse: [], users: [userId], roles: [], repliedUser: false } } }))
}
function createAdminController({ admin, allowedChannelIds, notifications = null, delivery = null, scope = null, fetchChannel = null, badgeAccess = null }) {
  async function execute(interaction) {
    if (!interaction.deferred) await interaction.deferReply({ ephemeral: true })
    let committed = false
    try {
      if (!Array.isArray(allowedChannelIds) || !allowedChannelIds.length || !allowedChannelIds.includes(interaction.channelId)) throw new Error('Use a configured Spooky or bot-test channel')
      const subcommand = interaction.options.getSubcommand()
      if (subcommand === 'wording') {
        const authorize = () => admin.inspect({ view: 'config', guildId: interaction.guildId, actorId: interaction.user.id })
        await authorize()
        await require('./wording-preview').showPreview(interaction, authorize)
        return
      }
      if (['resolve-notification', 'resolve-delivery'].includes(subcommand)) {
        const target = subcommand === 'resolve-notification' ? 'notification' : 'delivery'
        const result = await admin.resolve({ guildId: interaction.guildId, actorId: interaction.user.id, interactionId: interaction.id,
          channelId: interaction.channelId, target, id: interaction.options.getInteger('id'),
          action: interaction.options.getString('action'), expectedStatus: interaction.options.getString('status'),
          expectedRevision: target === 'delivery' ? interaction.options.getString('revision') : undefined,
          messageId: target === 'notification' ? interaction.options.getString('message') : undefined,
          confirm: interaction.options.getBoolean('confirm'), reason: interaction.options.getString('reason') })
        committed = true
        const dispatch = result.receipt.dispatch
        let outcome = null
        if (dispatch?.notificationId) {
          if (!notifications || !fetchChannel) throw new Error('Notification dispatch is unavailable')
          outcome = await notifications.deliver(dispatch.operationId, await fetchChannel(dispatch.channelId), { notificationId: dispatch.notificationId })
        } else if (dispatch?.deliveryId) {
          if (!delivery || !scope) throw new Error('Projection dispatch is unavailable')
          outcome = await delivery.reconcile(scope, { userId: dispatch.userId, deliveryId: dispatch.deliveryId })
        }
        await interaction.editReply(inspectionScreen('Resolution Saved', { operationId: result.operationId,
          replayed: result.replayed, ...result.receipt, deliveryOutcome: outcome }))
        return
      }
      if (subcommand === 'recompute-badges') {
        const user = interaction.options.getUser('player')
        const result = await admin.recomputeBadges({ guildId: interaction.guildId, actorId: interaction.user.id, interactionId: interaction.id,
          channelId: interaction.channelId, userId: user?.id, displayName: user?.globalName || user?.username || user?.id,
          confirm: interaction.options.getBoolean('confirm'), reason: interaction.options.getString('reason') })
        committed = true
        await require('./post-commit').finishSaved({ interaction, result, badgeAccess, userId: result.receipt.request.userId, savedTitle: 'Badge Recompute Saved',
          payload: inspectionScreen('Badge Recompute Saved', { operationId: result.operationId, replayed: result.replayed, ...result.receipt }),
          publish: notifications ? () => notifications.deliver(result.operationId, interaction.channel) : null })
        return
      }
      if (['clear-effect', 'pause', 'reset-development', 'reset-testing'].includes(subcommand)) {
        const input = { guildId: interaction.guildId, actorId: interaction.user.id, interactionId: interaction.id,
          channelId: interaction.channelId, action: subcommand, reason: interaction.options.getString('reason') }
        if (subcommand === 'pause') input.paused = interaction.options.getBoolean('paused')
        else {
          input.userId = interaction.options.getUser('player')?.id
          if (subcommand === 'clear-effect') input.effectType = interaction.options.getString('effect')
          else input.confirm = interaction.options.getBoolean('confirm')
        }
        const result = await admin.control(input)
        committed = true
        const receipt = result.receipt
        // Scope comes from trusted runtime composition, never interaction options.
        const projections = delivery && scope && input.userId ? await delivery.reconcile(scope, { userId: input.userId }) : []
        if (receipt.testReset && badgeAccess) await badgeAccess.reconcileUser(scope.guildId, input.userId)
          .catch(error => console.error('Test reset badge access pending:', error.message))
        await interaction.editReply(privateScreen('🎃 Control Saved', [
          `**Operation:** ${result.operationId}`,
          `**Control:** ${subcommand}`,
          ...(receipt.state ? [`**Actions paused:** ${receipt.state.actionsPaused}`] : []),
          ...(receipt.effects ? [`**Effects cleared:** ${receipt.effects.filter(effect => effect.cleared).length}`] : []),
          ...(receipt.removedParticipant ? [receipt.testReset
            ? 'Fresh development test reset: registration, candy, Eyes, quarters, scores, event badges and Crown eligibility cleared. Fate/Bank and audit history retained.'
            : 'Development seasonal participant removed; wallet and audit history retained.'] : []),
          ...(receipt.ambiguousNotifications?.length ? [`**Notifications needing inspection:** ${receipt.ambiguousNotifications.join(', ')}`] : []),
          ...(projections.length ? [`**Restoration:** ${projections.map(row => `${row.kind}: ${row.status}`).join(', ')}`] : []),
          result.replayed ? 'Saved receipt replayed; no second control mutation.' : 'Control recorded in the ledger.',
        ].join('\n')))
        return
      }
      if (['adjust', 'grant-quarter', 'remove-quarter'].includes(subcommand)) {
        const user = interaction.options.getUser('player')
        const input = { guildId: interaction.guildId, actorId: interaction.user.id, interactionId: interaction.id,
          channelId: interaction.channelId, userId: user?.id, displayName: user?.globalName || user?.username || user?.id,
          action: subcommand === 'adjust' ? 'balance' : subcommand, reason: interaction.options.getString('reason') }
        if (subcommand === 'adjust') Object.assign(input, { resource: interaction.options.getString('resource'), delta: interaction.options.getInteger('delta') })
        else Object.assign(input, { pieceId: interaction.options.getString('piece'),
          allowLastCopy: subcommand === 'remove-quarter' && interaction.options.getBoolean('last-copy') === true })
        const result = await admin.repair(input)
        committed = true
        const receipt = result.receipt
        const payload = privateScreen('🎃 Repair Saved',
          `**Operation:** ${result.operationId}\n**Player:** ${receipt.request.userId}\n**Candy:** ${receipt.candy}\n**Eyes:** ${receipt.eyes}\n**Quarters awarded:** ${receipt.result.awards.length}\n**Owned pieces:** ${receipt.result.ownedPieces}\n**Extras:** ${receipt.result.duplicates}\n${result.replayed ? 'Replayed saved receipt; no second correction.' : 'Correction recorded in the ledger.'}\nUse /spooky-admin player or transactions for full details.`)
        await require('./post-commit').finishSaved({ interaction, result, payload, badgeAccess, userId: receipt.request.userId, savedTitle: '🎃 Repair Saved',
          publish: notifications ? () => notifications.deliver(result.operationId, interaction.channel) : null })
        return
      }
      const result = await admin.inspect({ view: interaction.options.getSubcommand(), guildId: interaction.guildId, actorId: interaction.user.id,
        userId: interaction.options.getUser('player')?.id, beforeId: interaction.options.getInteger('before') ?? undefined,
        limit: interaction.options.getInteger('limit') ?? undefined })
      await interaction.editReply(inspectionScreen(interaction.options.getSubcommand(), result, interaction.options.getInteger('page') ?? 1))
    } catch (error) {
      await interaction.editReply({ ...privateScreen(committed ? '🎃 Repair Saved' : '🎃 Admin Request Unavailable',
        committed ? 'Your administrative operation is committed. A reply or delivery failed; do not repeat it with a new interaction. Inspect transactions and deliveries.' : error.message), allowedMentions: { parse: [] } }).catch(() => {})
    }
  }
  return { execute }
}

module.exports = { adminCommand, createAdminController, inspectionScreen, repairAwardMessages }
