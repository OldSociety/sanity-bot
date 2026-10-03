// Explicit production runner; no target overrides or destructive rollback.
const tools = require('../services/spooky/storage-tools')
function parseArguments(args, environment = process.env.NODE_ENV) {
  if (environment !== 'production') throw new Error('NODE_ENV must explicitly be production')
  if (args.filter(arg => arg === '--production').length !== 1 || args.includes('--development')) throw new Error('Use --production explicitly')
  return require('./spooky-storage').parseArguments(args.map(arg => arg === '--production' ? '--development' : arg), 'development')
}
async function main(args = process.argv.slice(2)) {
  const parsed = parseArguments(args)
  const target = await tools.selectProductionTarget({ environment: 'production' })
  if (parsed.command === 'status') return tools.inspectDatabase(target)
  if (parsed.command === 'plan') return tools.createMigrationPlan(await tools.inspectDatabase(target), parsed)
  if (parsed.command === 'apply') return tools.applyMigrations(target, parsed)
  return tools.createBackup(target, parsed)
}
if (require.main === module) main().then(report => console.log(JSON.stringify(report, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1 })
module.exports = { parseArguments, main }
