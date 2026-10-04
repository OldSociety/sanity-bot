const test = require('node:test'), assert = require('node:assert/strict')
const { commandEnabled } = require('../services/command-environment')
test('profile is available to runtime and registration only in explicit development', () => {
  const profile = require('../commands/Server/Profile')
  assert.equal(commandEnabled(profile, 'development'), true)
  for (const environment of ['production', 'test', undefined]) assert.equal(commandEnabled(profile, environment), false)
  assert.equal(commandEnabled({ data: {} }, 'production'), true)
})
