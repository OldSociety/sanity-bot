// Read selected development settings only. Never import runtime models, open
// storage, contact Discord, or expose environment values in this report.
const { loadDiscordEnvironment } = require('../config/runtime')

function developmentCheck(args = [], options = {}) {
  if (args.length)
    throw new Error(
      'Development preparation check accepts no arguments or target overrides',
    )
  const environment =
    options.environment === undefined
      ? process.env.NODE_ENV
      : options.environment
  if (environment !== 'development')
    throw new Error('Explicit NODE_ENV=development is required')
  const selected = {}
  const runtime = loadDiscordEnvironment(environment, {
    root: options.root,
    target: selected,
  })
  const snowflake = /^\d{17,20}$/
  const checks = []
  const roles = ['CURSEDROLEID', 'SWEETTOOTHROLEID', 'UNWANTEDROLEID']
  const channels = ['SPOOKYCHANNELID', 'BOTTESTCHANNELID']
  for (const key of roles)
    checks.push({
      setting: key,
      valid: snowflake.test(selected[key] || ''),
      required: true,
    })
  for (const key of channels)
    checks.push({
      setting: key,
      valid: snowflake.test(selected[key] || ''),
      configured: Boolean(selected[key]),
      required: false,
    })
  const failures = checks
    .filter((check) => (check.required || check.configured) && !check.valid)
    .map(
      (check) =>
        `${check.setting} must be a valid Discord ID in .env.development`,
    )
  if (!channels.some((key) => snowflake.test(selected[key] || '')))
    failures.push(
      'Configure at least one Spooky or bot-test channel in .env.development',
    )
  const configuredRoles = roles.map((key) => selected[key]).filter(Boolean)
  if (new Set(configuredRoles).size !== configuredRoles.length)
    failures.push('Curse, Sweet Tooth and Unwanted roles must be distinct')
  if (configuredRoles.includes(runtime.guildId))
    failures.push('Gameplay roles cannot use the server @everyone role')
  return {
    scope: 'offline development settings syntax and target isolation',
    environment: runtime.env,
    checksPassed: failures.length === 0,
    checks,
    failures,
    productionGuildComparison: runtime.productionGuildComparison,
    databaseOpened: false,
    discordContacted: false,
    credentialsPrinted: false,
    liveAcceptanceComplete: false,
    remainingLiveChecks: [
      'Verify channel/role IDs belong to the development server.',
      'Verify bot permissions, role hierarchy, channel visibility and enabled privileged intents in the developer portal.',
      'Review real storage and live command plans during an explicitly authorized development session.',
    ],
  }
}

if (require.main === module) {
  try {
    const report = developmentCheck(process.argv.slice(2))
    console.log(JSON.stringify(report, null, 2))
    if (!report.checksPassed) process.exitCode = 1
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
module.exports = { developmentCheck }
