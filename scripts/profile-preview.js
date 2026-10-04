// Synthetic offline preview: never opens a database or contacts Discord.
const fs = require('node:fs/promises')
const path = require('node:path')
const sharp = require('sharp')
const { renderProfileCard } = require('../services/profile-card')
async function main() {
  const avatar = await sharp(Buffer.from('<svg width="200" height="200"><rect width="200" height="200" fill="#25223f"/><circle cx="100" cy="74" r="38" fill="#baa0f1"/><ellipse cx="100" cy="176" rx="68" ry="56" fill="#baa0f1"/></svg>')).png().toBuffer()
  const buffer = await renderProfileCard({ displayName: 'Headmaster', username: 'headmaster', avatar, isAdmin: true,
    user: { chat_level: 27, chat_exp: 3000, fate_points: 75, bank: 40 }, badges: [
      { name: 'Marq', imageAsset: 'SPOOKY_MARQ_BADGE.png' },
      { name: 'Selene', imageAsset: 'SPOOKY_SELENE_BADGE.png' }, { name: 'Hadley' },
      ...['Maxim','Niklaus','Qam','Hellfed Marq','Future 1','Future 2','Future 3'].map(name => ({ name })),
    ] })
  const output = path.resolve(__dirname, '../artifacts/profile-card-preview.png')
  await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, buffer)
  console.log(output)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
