// Illustrative baseline, not implemented game rules. No theft/fate modeled.
const fs = require('fs')
let seed = 20261002
function random() {
  let t = (seed += 0x6d2b79f5)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const profiles = [
  { name: 'Casual', start: 1, min: 3, max: 4, missed: 6 },
  { name: 'Regular', start: 1, min: 6, max: 10, missed: 0 },
  { name: 'Engaged', start: 1, min: 20, max: 20, missed: 0 },
  { name: 'Late October 10', start: 10, min: 20, max: 20, missed: 0 },
  { name: 'Late October 15', start: 15, min: 20, max: 20, missed: 0 },
]
function run(profile) {
  const owned = new Set(), skip = new Set()
  while (skip.size < profile.missed) skip.add(1 + Math.floor(random() * 31))
  const result = { firstQuarter: null, firstBadge: null, threeBadges: null, sevenBadges: null,
    duplicates: 0, exchanges: 0, theftLoss: 0, draws: 0 }
  let candies = 20, eyes = 0, extras = 0
  const grant = (piece, day) => {
    if (owned.has(piece)) { extras++; result.duplicates++ } else owned.add(piece)
    while (extras >= 5 && owned.size < 28) {
      extras -= 5; result.exchanges++
      const missing = Array.from({ length: 28 }, (_, i) => i).filter(i => !owned.has(i))
      owned.add(missing[Math.floor(random() * missing.length)])
    }
    const badges = Array.from({ length: 7 }, (_, token) =>
      [0, 1, 2, 3].every(p => owned.has(token * 4 + p))).filter(Boolean).length
    if (badges >= 1 && result.firstBadge === null) result.firstBadge = day
    if (badges >= 3 && result.threeBadges === null) result.threeBadges = day
    if (badges === 7 && result.sevenBadges === null) result.sevenBadges = day
  }
  for (let day = profile.start; day <= 31; day++) {
    if (day > profile.start) candies = Math.min(40, candies + 20)
    if (skip.has(day)) continue
    const actions = Math.min(candies, profile.min + Math.floor(random() * (profile.max - profile.min + 1)))
    candies -= actions; eyes += actions
    for (let n = 0; n < 4 && eyes >= 5; n++) {
      eyes -= 5; result.draws++
      if (result.firstQuarter === null) result.firstQuarter = day
      const roll = random(), position = roll < 0.7 ? Math.floor(random() * 2) : roll < 0.92 ? 2 : 3
      grant(Math.floor(random() * 7) * 4 + position, day)
    }
  }
  return { ...result, candies, eyes, extras, uniquePieces: owned.size }
}
function median(values) {
  values.sort((a, b) => a - b)
  return values[Math.floor((values.length - 1) / 2)] ?? null
}
const summaries = profiles.map(profile => {
  const runs = Array.from({ length: 5000 }, () => run(profile))
  const milestones = Object.fromEntries(['firstQuarter', 'firstBadge', 'threeBadges', 'sevenBadges'].map(key => {
    const achieved = runs.filter(r => r[key] !== null)
    return [key, { achievedPercent: +(100 * achieved.length / runs.length).toFixed(2),
      conditionalMedianOctoberDay: median(achieved.map(r => r[key])) }]
  }))
  const averages = Object.fromEntries(['draws', 'duplicates', 'exchanges', 'theftLoss', 'candies', 'eyes', 'extras', 'uniquePieces']
    .map(key => [key, +(runs.reduce((s, r) => s + r[key], 0) / runs.length).toFixed(2)]))
  return { profile, milestones, averages }
})
const output = { seed: 20261002, trialsPerProfile: 5000,
  assumptions: '20 starting candy, capacity 40, 20/day refill; 1 Eye/action; 5 Eyes/draw; max 4 paid draws/day; 70/22/8 rarity; automatic five-extra exchange; no theft, fate, targeting, or protection; late joiners receive normal starting candy, not catch-up; daily discrete refill approximation; continue drawing after completion, preserve post-completion extras', summaries }
fs.writeFileSync('docs/spooky-cohort-results.json', JSON.stringify(output, null, 2) + '\n')
console.log(JSON.stringify(summaries, null, 2))
