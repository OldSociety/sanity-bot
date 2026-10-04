const { Op } = require('sequelize')
const { createHash } = require('node:crypto')
const noMentions = { parse: [], users: [], roles: [], repliedUser: false }
// Cosmetic selection does not consume trick/treat/quarter RNG. Its committed
// decision is stable for this operation/recipient even after restart/replay.
function selectionRoll({ operationId, userId }) {
  return createHash('sha256').update(`recipient-mention:${operationId}:${userId}`).digest().readUInt32BE(0) / 0x100000000
}
async function reserveRecipientMentions({ models, ctx, actorId, userIds, registeredIds, settings, random = selectionRoll, names = {} }) {
  const allowed = [], cutoff = new Date(ctx.now.getTime() - settings.windowMs)
  for (const userId of new Set(userIds)) {
    if (!userId || userId === actorId) continue
    // Count legacy daily reservations too: rollout or registration cannot reset
    // the existing allowance. An entry exactly 72 hours old has expired.
    const rows = await models.Ledger.findAll({ where: { ...ctx.scope, userId, resource: 'recipient_mention',
      timestamp: { [Op.gt]: cutoff } }, attributes: ['timestamp'], transaction: ctx.transaction })
    const registered = registeredIds.has(userId), limit = registered ? settings.registeredLimit : settings.unregisteredLimit
    const last = rows.reduce((value, row) => Math.max(value, new Date(row.timestamp).getTime()), -Infinity)
    if (rows.length >= limit || (registered && ctx.now.getTime() - last < settings.registeredMinIntervalMs)) continue
    const sample = random({ operationId: ctx.operationId, userId })
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new Error('Invalid recipient mention random value')
    if (sample * 100 >= settings.chancePercent) continue
    await ctx.record({ userId, resource: 'recipient_mention', delta: 0,
      metadata: { reservedAt: ctx.now.toISOString(), registered, limit, windowMs: settings.windowMs, ordinal: 0, embedOnly: true } })
    allowed.push(userId)
  }
  return { allowed, reservation: { operationId: ctx.operationId, ordinal: 0,
    expiresAt: new Date(ctx.now.getTime() + settings.windowMs).toISOString(),
    names: Object.fromEntries(allowed.map(id => [id, names[id] || 'A player'])) } }
}
function prepareMentionPayload(payload, { operationId, ordinal, now = new Date() } = {}) {
  const { _spookyMentions: reservation, ...clean } = payload
  if (!reservation) return clean
  // Remove the old recipient-only content line from pre-update queued messages,
  // too. Embed mentions are visual references; never authorize notification pings.
  if (typeof clean.content === 'string' && /^(?:<@!?\d+>\s*)+$/.test(clean.content)) delete clean.content
  clean.allowedMentions = noMentions
  const expiry = Date.parse(reservation.expiresAt)
  if (reservation.operationId === operationId && reservation.ordinal === ordinal && Number.isFinite(expiry) && new Date(now).getTime() < expiry) return clean
  const replace = value => typeof value === 'string' ? value.replace(/<@!?(\d+)>/g, (_match, id) => require('../display-name').safeName(reservation.names?.[id] || 'A player')) : value
  // A copied or expired reservation cannot visually mention the player again.
  return { ...clean, embeds: clean.embeds?.map(embed => ({ ...embed, description: replace(embed.description),
    ...(embed.fields ? { fields: embed.fields.map(field => ({ ...field, value: replace(field.value) })) } : {}) })) }
}
module.exports = { selectionRoll, reserveRecipientMentions, prepareMentionPayload }
