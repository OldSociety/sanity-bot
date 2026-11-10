// The achievement preview's established four-tile appearance, with a text fallback.
function progressBar(value, target, emojis = {}) {
  const fraction = Math.max(0, Math.min(1, target > 0 ? value / target : 0))
  const filled = Math.round(fraction * 4)
  const names = [filled > 0 ? 'PB1C' : 'PB1E', filled > 1 ? 'PB2C' : 'PB2E',
    filled > 2 ? 'PB2C' : 'PB2E', filled === 4 ? 'PB3F' : 'PB3E']
  const pieces = names.map(name => emojis[name])
  if (pieces.every(Boolean)) return pieces.map(emoji => `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`).join('')
  const blocks = Math.round(fraction * 10)
  return `${'█'.repeat(blocks)}${'░'.repeat(10 - blocks)}`
}
module.exports = { progressBar }
