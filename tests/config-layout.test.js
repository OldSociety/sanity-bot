const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path')
test('Arena build filenames identify their skin and character without an environment suffix', () => {
  const { characterConfigFiles } = require('../services/arena/character-config')
  for (const file of characterConfigFiles) {
    assert(fs.existsSync(path.resolve(__dirname, '..', file)))
    assert.match(
      path.basename(file),
      /^arena-(?:(?:spooky|hellfed|classic)-[a-z]+|template)\.json$/
    )
  }
  assert(
    characterConfigFiles.some((file) =>
      file.endsWith('arena-hellfed-marq.json')
    )
  )
  assert(
    characterConfigFiles.some((file) =>
      file.endsWith('arena-spooky-maxim.json')
    )
  )
})
test('moved database tooling keeps the existing environment database locations', () => {
  const root = path.resolve(__dirname, '..'),
    cli = require('../.sequelizerc'),
    settings = require('../config/database/config.json'),
    { resolveRuntime } = require('../config/runtime/runtime')
  assert.equal(cli.config, path.join(root, 'config/database/config.json'))
  for (const [environment, file] of [
    ['development', 'dev.sqlite'],
    ['production', 'prod.sqlite'],
  ]) {
    assert.equal(
      resolveRuntime(environment).database.storage,
      path.join(root, 'config', file)
    )
    assert.equal(
      path.resolve(root, settings[environment].storage),
      path.join(root, 'config', file)
    )
  }
  assert.equal(resolveRuntime('test').database.storage, ':memory:')
})
