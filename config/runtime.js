const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')

function resolveRuntime(environment, root = projectRoot) {
  const env = environment === undefined ? 'development' : environment
  if (!['development', 'production', 'test'].includes(env)) {
    throw new Error('NODE_ENV must be development, production, or test.')
  }
  // Tests cannot select an on-disk database, even if config.json changes.
  return {
    env,
    root,
    envFile: env === 'test' ? null : path.join(root, `.env.${env}`),
    database: {
      dialect: 'sqlite',
      storage: env === 'test' ? ':memory:' : path.join(root, 'config', env === 'development' ? 'dev.sqlite' : 'prod.sqlite'),
      ...(env === 'test' && { logging: false }),
    },
  }
}

function loadDiscordEnvironment(environment = process.env.NODE_ENV, options = {}) {
  const runtime = resolveRuntime(environment, options.root || projectRoot)
  if (runtime.env === 'test') throw new Error('Discord startup and deployment are disabled in the test environment.')
  const { parse } = require('dotenv')
  const target = options.target || process.env
  if (!fs.existsSync(runtime.envFile)) throw new Error(`Missing environment file: .env.${runtime.env}`)
  const selected = parse(fs.readFileSync(runtime.envFile))
  if (selected.NODE_ENV && selected.NODE_ENV !== runtime.env) {
    throw new Error('The selected environment file contains a conflicting NODE_ENV.')
  }
  for (const key of ['TOKEN', 'CLIENTID', 'GUILDID']) {
    // Inherited shell credentials cannot fill gaps in the selected file.
    if (!selected[key]?.trim()) throw new Error(`Missing ${key} in .env.${runtime.env}`)
  }
  for (const key of ['CLIENTID', 'GUILDID']) {
    if (!/^\d{17,20}$/.test(selected[key])) throw new Error(`Invalid ${key} in .env.${runtime.env}`)
  }
  const otherEnv = runtime.env === 'development' ? 'production' : 'development'
  const otherFile = path.join(runtime.root, `.env.${otherEnv}`)
  const other = fs.existsSync(otherFile) ? parse(fs.readFileSync(otherFile)) : {}
  if (other.GUILDID === selected.GUILDID) {
    throw new Error('Development and production GUILDID must differ before Discord startup or deployment.')
  }
  // Drop environment-file keys inherited from the other environment. Load the
  // selected file authoritatively; dotenv's usual non-overwrite default is unsafe here.
  for (const key of new Set([...Object.keys(other), 'TOKEN', 'CLIENTID', 'GUILDID'])) {
    if (key !== 'NODE_ENV') delete target[key]
  }
  for (const [key, value] of Object.entries(selected)) {
    if (key !== 'NODE_ENV') target[key] = value
  }
  target.NODE_ENV = runtime.env
  return {
    ...runtime,
    clientId: selected.CLIENTID,
    guildId: selected.GUILDID,
    productionGuildComparison: other.GUILDID ? 'distinct' : 'unavailable',
  }
}

module.exports = { resolveRuntime, loadDiscordEnvironment }
