// Reconstruct code/config only from the verified activation backup, never DBs.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const source = 'config/backups/arena-skin-explanations-live'
const target = 'artifacts/arena-hendrix/production-baseline'
const manifest = require('../config/backups/arena-skin-explanations-live/manifest.json')
for (const [file, expected] of Object.entries(manifest.sourceHashes)) {
  if (
    !file.startsWith('services/arena/') &&
    !(file.startsWith('config/arena-') && file.endsWith('.json'))
  )
    continue
  const bytes = fs.readFileSync(path.join(source, file))
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== expected)
    throw Error(`Backup integrity: ${file}`)
  fs.mkdirSync(path.dirname(path.join(target, file)), { recursive: true })
  fs.writeFileSync(path.join(target, file), bytes)
}
fs.copyFileSync('config/badges.json', path.join(target, 'config/badges.json'))
const result = JSON.parse(
  execFileSync(
    process.execPath,
    [
      'tests/fixtures/arena-current-profile.cjs',
      'production',
      path.resolve(target),
    ],
    { maxBuffer: 30 * 1024 * 1024, encoding: 'utf8' }
  )
)
const hashes = Object.fromEntries(
  Object.entries(result).map(([key, value]) => [
    key,
    crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'),
  ])
)
fs.writeFileSync(
  'tests/fixtures/arena-production-before-hendrix.json',
  JSON.stringify(
    {
      source:
        'Verified arena-skin-explanations-live activation backup, October 19',
      stateCount: result.states.length,
      viewCount: result.views.length,
      hashes,
    },
    null,
    2
  ) + '\n'
)
console.log(
  'Frozen production baseline saved:',
  result.states.length,
  'states,',
  result.views.length,
  'views'
)
