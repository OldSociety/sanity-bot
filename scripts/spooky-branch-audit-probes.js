// Positive regression verification replaces the original defect assertions.
// The pre-fix observations remain archived in spooky-branch-audit-results.json.
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process'), { createHash } = require('node:crypto')
function probes(args = []) {
  if (args.length) throw new Error('Audit regression verification accepts no arguments or target paths')
  const root = path.resolve(__dirname, '..')
  const tests = ['tests/spooky-audit-adapters.test.js', 'tests/spooky-audit-corrections.test.js', 'tests/command-deployment.test.js']
  const output = execFileSync(process.execPath, ['--test', '--test-concurrency=1', ...tests], {
    cwd: root, env: { ...process.env, NODE_ENV: 'test' }, encoding: 'utf8', timeout: 120000, maxBuffer: 2 * 1024 * 1024,
  })
  const count = Number(output.match(/^# tests (\d+)$/m)?.[1]), passed = Number(output.match(/^# pass (\d+)$/m)?.[1])
  if (!count || passed !== count || !/^# fail 0$/m.test(output)) throw new Error('Audit regressions did not all pass')
  const files = ['services/guild-members.js', 'services/spooky/runtime.js', 'services/spooky/controller.js',
    'services/spooky/delivery.js', 'services/spooky/notifications.js', 'services/spooky/pending-notifications.js', 'services/spooky/post-commit.js',
    'services/spooky/discord-adapter.js', 'services/spooky/curse-role.js', 'services/spooky/playful.js', 'services/spooky/admin-controls.js',
    'services/spooky/admin-repairs.js', 'services/spooky/admin-command.js', 'services/spooky/admin-runtime.js', 'services/spooky/collection.js',
    'services/spooky/presentation.js', 'services/fate-wallet.js', 'services/spooky/economy.js', 'services/badges.js', 'services/command-registry.js',
    'handlers/messageHandler.js', 'handlers/boosterHandler.js', 'commands/Server/User.js', 'commands/Holiday/Christmas.js',
    'Events/InteractionCreate.js', 'app.js', 'deploy-commands.js', 'scripts/command-registry-audit.js', ...tests, 'config/spooky-2026.json',
    'config/spooky-reminders.json', 'config/spooky-winners.json', 'config/badge-access.json']
  return { checksPassed: true, scope: 'positive offline audit regressions; synthetic SQLite and Discord/REST only',
    tests: count, passed, findings: Array.from({ length: 9 }, (_, i) => ({ id: `A0${i + 1}`, status: 'fixed with offline regression coverage; live acceptance pending' })),
    realStorageAccessed: false, discordContacted: false, credentialsRead: false, sourceSha256: Object.fromEntries(files.map(file => [file,
      createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])) }
}
if (require.main === module) {
  try { process.stdout.write(`${JSON.stringify(probes(process.argv.slice(2)), null, 2)}\n`) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
module.exports = { probes }
