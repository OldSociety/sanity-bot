const config = require('../../config/arena-emojis.json')
const fallback = Object.freeze({ hope: '🟡', fear: '🟣', hopeButton: { name: '🟡' } })
function arenaEmojis(guildId) {
  if (guildId !== config.guildId) return fallback
  const usable = emoji => emoji && /^[0-9]{17,20}$/.test(emoji.id) && /^[A-Za-z0-9_]{2,32}$/.test(emoji.name)
  if (!usable(config.hope) || !usable(config.fear)) return fallback
  const markup = emoji => `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`
  return { hope: markup(config.hope), fear: markup(config.fear), hopeButton: { ...config.hope },
    hopeIcon: `https://cdn.discordapp.com/emojis/${config.hope.id}.png` }
}
module.exports = { arenaEmojis }
