const { createHash } = require('node:crypto')
const pools = require('../../config/spooky-gifs.json')
const sample = key => createHash('sha256').update(key).digest().readUInt32BE(0) / 0x100000000
function withActionGif(receipt, messages, { operationId, routinePercent = 10, excludedIds = [] }) {
  const result = receipt.result || receipt
  if (!['trick', 'treat'].includes(receipt.action) || result.noEffect || !operationId) return messages
  const outcome = result.goodwillFreedUserId || result.protectionBrokeCurse ? 'break_curse' : result.found ? 'find_eye' : receipt.outcome
  // Empty-target break-curse is a normal gift; a fallback never claims a win.
  const category = outcome === 'break_curse' && !result.freedUserId && !result.goodwillFreedUserId ? 'standard_gift' : outcome
  const pool = pools[category]?.filter(id => !excludedIds.includes(id))
  // All eligible results share the rate, including significant wins: a busy
  // channel must not bypass the animation budget whenever curses are rolled.
  if (!pool?.length || sample(`spooky-gif:chance:${operationId}`) >= routinePercent / 100) return messages
  const id = pool[Math.floor(sample(`spooky-gif:asset:${operationId}`) * pool.length)]
  if (!/^[a-zA-Z0-9]+$/.test(id)) throw new Error('Invalid configured GIF asset')
  // Only the primary public gameplay embed. Art reveals and private screens
  // never gain a GIF; the committed outbox freezes this cosmetic choice.
  return messages.map((message, index) => index !== 0 || !message.public ? message : {
    ...message, payload: { ...message.payload, embeds: message.payload.embeds.map((embed, i) =>
      i !== 0 || embed.image ? embed : { ...embed, image: { url: `https://media.giphy.com/media/${id}/giphy.gif` } }) },
  })
}
async function withRecentActionGif(receipt, messages, options, { models, ctx, channelId }) {
  const candidate = withActionGif(receipt, messages, options)
  if (!models?.Notification || !candidate[0]?.payload?.embeds?.[0]?.image || messages[0]?.payload?.embeds?.[0]?.image) return candidate
  // Read committed/reserved presentations in the same serialized root
  // transaction. No in-memory cooldown, extra gameplay RNG or Discord call.
  const recent = await models.Notification.findAll({ where: { channelId }, attributes: ['payload', 'status'],
    order: [['id', 'DESC']], limit: 100, transaction: ctx.transaction })
  const ids = recent.filter(row => row.status !== 'cancelled').flatMap(row =>
    (row.payload.embeds || []).map(embed => embed.image?.url?.match(/^https:\/\/media\.giphy\.com\/media\/([A-Za-z0-9]+)\/giphy\.gif$/)?.[1]).filter(Boolean))
  return withActionGif(receipt, messages, { ...options, excludedIds: [...new Set(ids)].slice(0, 2) })
}
module.exports = { withActionGif, withRecentActionGif, pools }
