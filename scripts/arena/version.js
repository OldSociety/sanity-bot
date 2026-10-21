// Read-only candidate inspection; actual activation is registered by the bot.
const environment = process.argv[2]
if (!['development', 'production'].includes(environment)) {
  console.error('Usage: node scripts/arena/version.js development|production')
  process.exit(1)
}
process.env.NODE_ENV = environment
const { capture } = require('../../services/arena/versioning')
const candidate = capture()
console.log(JSON.stringify({ environment, release: candidate.release,
  buildHash: candidate.buildHash, rulesHash: candidate.rulesHash,
  sourceFiles: Object.keys(candidate.sources).length,
  note: 'Read-only preview; identifiers are assigned at bot activation.' }, null, 2))
