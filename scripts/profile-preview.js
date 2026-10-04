// Synthetic offline preview: never opens a database or contacts Discord.
const fs = require('node:fs/promises')
const path = require('node:path')
const sharp = require('sharp')
const { renderProfileCard } = require('../services/profile-card')
async function main() {
  const avatar = await sharp(Buffer.from('<svg width="200" height="200"><rect width="200" height="200" fill="#0d2029"/><circle cx="100" cy="74" r="38" fill="#658c9e"/><ellipse cx="100" cy="176" rx="68" ry="56" fill="#658c9e"/></svg>')).png().toBuffer()
  // This generic example has no ownership records. Never seed badges to fill slots.
  const buffer = await renderProfileCard({ displayName: 'Example Player', username: 'example.player', avatar, isAdmin: true,
    user: { chat_level: 27, chat_exp: 3000, fate_points: 75, bank: 40 }, badges: [] })
  const output = path.resolve(__dirname, '../artifacts/profile-card-preview.png')
  await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, buffer)
  console.log(output)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
