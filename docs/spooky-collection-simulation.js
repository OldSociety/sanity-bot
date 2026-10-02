// Planning model only. No bot, database, dependencies, or network access.
// Run: node docs/spooky-collection-simulation.js
let seed = 20261001
function random() {
  let t = (seed += 0x6d2b79f5)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
function completeCollection() {
  const owned = new Set()
  let duplicates = 0
  let draws = 0
  while (owned.size < 28) {
    draws++
    const roll = random()
    const position = roll < 0.7 ? Math.floor(random() * 2) : roll < 0.92 ? 2 : 3
    const piece = Math.floor(random() * 7) * 4 + position
    if (owned.has(piece)) duplicates++
    else owned.add(piece)
    while (duplicates >= 5 && owned.size < 28) {
      duplicates -= 5
      const missing = Array.from({ length: 28 }, (_, i) => i).filter((i) => !owned.has(i))
      owned.add(missing[Math.floor(random() * missing.length)])
    }
  }
  return draws
}
const results = Array.from({ length: 10000 }, completeCollection).sort((a, b) => a - b)
const percentile = (p) => results[Math.floor((results.length - 1) * p)]
console.log(JSON.stringify({
  seed: 20261001,
  trials: results.length,
  weights: { common: 0.7, rare: 0.22, legendary: 0.08 },
  mean: results.reduce((a, b) => a + b, 0) / results.length,
  p50: percentile(0.5), p90: percentile(0.9),
  p95: percentile(0.95), p99: percentile(0.99),
  completionAt60: results.filter((n) => n <= 60).length / results.length,
  completionAt70: results.filter((n) => n <= 70).length / results.length,
  completionAt80: results.filter((n) => n <= 80).length / results.length,
}, null, 2))
