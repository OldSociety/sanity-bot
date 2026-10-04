const { createHash } = require('node:crypto')
const { escapeMarkdown } = require('discord.js')
const { config: defaultEvent, getEventState } = require('./config')
const { createWinnerSnapshot, snapshotOperationId } = require('./winner-snapshot')
const defaults = require('../../config/spooky-winners.json')

const titleKinds = ['final_treat_role', 'final_trick_role', 'final_overall_role']
const awardTracks = settings => settings.mode === 'overall' ? ['overall'] : ['treat', 'trick']
function validateWinners(settings, reservedRoleIds = []) {
  const snowflake = value => typeof value === 'string' && /^\d{17,20}$/.test(value)
  if (!settings || typeof settings.enabled !== 'boolean' || (settings.channelId !== null && !snowflake(settings.channelId))) throw new Error('Invalid winner configuration')
  const result = { enabled: settings.enabled, channelId: settings.channelId }
  if (settings.mode !== undefined) {
    if (!['overall', 'separate'].includes(settings.mode)) throw new Error('Invalid winner mode')
    result.mode = settings.mode
    if (settings.announcementAt !== null && !Number.isFinite(Date.parse(settings.announcementAt))) throw new Error('Invalid winner announcement time')
    if (settings.enabled && settings.mode === 'overall' && !settings.announcementAt) throw new Error('Winner announcement time is required')
    result.announcementAt = settings.announcementAt
  }
  for (const track of awardTracks(settings)) {
    const title = settings[track]
    if (!title || (title.roleId !== null && (!snowflake(title.roleId) || reservedRoleIds.includes(title.roleId))) ||
      (title.name !== null && (typeof title.name !== 'string' || !title.name.trim() || title.name !== title.name.trim() || title.name.length > 80 || /[@<>\r\n]/.test(title.name) || title.name.toLowerCase() === 'sweet tooth'))) throw new Error('Invalid winner title name/role')
    if (settings.enabled && (!title.roleId || !title.name)) throw new Error('Enabled winners require both title names and roles')
    result[track] = { name: title.name, roleId: title.roleId }
  }
  if (settings.enabled && !settings.channelId) throw new Error('Enabled winners require an announcement channel')
  if (result.treat?.roleId && result.treat.roleId === result.trick.roleId) throw new Error('Winner roles must be distinct')
  if (result.treat?.name && result.treat.name.toLowerCase() === result.trick.name?.toLowerCase()) throw new Error('Winner titles must be distinct')
  return result
}
// Validate when constructing the optional award worker, rather than at import:
// malformed operational settings must not prevent cleanup/archive from running.
function selectWinnerConfig(environment, env = process.env, configured = defaults) {
  const selected = environment === 'production' ? { ...configured, ...configured.production } : configured
  return Object.freeze({ ...selected,
    channelId: environment === 'production' ? env.SERVERANNOUNCEMENTSID || selected.channelId : selected.channelId,
    overall: Object.freeze({ ...selected.overall, roleId: env.SCREAMSUPREMEID || selected.overall.roleId }),
    treat: Object.freeze({ ...selected.treat }), trick: Object.freeze({ ...selected.trick }) })
}
const winnerConfig = selectWinnerConfig(process.env.NODE_ENV)
const settingsSignature = settings => createHash('sha256').update(JSON.stringify(settings)).digest('hex')
const awardOperationId = (eventId, guildId) => `worker:${eventId}:${guildId}:final-awards`

function winnerMessages(proof, settings) {
  const messages = []
  for (const track of awardTracks(settings)) {
    const data = track === 'overall' ? require('./winner-snapshot').overallTrack(proof.tracks) : proof.tracks[track]
    const ids = data.userIds
    const stats = track === 'overall' ? `\n\n**October totals:** ${data.entrants.reduce((n, row) => n + row.treats, 0)} treats • ${data.entrants.reduce((n, row) => n + row.tricks, 0)} tricks • ${data.entrants.reduce((n, row) => n + (row.scoreTenths ?? row.score * 10), 0) / 10} prestige points.\n${ids.length ? `**Winning prestige:** ${data.score}.` : ''}` : ''
    if (ids.some(id => !/^\d{17,20}$/.test(id))) throw new Error('Invalid winner Discord identity')
    // Bounded pages support every shared tie, including large guilds, without
    // exceeding embed text or mention allowlists. Never expose score weights.
    const pages = Math.max(1, Math.ceil(ids.length / 32))
    for (let page = 0; page < pages; page++) {
      const users = ids.slice(page * 32, (page + 1) * 32)
      messages.push({ public: true, payload: { embeds: [{ color: track === 'treat' ? 0x2ECC71 : 0x9B59B6,
        title: `🎃 Spooky Season — Final Winners${pages > 1 ? ` (${page + 1}/${pages})` : ''}`,
        description: `## ${escapeMarkdown(settings[track].name)}\n${users.length ? `**Congratulations!**\n${users.map(id => `<@${id}>`).join(' • ')}` : 'No qualifying players in this category this October.'}${stats}\n\nOctober’s event has ended. Thank you for the mischief! Your earned badges remain yours.` }],
        allowedMentions: { parse: [], users, roles: [], repliedUser: false } } })
    }
  }
  return messages
}

// Guards apply to every automatic/admin role reconciliation path. Operational
// disable/config drift must not let an unrelated gameplay reconcile send titles.
function createTitleGuard({ models, event = defaultEvent, settings = winnerConfig, reservedRoleIds = [], clock = () => new Date(), onError = () => {} }) {
  let approved
  try { approved = validateWinners(settings, reservedRoleIds) }
  catch (error) { onError(error); return async row => !titleKinds.includes(row.kind) }
  const signature = settingsSignature(approved)
  return async row => {
    if (!titleKinds.includes(row.kind)) return true
    if (!event.enabled || !approved.enabled || getEventState(clock(), event) !== 'CLOSED') return false
    const owner = await models.Operation.findByPk(awardOperationId(row.eventId, row.guildId))
    const track = row.kind === 'final_treat_role' ? 'treat' : row.kind === 'final_trick_role' ? 'trick' : 'overall'
    if (!awardTracks(approved).includes(track) || (approved.announcementAt && new Date(clock()) < new Date(approved.announcementAt))) return false
    return Boolean(owner?.completedAt && owner.eventId === event.eventId && owner.guildId === row.guildId &&
      row.eventId === event.eventId && owner.actorId === 'system' && owner.operationType === 'winner_awards' &&
      owner.receipt?.signature === signature && row.payload.signature === signature &&
      row.payload.snapshotOperationId === owner.receipt.snapshotOperationId &&
      owner.receipt.winners?.[track]?.includes(row.userId) && row.payload.roleId === approved[track].roleId && row.payload.present === true)
  }
}

class NotReady extends Error {}
function createWinnerAwards({ models, economy, delivery, notifications, guildId, getChannel,
  event = defaultEvent, settings = winnerConfig, reservedRoleIds = [], clock = () => new Date() }) {
  const approved = validateWinners(settings, reservedRoleIds), signature = settingsSignature(approved)
  const scope = { eventId: event.eventId, guildId }
  if (typeof guildId !== 'string' || !guildId.trim() || typeof getChannel !== 'function') throw new Error('Winner guild/channel adapter required')
  const snapshots = createWinnerSnapshot({ models, event })
  if (approved.announcementAt && Date.parse(approved.announcementAt) < Date.parse(event.endsAt)) throw new Error('Winner announcement precedes event closure')
  async function canSend(receipt, transaction) {
    if (!event.enabled || !approved.enabled || getEventState(clock(), event) !== 'CLOSED' || receipt.signature !== signature ||
      (approved.announcementAt && new Date(clock()) < new Date(approved.announcementAt))) return false
    const state = await models.EventState.findOne({ where: scope, transaction })
    return Boolean(state?.archivedAt)
  }
  async function tick() {
    if (!event.enabled || !approved.enabled) return { skipped: 'disabled' }
    if (getEventState(clock(), event) !== 'CLOSED') return { skipped: 'not_closed' }
    if (approved.announcementAt && new Date(clock()) < new Date(approved.announcementAt)) return { skipped: 'not_due' }
    let result
    try {
      result = await economy.execute({ ...scope, actorId: 'system', workerKey: 'final-awards', operationType: 'winner_awards' }, async ctx => {
        const state = await models.EventState.findOne({ where: scope, transaction: ctx.transaction })
        const proofId = snapshotOperationId(event.eventId, guildId)
        const proof = await models.Operation.findByPk(proofId, { transaction: ctx.transaction })
        if (getEventState(ctx.now, event) !== 'CLOSED' || !state?.archivedAt || !proof ||
          (approved.announcementAt && ctx.now < new Date(approved.announcementAt))) throw new NotReady('Winner snapshot/archive not ready')
        await snapshots.freeze(ctx) // Validate the existing proof; never recompute.
        const messages = winnerMessages(proof.receipt, approved)
        const winners = {}
        for (const track of awardTracks(approved)) {
          const data = track === 'overall' ? require('./winner-snapshot').overallTrack(proof.receipt.tracks) : proof.receipt.tracks[track]
          winners[track] = [...data.userIds]
          for (const userId of winners[track]) await delivery.enqueue(ctx, userId, `final_${track}_role`, {
            roleId: approved[track].roleId, present: true, snapshotOperationId: proofId, signature,
          })
        }
        await notifications.enqueue(ctx, approved.channelId, messages)
        await ctx.record({ userId: 'system', resource: 'winner_awards', delta: 0,
          metadata: { snapshotOperationId: proofId, signature, winners, notificationCount: messages.length } })
        return { snapshotOperationId: proofId, signature, settings: approved, winners, notificationCount: messages.length }
      })
    } catch (error) { if (error instanceof NotReady) return { skipped: 'snapshot_not_ready' }; throw error }
    if (result.receipt.signature !== signature) return { ...result, skipped: 'configuration_changed' }
    const deliveries = await delivery.reconcile(scope, { kinds: titleKinds })
    const rows = await economy.read(transaction => models.Notification.findAll({ where: { operationId: result.operationId }, transaction }))
    if (rows.some(row => ['sending', 'uncertain'].includes(row.status))) return { ...result, deliveries, skipped: 'inspection_required' }
    if (!rows.some(row => row.status === 'pending')) return { ...result, deliveries, skipped: 'already_resolved' }
    if (!await economy.read(transaction => canSend(result.receipt, transaction))) return { ...result, deliveries, skipped: 'not_ready' }
    const channel = await getChannel(result.receipt.settings.channelId)
    if (!channel || channel.id !== result.receipt.settings.channelId || channel.guildId !== guildId || typeof channel.send !== 'function') throw new Error('Winner announcement channel owner mismatch')
    const delivered = await notifications.deliver(result.operationId, channel, {
      canDeliver: () => economy.read(transaction => canSend(result.receipt, transaction)),
    })
    return { ...result, deliveries, delivered }
  }
  return { tick }
}

function withWinnerAwards(maintain, awards, onError = () => {}) {
  return async key => {
    const result = await maintain(key)
    try { return { ...result, winnerAwards: await awards.tick() } }
    catch (error) { onError(error); return { ...result, winnerAwards: { failed: true } } }
  }
}
module.exports = { winnerConfig, selectWinnerConfig, titleKinds, validateWinners, settingsSignature, awardOperationId, winnerMessages, createTitleGuard, createWinnerAwards, withWinnerAwards }
