// Offline definition review. Legacy commands import global models at module
// scope; evaluate their exports with explicit inert substitutes, never a DB.
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const { validateDefinition: validate, inventory, commandFiles } = require('../services/command-registry')
// Load trusted SDKs outside the VM deadline. Interrupting a cold require can
// leave Node's shared module cache with partially initialized SDK exports.
const discordSdk = require('discord.js'), sequelizeSdk = require('sequelize')
const root = path.resolve(__dirname, '..')
const forbidden = () => { throw new Error('Offline registry audit cannot execute commands or access models') }
function definition(source, filename) {
  const module = { exports: {} }, substitutes = []
  function offlineRequire(name) {
    if (name === 'discord.js') return discordSdk
    if (name === 'sequelize') return sequelizeSdk
    if (/^\.\.\/\.\.\/Models\/model(?:\.js)?$/.test(name)) {
      substitutes.push('global models')
      return new Proxy({}, { get: () => forbidden })
    }
    if (['../../utils/checkPermissions', '../../services/fate-wallet'].includes(name)) {
      substitutes.push(name)
      return name.includes('fate-wallet') ? { saveWallet: forbidden } : forbidden
    }
    if (['../../services/spooky/runtime', '../../services/spooky/admin-runtime'].includes(name)) {
      substitutes.push(name)
      return { execute: forbidden }
    }
    const safe = {
      '../../services/spooky/command-definition': '../services/spooky/command-definition',
      '../../services/spooky/admin-command': '../services/spooky/admin-command',
      '../../services/badges': '../services/badges',
    }
    if (safe[name]) return require(safe[name])
    throw new Error(`Unreviewed definition import: ${name} (${filename})`)
  }
  new vm.Script(source, { filename }).runInNewContext({ module, exports: module.exports, require: offlineRequire }, { timeout: 2000 })
  const command = module.exports
  if (Object.keys(command).length === 0) return { file: filename, inactive: true, substitutes }
  if (!command.data || typeof command.data.toJSON !== 'function' || typeof command.execute !== 'function') throw new Error(`Incomplete command export: ${filename}`)
  const data = command.data.toJSON() // SDK validates builder definitions.
  validate(data)
  return { file: filename, name: data.name, definition: data, substitutes }
}
function audit(args = []) {
  if (args.length) throw new Error('Offline registry audit accepts no arguments or target overrides')
  const git = (...args) => execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
  const files = commandFiles(root)
  const current = inventory(files.map(file => definition(fs.readFileSync(path.join(root, file), 'utf8'), file)), { strictInactive: true })
  const baselineFiles = git('ls-tree', '-r', '--name-only', 'HEAD', '--', 'commands').trim().split(/\r?\n/).filter(file => /^commands\/[^/]+\/[^/]+\.js$/.test(file)).sort()
  const baseline = inventory(baselineFiles.map(file => definition(git('show', `HEAD:${file}`), file)))
  const added = current.active.filter(item => !baseline.active.some(prior => prior.name === item.name)).map(item => item.name)
  const removed = baseline.active.filter(item => !current.active.some(next => next.name === item.name)).map(item => item.name)
  if (removed.length) throw new Error(`Active HEAD commands missing from working registry: ${removed.join(', ')}`)
  const changed = current.active.filter(item => baseline.active.some(prior => prior.name === item.name && JSON.stringify(prior.definition) !== JSON.stringify(item.definition))).map(item => item.name)
  return { checksPassed: true, scope: 'offline full working-tree registry versus local HEAD',
    branch: git('branch', '--show-current').trim(), baselineCommit: git('rev-parse', 'HEAD').trim(),
    databaseOpened: false, discordContacted: false, environmentCredentialsRead: false, executionHandlersInvoked: false,
    commands: current.active.map(item => ({ ...item, definitionSha256: createHash('sha256').update(JSON.stringify(item.definition)).digest('hex') })),
    activeCount: current.active.length, inactiveFiles: current.inactive, added, removed, changed,
    removedFiles: baselineFiles.filter(file => !files.includes(file)).map(file => ({ file, wasActive: baseline.active.some(item => item.file === file) })),
    limitations: ['Global models, execution-only helpers and Spooky runtime adapters are inert substitutes. This validates definitions, not execution imports or handlers.',
      'HEAD is a local baseline, not the live Discord registry. Bulk PUT replaces all guild commands; server-only commands cannot be detected offline.',
      'No command registration or login occurred. Full development acceptance and approved server settings remain required.'] }
}
if (require.main === module) {
  try { process.stdout.write(`${JSON.stringify(audit(process.argv.slice(2)), null, 2)}\n`) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
module.exports = { audit, definition, inventory }
