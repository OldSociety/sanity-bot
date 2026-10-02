const { config: defaultConfig } = require('./config')

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
function roll(random) {
  const value = random()
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Random value must be in [0, 1)')
  return value
}
function transformMessage(content, mode, random = Math.random) {
  if (mode === 'reverse') return [...segmenter.segment(content)].map(part => part.segment).reverse().join('')
  if (mode !== 'shuffle') throw new Error('Unknown curse transformation')
  const words = content.trim().split(/\s+/u)
  for (let i = words.length - 1; i > 0; i--) {
    const j = Math.floor(roll(random) * (i + 1))
    ;[words[i], words[j]] = [words[j], words[i]]
  }
  return words.join(' ')
}
function planCursedMessage({ content, username, cursed, bot = false, hasAttachments = false,
  isReply = false, event = defaultConfig, now = new Date(), random = Math.random }) {
  // Preserve richer messages intact until an adapter can retain their context.
  if (!event.enabled || now < new Date(event.startsAt) || now >= new Date(event.endsAt)
    || !cursed || bot || hasAttachments || isReply || typeof content !== 'string' || !content.trim()) return null
  if (roll(random) >= event.curse.messageTransformPercent / 100) return null
  const mode = roll(random) < event.curse.messageReversePercent / 100 ? 'reverse' : 'shuffle'
  const transformed = transformMessage(content, mode, random)
  if (!transformed.trim() || transformed.length > 4096) return null
  return { mode, payload: { allowedMentions: { parse: [], users: [], roles: [], repliedUser: false },
    embeds: [{ title: 'Cursed Message!', description: transformed, color: 0xff0000,
      footer: { text: `${String(username || 'A player').replace(/[\r\n]/g, ' ').slice(0, 100)} is cursed` } }] } }
}

async function deliverCursedMessage({ plan, sendReplacement, deleteOriginal }) {
  if (!plan) return { delivered: false, originalDeleted: false }
  // A failed send leaves the original untouched; never send a raw fallback.
  const replacement = await sendReplacement(plan.payload)
  try {
    await deleteOriginal()
    return { delivered: true, originalDeleted: true, replacementId: replacement.id }
  } catch {
    // The replacement exists; preserving both is safer than retrying deletion/send.
    return { delivered: true, originalDeleted: false, replacementId: replacement.id }
  }
}

module.exports = { transformMessage, planCursedMessage, deliverCursedMessage }
