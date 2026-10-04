const { createHash } = require('node:crypto')
const pools = require('../../config/spooky-gifs.json')
// Reuse the reviewed media library for new outcomes while preserving the
// channel's shared animation budget and recent-asset rotation.
const aliases = { candy_raid: 'great_heist', bag_swap: 'reverse_nickname', bag_explosion: 'curse_distribute_three',
  sticky_fingers: 'steal_candy', reverse_robbery: 'curse_backfire', candy_ransom: 'great_heist',
  boo: 'curse_distribute_two', candy_shakedown: 'steal_candy', trick_chain: 'great_heist', marked_for_mischief: 'curse_target' }
const sample = key => createHash('sha256').update(key).digest().readUInt32BE(0) / 0x100000000
function withActionGif(receipt, messages, { operationId, routinePercent = 10, excludedIds = [] }) {
  const result = receipt.result || receipt
  if (!['trick', 'treat'].includes(receipt.action) || result.noEffect || !operationId) return messages
  const outcome = result.goodwillFreedUserId || result.protectionBrokeCurse || result.bagRepairedUserId ? 'break_curse'
    : result.found ? 'find_eye' : result.fallback === 'ordinary_theft' ? 'steal_candy' : aliases[receipt.outcome] || receipt.outcome
  // Empty-target break-curse is a normal gift; a fallback never claims a win.
  const category = outcome === 'break_curse' && !result.freedUserId && !result.goodwillFreedUserId && !result.bagRepairedUserId ? 'standard_gift' : outcome
  const crownCapture = receipt.outcome === 'steal_crown' && result.crownWon === true
  const pool = pools[category]?.filter(id => crownCapture || !excludedIds.includes(id))
  // All eligible results share the rate, including significant wins: a busy
  // channel must not bypass the animation budget whenever curses are rolled.
  if (!pool?.length || !crownCapture && sample(`spooky-gif:chance:${operationId}`) >= routinePercent / 100) return messages
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
  if (receipt.outcome === 'steal_crown' && (receipt.result || receipt).crownWon) return candidate
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
