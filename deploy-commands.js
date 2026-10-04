const fs = require('node:fs'), path = require('node:path'), { createHash, randomUUID } = require('node:crypto')
const { inventory, commandFiles } = require('./services/command-registry')
function parseArgs(args) {
  if (!args.length || (args.length === 1 && args[0] === '--plan')) return { mode: 'plan' }
  if (args.length === 1 && args[0] === '--check-target') return { mode: 'check' }
  if (args.length === 2 && args[0] === '--apply' && /^[a-f0-9]{64}$/.test(args[1])) return { mode: 'apply', hash: args[1] }
  throw new Error('Usage: deploy-commands.js [--check-target | --plan | --apply <reviewed SHA-256>]')
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]))
  return value
}
const identity = item => `${item.type ?? 1}:${item.name}`
function deploymentPlan(runtime, desired, live) {
  if (!Array.isArray(live) || live.some(item => !item?.name || ![1, 2, 3].includes(item.type ?? 1)) || new Set(live.map(identity)).size !== live.length) throw new Error('Invalid live command snapshot')
  const sort = rows => rows.slice().sort((a, b) => identity(a).localeCompare(identity(b)))
  const snapshot = canonical({ environment: runtime.env, guildId: runtime.guildId, clientId: runtime.clientId, desired: sort(desired), live: sort(live) })
  return { ...snapshot, removals: live.filter(item => !desired.some(next => identity(next) === identity(item))).map(identity).sort(),
    planHash: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex') }
}
function offlineDefinitions(root, environment, now = Date.now()) {
  const { definition } = require('./scripts/command-registry-audit')
  const entries = inventory(commandFiles(root).map(file => definition(fs.readFileSync(path.join(root, file), 'utf8'), file)), { strictInactive: true }).active
  return entries.filter(entry => environment === undefined || require('./services/command-environment').commandEnabled(entry, environment, now)).map(entry => entry.definition)
}
function saveSnapshot(root, plan, stage) {
  const directory = path.join(root, 'artifacts', 'command-registry')
  fs.mkdirSync(directory, { recursive: true })
  const file = path.join(directory, `${stage}-${Date.now()}-${randomUUID()}.json`)
  fs.writeFileSync(file, `${JSON.stringify(plan, null, 2)}\n`, { flag: 'wx' })
  return file
}
// Compare every field explicitly supplied by the builder, allowing Discord's
// additional IDs/defaults. Options are ordered and must have the exact shape.
function matches(actual, desired) {
  if (Array.isArray(desired)) return Array.isArray(actual) && actual.length === desired.length && desired.every((item, i) => matches(actual[i], item))
  if (desired && typeof desired === 'object') return actual && Object.keys(desired).filter(key => desired[key] !== undefined).every(key => {
    // Guild commands omit global-only context/DM fields even if builders emit them.
    if (['dm_permission', 'contexts', 'integration_types'].includes(key)) return true
    // Discord omits empty option lists and false option defaults in responses.
    // Accept only these documented-equivalent omissions, retaining strict checks
    // for true flags, nonempty lists, ordering and all supplied constraints.
    if (actual[key] === undefined && ['options', 'choices'].includes(key) && Array.isArray(desired[key]) && desired[key].length === 0) return true
    if (actual[key] === undefined && ['required', 'autocomplete'].includes(key) && desired[key] === false) return true
    return matches(actual[key], desired[key])
  })
  return actual === desired
}
async function runDeployment(args, dependencies = {}) {
  const input = parseArgs(args) // Reject unknown arguments before env/registry/REST.
  const log = dependencies.log || console.log
  const runtime = (dependencies.loadEnvironment || require('./config/runtime').loadDiscordEnvironment)()
  log(`Environment: ${runtime.env}; guild: ${runtime.guildId}; application: ${runtime.clientId}`)
  if (input.mode === 'check') {
    log(`Database path: ${runtime.database.storage}`); log(`Environment file: ${runtime.envFile}`)
    log(`Other-environment guild comparison: ${runtime.productionGuildComparison}`)
    return { checked: true }
  }
  const root = dependencies.root || __dirname
  const desired = (dependencies.definitions || offlineDefinitions)(root, runtime.env)
  // Injected definitions still use the same strict definition/name contract.
  const { validateDefinition } = require('./services/command-registry')
  desired.forEach(validateDefinition)
  inventory(desired.map(definition => ({ name: definition.name })))
  if (!desired.length) throw new Error('Refusing an empty command registry')
  const { REST, Routes } = require('discord.js')
  const rest = dependencies.rest || new REST().setToken(process.env.TOKEN)
  const route = Routes.applicationGuildCommands(runtime.clientId, runtime.guildId)
  const plan = deploymentPlan(runtime, desired, await rest.get(route))
  log(`Desired commands: ${desired.map(identity).join(', ')}`)
  log(`Commands removed by replacement: ${plan.removals.join(', ') || 'none'}`)
  log(`Review SHA-256: ${plan.planHash}`)
  if (input.mode === 'apply' && input.hash !== plan.planHash) throw new Error('Reviewed registry plan changed; inspect a new --plan before applying')
  const snapshotFile = (dependencies.saveSnapshot || saveSnapshot)(root, plan, input.mode === 'apply' ? 'before-apply' : 'review')
  log(`Registry snapshot: ${snapshotFile}`)
  if (input.mode === 'plan') return { plan, snapshotFile, applied: false }
  // Authorization binds desired definitions, live command IDs/versions, scope,
  // and removals. The original live list is durably saved before this bulk PUT.
  const data = await rest.put(route, { body: desired })
  if (!Array.isArray(data) || data.length !== desired.length || desired.some(item => !matches(data.find(next => identity(next) === identity(item)), item))) {
    throw new Error('Discord registry changed but returned unexpected definitions; inspect saved snapshot and live registry before retrying')
  }
  log(`Successfully registered ${data.length} reviewed guild commands.`)
  return { plan, snapshotFile, applied: true }
}
if (require.main === module) runDeployment(process.argv.slice(2)).catch(error => {
  console.error(error.message); process.exitCode = 1
})
module.exports = { parseArgs, deploymentPlan, offlineDefinitions, matches, runDeployment }
