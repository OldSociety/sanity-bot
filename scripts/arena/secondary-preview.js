// Render a fixed UI fixture; never starts the bot or a combat exchange.
process.env.NODE_ENV = 'development'
const fs = require('node:fs/promises')
const path = require('node:path')
const { resolveCharacter } = require('../../services/arena/characters')
const { renderHealthCard } = require('../../services/arena/health-card')
async function main() {
  const character = resolveCharacter('classic:kyl')
  const opponent = resolveCharacter('classic:azu')
  const actor = art => ({ kit: art.kit, name: art.name, hp: 200, maxHp: 220,
    stress: 6, maxStress: 6, hope: 0, fear: 0 })
  const card = await renderHealthCard({ character, opponent: opponent.id,
    secondaryId: 'classic:hen', battle: { player: actor(character), enemy: actor(opponent) } })
  const directory = path.resolve(__dirname, '../../artifacts/arena-secondary')
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(path.join(directory, 'preview.png'), card.attachment)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
