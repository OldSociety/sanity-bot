// Offline examples. Sanity balances are illustrative, never earned or persisted.
const fs = require('node:fs/promises'), path = require('node:path'), sharp = require('sharp')
const { renderProfileCard } = require('../services/profile-card')
const { eyeSvg, stages } = require('../services/sanity-eye')
async function main() {
  const root = path.resolve(__dirname, '../artifacts/profile-occasions'), assets = path.resolve(__dirname, '../assets/sanity')
  await fs.mkdir(root, { recursive: true }); await fs.mkdir(assets, { recursive: true })
  for (const stage of stages) {
    await fs.writeFile(path.join(assets, `blackhole-${stage}.svg`), eyeSvg(stage))
    await fs.writeFile(path.join(assets, `blackhole-${stage}.png`), await sharp(Buffer.from(eyeSvg(stage))).png().toBuffer())
  }
  const avatar = await sharp(Buffer.from('<svg width="200" height="200"><rect width="200" height="200" fill="#0d2029"/><circle cx="100" cy="74" r="38" fill="#658c9e"/><ellipse cx="100" cy="176" rx="68" ry="56" fill="#658c9e"/></svg>')).png().toBuffer()
  const shared = { displayName: 'Example Player', username: 'example.player', avatar, isAdmin: true, badges: [], sanity: { balance: 100, maximum: 100 } }
  const examples = [
    { occasion: 'profile', user: { chat_level: 27, chat_exp: 3000, fate_points: 100, bank: 63 } },
    { occasion: 'level-up', sanity: { balance: 100, beforeBalance: 98, maximum: 100 }, before: { chat_level: 27, fate_points: 95, bank: 63 }, user: { chat_level: 28, chat_exp: 250, fate_points: 100, bank: 63 } },
    { occasion: 'birthday', before: { fate_points: 100, bank: 63 }, user: { chat_level: 28, chat_exp: 250, fate_points: 100, bank: 73 } },
  ]
  for (const example of examples) await fs.writeFile(path.join(root, `${example.occasion}.png`), await renderProfileCard({ ...shared, ...example }))
  const samples = [100, 60, 40, 15, 0]
  const panels = await Promise.all(samples.map(async (balance, i) => {
    const input = await renderProfileCard({ ...shared, ...examples[0], isAdmin: false, sanity: { balance, maximum: 100 } })
    return { input: await sharp(input).extract({ left: 904, top: 18, width: 280, height: 180 }).png().toBuffer(), left: i * 280, top: 0 }
  }))
  const strip = await sharp({ create: { width: 1400, height: 180, channels: 4, background: '#091a25' } }).composite(panels).png().toBuffer()
  await fs.writeFile(path.join(root, 'sanity-stages.png'), strip)
  console.log(root)
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
