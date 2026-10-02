const { createHash } = require('node:crypto')
const { Op } = require('sequelize')
const { config: defaultEvent, getEventState } = require('./config')
const defaults = require('../../config/spooky-reminders.json')

function validateReminders(settings) {
  const snowflake = value => typeof value === 'string' && /^\d{17,20}$/.test(value)
  if (typeof settings.enabled !== 'boolean' || settings.timezone !== 'America/Los_Angeles' || settings.everyDays !== 3) throw new Error('Invalid reminder enable/cadence/timezone')
  if (settings.channelId !== null && !snowflake(settings.channelId)) throw new Error('Invalid reminder channel ID')
  if (!Array.isArray(settings.roleIds) || settings.roleIds.length > 10 || settings.roleIds.some(id => !snowflake(id)) || new Set(settings.roleIds).size !== settings.roleIds.length) throw new Error('Invalid reminder role allowlist')
  if (settings.localTime !== null && (typeof settings.localTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.localTime))) throw new Error('Invalid reminder local time')
  if (settings.enabled && (!settings.channelId || !settings.roleIds.length || !settings.localTime)) throw new Error('Enabled reminders require channel, roles and Pacific send time')
  return { ...settings, roleIds: [...settings.roleIds] }
}
const reminderConfig = Object.freeze({ ...validateReminders(defaults), roleIds: Object.freeze([...defaults.roleIds]) })
const localFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
function localParts(now) {
  const values = Object.fromEntries(localFormat.formatToParts(new Date(now)).map(p => [p.type, p.value]))
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` }
}
// Ordinals represent calendar dates, not elapsed UTC days. Time comparisons use
// IANA Pacific wall time so midnight/DST never silently become fixed UTC-8.
function latestReminderSlot(now, settings = reminderConfig, event = defaultEvent) {
  if (!settings.enabled || getEventState(new Date(now), event) !== 'ACTIVE') return null
  const local = localParts(now), first = localParts(event.startsAt).date
  const dayMs = 86400000, ordinal = Date.parse(`${local.date}T00:00:00Z`), anchor = Date.parse(`${first}T00:00:00Z`)
  let offset = (ordinal - anchor) / dayMs
  if (local.time < settings.localTime) offset--
  if (offset < 0) return null
  return new Date(anchor + Math.floor(offset / settings.everyDays) * settings.everyDays * dayMs).toISOString().slice(0, 10)
}
function reminderPayload(settings) {
  return { content: settings.roleIds.map(id => `<@&${id}>`).join(' '),
    embeds: [{ color: 0xF39C12, title: '🎃 Spooky Season Is On!',
      description: 'Spend candy on tricks and treats, cause Halloween mischief, and collect Evil Eyes!\n\nUse **/spooky welcome** to get started or **/spooky help** for the rules. Every five Eyes automatically awards a token quarter.' }],
    allowedMentions: { parse: [], roles: [...settings.roleIds], users: [], repliedUser: false } }
}
class NotDue extends Error {}
function createReminders({ models, economy, notifications, guildId, getChannel, event = defaultEvent,
  settings = reminderConfig, clock = () => new Date() }) {
  const approved = validateReminders(settings)
  if (typeof guildId !== 'string' || !guildId.trim() || typeof getChannel !== 'function') throw new Error('Reminder guild/channel adapter required')
  const scope = { eventId: event.eventId, guildId }
  const signature = createHash('sha256').update(JSON.stringify(approved)).digest('hex')
  async function canSend(receipt, now, transaction) {
    if (!event.enabled || latestReminderSlot(now, approved, event) !== receipt.slot || receipt.signature !== signature) return false
    const state = await models.EventState.findOne({ where: scope, transaction })
    return !state?.actionsPaused && !state?.archivedAt
  }
  async function sweep() {
    // Scope through owning operations: notifications do not carry a guild column.
    const pending = await economy.read(async transaction => {
      const owners = await models.Operation.findAll({ where: { ...scope, operationType: 'event_reminder' }, transaction })
      if (!owners.length) return []
      const byId = new Map(owners.map(owner => [owner.operationId, owner]))
      const rows = await models.Notification.findAll({ where: { operationId: { [Op.in]: [...byId.keys()] }, status: 'pending' }, transaction })
      return rows.filter(row => {
        const receipt = byId.get(row.operationId).receipt
        return receipt?.signature !== signature || latestReminderSlot(clock(), approved, event) !== receipt?.slot
      }).map(row => row.id)
    })
    for (const id of pending) await economy.execute({ ...scope, actorId: 'system', workerKey: `reminder-expire:${id}`, operationType: 'reminder_expiry' }, async ctx => {
      const row = await models.Notification.findByPk(id, { transaction: ctx.transaction })
      const owner = row && await models.Operation.findOne({ where: { ...scope, operationId: row.operationId, operationType: 'event_reminder' }, transaction: ctx.transaction })
      if (!owner || row.status !== 'pending') return { cancelled: false }
      if (owner.receipt?.signature === signature && latestReminderSlot(ctx.now, approved, event) === owner.receipt?.slot) throw new NotDue('Reminder became current before expiry')
      await row.update({ status: 'cancelled', lastError: null }, { transaction: ctx.transaction })
      await ctx.record({ userId: 'system', resource: 'notification_cancel', delta: 0,
        metadata: { notificationId: id, ownerOperationId: owner.operationId, reason: 'expired_reminder_slot' } })
      return { cancelled: true, notificationId: id }
    }).catch(error => { if (!(error instanceof NotDue)) throw error })
  }
  async function tick() {
    if (!event.enabled || !approved.enabled) return { skipped: 'disabled' }
    await sweep()
    const slot = latestReminderSlot(clock(), approved, event)
    if (!slot) return { skipped: 'not_due' }
    let result
    try {
      result = await economy.execute({ ...scope, actorId: 'system', workerKey: `reminder:${slot}`, operationType: 'event_reminder' }, async ctx => {
        const receipt = { slot, signature, channelId: approved.channelId, roleIds: approved.roleIds, localTime: approved.localTime }
        if (!await canSend(receipt, ctx.now, ctx.transaction)) throw new NotDue('Reminder paused, closed or no longer due')
        await notifications.enqueue(ctx, approved.channelId, [{ public: true, payload: reminderPayload(approved) }])
        await ctx.record({ userId: 'system', resource: 'event_reminder', delta: 0, metadata: receipt })
        return receipt
      })
    } catch (error) { if (error instanceof NotDue) return { skipped: 'not_due' }; throw error }
    const rows = await economy.read(transaction => models.Notification.findAll({ where: { operationId: result.operationId }, transaction }))
    if (rows.some(row => ['sending', 'uncertain'].includes(row.status))) return { ...result, skipped: 'inspection_required' }
    if (!rows.some(row => row.status === 'pending')) return { ...result, skipped: 'already_resolved' }
    if (!await economy.read(transaction => canSend(result.receipt, clock(), transaction))) return { ...result, skipped: 'not_due' }
    // Channel lookup is outside the transaction. Validate again after lookup:
    // slow network resolution may cross a pause, cadence or event boundary.
    const channel = await getChannel(result.receipt.channelId)
    if (!channel || channel.id !== result.receipt.channelId || channel.guildId !== guildId || typeof channel.send !== 'function') throw new Error('Reminder channel does not belong to the configured guild')
    const delivered = await notifications.deliver(result.operationId, channel, {
      canDeliver: () => economy.read(transaction => canSend(result.receipt, clock(), transaction)),
    })
    await sweep()
    return { ...result, delivered }
  }
  return { tick }
}

function withReminders(maintain, reminders, onError = () => {}) {
  return async key => {
    const result = await maintain(key)
    try { return { ...result, reminder: await reminders.tick() } }
    catch (error) {
      // Reminder channel/network failures must not prevent player actions or
      // undo already committed effect restoration and closure maintenance.
      onError(error)
      return { ...result, reminder: { failed: true } }
    }
  }
}

module.exports = { reminderConfig, validateReminders, latestReminderSlot, reminderPayload, createReminders, withReminders }
