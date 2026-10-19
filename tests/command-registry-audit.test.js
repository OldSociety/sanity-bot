const test = require('node:test')
const assert = require('node:assert/strict')
const { audit, definition, inventory } = require('../scripts/command-registry-audit')
test('full offline registry keeps active HEAD commands and includes new badge and Spooky definitions', () => {
  const report = audit()
  assert.equal(report.activeCount, report.commands.length)
  assert.equal(report.commands.filter(item => !['arena', 'cocoa', 'idle'].includes(item.name)).length, 14)
  assert.ok(report.commands.some(item => item.name === 'arena'))
  assert.ok(report.commands.some(item => item.name === 'idle'))
  assert.deepEqual(report.removed, [])
  // HEAD advances when implementation is committed; presence and preserved
  // active definitions are the invariant, not whether a command is still new.
  for (const name of ['spooky', 'spooky-admin', 'badges']) assert.ok(report.commands.some(command => command.name === name))
  assert.equal(report.commands.find(item => item.name === 'spooky-admin').definition.options.length, 4)
  assert.ok(report.removedFiles.every(file => file.wasActive === false))
  assert.equal(report.databaseOpened, false); assert.equal(report.discordContacted, false)
  assert.equal(report.environmentCredentialsRead, false); assert.equal(report.executionHandlersInvoked, false)
  assert.throws(() => audit(['--target']), /no arguments/)
})
test('offline loader rejects unexpected imports and attempts to execute model helpers', () => {
  assert.throws(() => definition("require('../../config/database/sequelize')", 'fixture.js'), /Unreviewed/)
  assert.throws(() => definition("require('../../Models/model').User()", 'fixture.js'), /cannot execute/)
  assert.throws(() => definition("module.exports = { data: {} }", 'fixture.js'), /Incomplete/)
  assert.equal(definition('// disabled command', 'fixture.js').inactive, true)
})

test('offline definition environment excludes process methods and credential variables', () => {
  const source = "if (process.env.NODE_ENV !== 'production' || Object.keys(process.env).length !== 1 || process.env.TOKEN !== undefined || process.exit !== undefined || !Object.isFrozen(process.env)) throw Error('Unexpected process access'); module.exports = {}"
  assert.equal(definition(source, 'environment-fixture.js', 'production').inactive, true)
  assert.throws(() => definition(source, 'environment-fixture.js', 'invalid'), /Invalid command definition environment/)
})
test('registry validation rejects duplicate commands and duplicate options', () => {
  assert.throws(() => inventory([{ name: 'same' }, { name: 'same' }]), /Duplicate command/)
  const source = "const { SlashCommandBuilder } = require('discord.js'); module.exports = { data: new SlashCommandBuilder().setName('fixture').setDescription('Fixture').addStringOption(x => x.setName('same').setDescription('First')).addStringOption(x => x.setName('same').setDescription('Second')), execute() {} }"
  assert.throws(() => definition(source, 'fixture.js'), /Duplicate/)
})
