const test = require('node:test'), assert = require('node:assert/strict')
const { commandEnabled } = require('../services/command-environment')
test('profile is available to runtime and registration only in explicit development', () => {
  const profile = require('../commands/Server/Profile')
  assert.equal(commandEnabled(profile, 'development'), true)
  for (const environment of ['production', 'test', undefined]) assert.equal(commandEnabled(profile, environment), false)
  assert.equal(commandEnabled({ data: {} }, 'production'), true)
})

test('merged deployment registry keeps Spooky in both environments and profile only in development', () => {
  const { offlineDefinitions } = require('../deploy-commands')
  const root = require('node:path').resolve(__dirname, '..')
  for (const environment of ['development', 'production']) {
    const names = offlineDefinitions(root, environment).map(command => command.name)
    assert.equal(names.includes('profile'), environment === 'development')
    assert.ok(names.includes('spooky'))
    assert.ok(names.includes('spooky-admin'))
  }
})
