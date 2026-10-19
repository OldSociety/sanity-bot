// Fixed presentation fixtures only: never invokes the combat engine or Discord.
const fs = require('node:fs/promises')
const path = require('node:path')
const { performance } = require('node:perf_hooks')
const sharp = require('sharp')
const { resolveCharacter } = require('../../services/arena/characters')
const { statsForLevel } = require('../../services/arena/rules')
const {
  renderHealthCard,
  renderStats,
} = require('../../services/arena/health-card')
const { portraitCacheStats } = require('../../services/arena/portrait')

async function main() {
  const directory = path.resolve(__dirname, '../../artifacts/arena-performance')
  await fs.mkdir(directory, { recursive: true })
  const character = resolveCharacter('marq'),
    opponent = resolveCharacter('maxim')
  const actor = (art) => {
    const stats = statsForLevel(1, art.kit)
    return {
      ...stats,
      hp: stats.maxHp,
      kit: art.kit,
      name: art.name,
      label: art.label,
      stress: 6,
      maxStress: 6,
      hope: 0,
      fear: 0,
    }
  }
  const state = {
    character,
    opponent: opponent.id,
    battle: {
      player: actor(character),
      enemy: { ...actor(opponent), isAI: true },
    },
  }
  const rows = []
  for (const [index, ratio] of [1, 0.8, 0.55, 0.3, 0.1].entries()) {
    state.battle.player.hp = Math.floor(state.battle.player.maxHp * ratio)
    let began = performance.now()
    const legacy = await renderHealthCard(state, { optimized: false })
    const legacyMs = performance.now() - began
    began = performance.now()
    const cached = await renderHealthCard(state, { optimized: true })
    const cachedMs = performance.now() - began
    const before = await sharp(legacy.attachment).raw().toBuffer()
    const after = await sharp(cached.attachment).raw().toBuffer()
    if (!before.equals(after)) throw Error(`Pixel mismatch on fixture ${index}`)
    rows.push({
      fixture: index,
      legacyMs: Math.round(legacyMs),
      cachedMs: Math.round(cachedMs),
      identicalPixels: true,
      pngBytes: cached.attachment.length,
    })
    if (index === 2)
      await fs.writeFile(
        path.join(directory, 'fixed-card.png'),
        cached.attachment
      )
  }
  const mean = (items, key) =>
    Math.round(items.reduce((sum, item) => sum + item[key], 0) / items.length)
  const result = {
    scope:
      'Render-only fixed fixtures; no combat, Discord calls, live state or database access',
    environment: process.env.NODE_ENV,
    rows,
    warmMeans: {
      legacyMs: mean(rows.slice(1), 'legacyMs'),
      cachedMs: mean(rows.slice(1), 'cachedMs'),
    },
    rendering: renderStats(),
    portraits: portraitCacheStats(),
    caveat:
      'Single sequential process on this host, five fixtures; excludes Discord upload/delivery and concurrent-player latency.',
  }
  await fs.writeFile(
    path.join(directory, 'render-benchmark.json'),
    JSON.stringify(result, null, 2)
  )
  console.log(JSON.stringify(result))
}
main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
