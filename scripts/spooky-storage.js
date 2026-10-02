const { selectDevelopmentTarget, inspectDatabase, createBackup, createMigrationPlan, applyMigrations } = require('../services/spooky/storage-tools')

function parseArguments(args, environment = process.env.NODE_ENV) {
  const [command, ...flags] = args
  const allowed = { status: ['--development'], backup: ['--development', '--confirm-stopped'],
    plan: ['--development', '--adopt-matching'], apply: ['--development', '--confirm-stopped', '--adopt-matching', '--plan-hash'] }[command]
  const seen = new Set(), values = {}
  if (!allowed) throw new Error('Use status, backup, plan or apply with --development; no target overrides')
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i]
    if (!allowed.includes(flag) || seen.has(flag)) throw new Error('Use only supported, unique flags; no target overrides')
    seen.add(flag)
    if (flag === '--plan-hash') {
      values.planHash = flags[++i]
      if (!/^[a-f0-9]{64}$/.test(values.planHash || '')) throw new Error('Apply requires a reviewed 64-character plan hash')
    }
  }
  if (!seen.has('--development')) throw new Error('Use --development explicitly')
  if (environment !== undefined && environment !== 'development') throw new Error('Inherited NODE_ENV must be development or unset')
  if (['backup', 'apply'].includes(command) && !seen.has('--confirm-stopped')) throw new Error('Backup/apply requires --confirm-stopped')
  if (command === 'apply' && !values.planHash) throw new Error('Apply requires --plan-hash')
  return { command, confirmStopped: seen.has('--confirm-stopped'),
    ...(['plan', 'apply'].includes(command) ? { adoptMatching: seen.has('--adopt-matching'), ...values } : {}) }
}
async function main(args = process.argv.slice(2)) {
  const parsed = parseArguments(args)
  const target = await selectDevelopmentTarget({ environment: 'development' })
  if (parsed.command === 'status') return inspectDatabase(target)
  if (parsed.command === 'plan') return createMigrationPlan(await inspectDatabase(target), parsed)
  if (parsed.command === 'apply') return applyMigrations(target, parsed)
  return createBackup(target, parsed)
}
if (require.main === module) main().then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
module.exports = { parseArguments, main }
