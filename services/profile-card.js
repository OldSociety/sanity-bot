const path = require('node:path')
const fs = require('node:fs/promises')
const sharp = require('sharp')

const WIDTH = 1200, HEIGHT = 480, MAX_BADGES = 10
const assetRoot = path.resolve(__dirname, '../assets')
const xml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char])
const clean = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim()
const initial = value => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(clean(value))][0]?.segment || '?'
const truncate = (value, length) => {
  const parts = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(clean(value))].map(part => part.segment)
  return parts.length > length ? parts.slice(0, length - 1).join('') + '…' : parts.join('')
}
function progression(user = {}) {
  const level = Number.isSafeInteger(user.chat_level) && user.chat_level >= 1 ? user.chat_level : 1
  const required = 5 * level ** 2 + 50 * level + 100
  const xp = Number.isFinite(user.chat_exp) && user.chat_exp >= 0 ? user.chat_exp : 0
  return { level, xp, required, fraction: Math.min(1, xp / required) }
}
function recentBadges(rows, catalog) {
  return rows.filter(row => catalog.some(badge => badge.id === row.badgeId))
    .sort((a, b) => new Date(b.awardedAt) - new Date(a.awardedAt) || a.badgeId.localeCompare(b.badgeId))
    .slice(0, MAX_BADGES).map(row => ({ ...catalog.find(badge => badge.id === row.badgeId), awardedAt: row.awardedAt }))
}

// Only Discord-owned image endpoints are fetched. Bound downloads and decoding;
// an unavailable avatar/emoji is cosmetic and falls back to an initial.
async function discordImage(url, fetcher = fetch) {
  if (!url) return null
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(parsed.hostname) ||
    !/^\/(avatars|guilds|embed\/avatars|emojis)\//.test(parsed.pathname)) return null
  const response = await fetcher(parsed.href, { signal: AbortSignal.timeout(4000), redirect: 'error' })
  if (!response.ok || Number(response.headers.get('content-length')) > 4 * 1024 * 1024) return null
  const chunks = []; let size = 0
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > 4 * 1024 * 1024) { await response.body.cancel?.().catch(() => {}); return null }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}
const svg = content => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">${content}</svg>`)
async function circle(input, size) {
  return sharp(input, { limitInputPixels: 16 * 1024 * 1024 }).resize(size, size, { fit: 'cover' })
    .composite([{ input: Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`), blend: 'dest-in' }]).png().toBuffer()
}
async function label(value, font, width) {
  const input = await sharp({ text: { text: `<span foreground="#e8f0f3">${xml(clean(value)) || 'Player'}</span>`, font, rgba: true, dpi: 72 } }).png().toBuffer()
  const meta = await sharp(input).metadata()
  return sharp(input).resize({ width: Math.min(width, meta.width), withoutEnlargement: true }).png().toBuffer()
}
async function renderProfileCard({ displayName, username, user = {}, avatar, badges = [], badgesUnavailable = false, isAdmin = false,
  background = path.join(assetRoot, 'profile-backgrounds/default/blackhole.png') }) {
  const progress = progression(user), overlays = []
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0
  const number = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value)
  const text = (x, y, size, value, color = '#e8f0f3', weight = 400) => `<text x="${x}" y="${y}" font-family="Segoe UI, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${xml(value)}</text>`
  const badgeMarkup = badges.slice(0, MAX_BADGES).map((badge, i) => {
    const x = 288 + i * 86
    return `<circle cx="${x}" cy="391" r="27" fill="#0d2029" stroke="#4f7f91" stroke-opacity=".6"/>` +
      text(x - 8, 400, 25, initial(badge.name), '#aecbd6', 600) +
      `<text x="${x}" y="440" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="12" fill="#bdced5">${xml(truncate(badge.name, 10))}</text>`
  }).join('')
  const layout = svg(`<defs>
    <linearGradient id="shade"><stop stop-color="#031827" stop-opacity=".72"/><stop offset=".60" stop-color="#071923" stop-opacity=".38"/><stop offset="1" stop-color="#170e16" stop-opacity=".18"/></linearGradient>
    <linearGradient id="bar"><stop stop-color="#36758c"/><stop offset="1" stop-color="#9b283d"/></linearGradient>
  </defs><rect width="1200" height="480" fill="url(#shade)"/>
  <rect x="20" y="20" width="1160" height="440" rx="25" fill="none" stroke="#527f91" stroke-opacity=".40"/>
  ${isAdmin ? '<text x="1118" y="62" text-anchor="end" font-family="Segoe UI, sans-serif" font-size="14" font-weight="600" fill="#c5dce5">ADMIN</text>' : ''}
  <circle cx="140" cy="184" r="92" fill="#0d2029" stroke="#527f91" stroke-width="2"/>
  ${text(120, 200, 45, initial(displayName || username || 'P'), '#aecbd6', 600)}
  <rect x="54" y="298" width="172" height="42" rx="21" fill="#527f91" fill-opacity=".20"/>
  <text x="140" y="325" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="16" fill="#c5dce5">LEVEL ${progress.level}</text>
  ${text(260, 143, 18, '@' + truncate(username || 'player', 40), '#b1c4cd')}
  ${text(260, 193, 13, 'FATE POINTS', '#b1c4cd', 600)}
  ${text(260, 231, 30, number(count(user.fate_points)), '#e8f0f3', 600)}
  ${text(446, 193, 13, 'BANK', '#b1c4cd', 600)}
  ${text(446, 231, 30, number(count(user.bank)), '#e8f0f3', 600)}
  ${text(632, 193, 13, 'TOTAL AVAILABLE', '#b1c4cd', 600)}
  ${text(632, 231, 30, number(count(user.fate_points) + count(user.bank)), '#e8f0f3', 600)}
  <text x="1118" y="272" text-anchor="end" font-family="Segoe UI, sans-serif" font-size="14" fill="#c5dce5">LEVEL ${progress.level + 1}</text>
  <rect x="260" y="288" width="858" height="16" rx="8" fill="#527f91" fill-opacity=".30"/>
  ${progress.fraction > 0 ? `<rect x="260" y="288" width="${858 * progress.fraction}" height="16" rx="${Math.min(8, 429 * progress.fraction)}" fill="url(#bar)"/>` : ''}
  ${text(260, 348, 12, 'RECENT UNLOCKS', '#b1c4cd', 600)}
  ${badgeMarkup || text(260, 402, 18, badgesUnavailable ? 'Badges temporarily unavailable' : 'No badges unlocked yet.', '#a3bac4')}`)
  const name = await label(truncate(displayName || username || 'Player', 48), 'Segoe UI Bold 38', 820)
  // Text rasterization preserves Unicode names and measures before fitting.
  overlays.push({ input: layout }, { input: name, left: 260, top: 73 })
  if (avatar) try { overlays.push({ input: await circle(avatar, 172), left: 54, top: 98 }) } catch {}
  await Promise.all(badges.slice(0, MAX_BADGES).map(async (badge, i) => {
    let input = badge.image
    if (!input && badge.imageAsset && path.basename(badge.imageAsset) === badge.imageAsset) {
      input = await fs.readFile(path.join(assetRoot, 'badges', 'Spooky', badge.imageAsset)).catch(() => null)
    }
    if (input) try { overlays.push({ input: await circle(input, 48), left: 264 + i * 86, top: 367 }) } catch {}
  }))
  return sharp(background).resize(WIDTH, HEIGHT, { fit: 'cover' }).composite(overlays).png().toBuffer()
}
module.exports = { renderProfileCard, progression, recentBadges, discordImage, WIDTH, HEIGHT }
