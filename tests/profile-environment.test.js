const test = require('node:test'), assert = require('node:assert/strict')
const { commandEnabled } = require('../services/command-environment')
test('profile is available in development and production but rejects other environments', () => {
  const profile = require('../commands/Server/Profile')
  assert.equal(commandEnabled(profile, 'development'), true)
  assert.equal(commandEnabled(profile, 'production'), true)
  for (const environment of ['test', undefined]) assert.equal(commandEnabled(profile, environment), false)
  assert.equal(commandEnabled({ data: {} }, 'production'), true)
})

test('merged deployment registry keeps Spooky and plain profile in both environments', () => {
  const { offlineDefinitions } = require('../deploy-commands')
  const root = require('node:path').resolve(__dirname, '..')
  for (const environment of ['development', 'production']) {
    const names = offlineDefinitions(root, environment, Date.parse(require('../config/spooky-2026.json').startsAt) + 1).map(command => command.name)
    assert.equal(names.includes('profile'), true)
    assert.ok(names.includes('spooky'))
    assert.ok(names.includes('spooky-admin'))
  }
})
