const test = require('node:test'), assert = require('node:assert/strict')
const { commandEnabled } = require('../services/command-environment')
const { offlineDefinitions } = require('../deploy-commands')
const { reconcile } = require('../services/event-command-lifecycle')
const event = require('../config/spooky-2026.json'), root = require('node:path').resolve(__dirname, '..')
test('event registration is absent outside its exact window and inactive Winter adds no commands', () => {
  for (const environment of ['development', 'production']) {
    const inside = offlineDefinitions(root, environment, Date.parse(event.startsAt)).map(row => row.name)
    const after = offlineDefinitions(root, environment, Date.parse(event.endsAt)).map(row => row.name)
    assert.ok(inside.includes('spooky')); assert.ok(inside.includes('spooky-admin'))
    assert.equal(after.includes('spooky'), false); assert.equal(after.includes('spooky-admin'), false)
    assert.equal(inside.includes('throw'), false); assert.equal(inside.includes('slots'), false)
    assert.equal(inside.includes('profile'), true)
  }
  assert.equal(commandEnabled({ eventKey: 'spooky' }, 'production', Date.parse(event.startsAt) - 1), false)
})
function fixture() {
  const entries = ['spooky', 'spooky-admin'].map(name => ({ name, command: { eventKey: 'spooky' } }))
  const commands = new Map(['spooky', 'spooky-admin', 'game', 'fate'].map(name => [name, { id: name, name, applicationId: 'app', guildId: 'guild', type: 1 }]))
  const deleted = [], client = { application: { id: 'app' }, commands: new Map(commands), guilds: { fetch: async () => ({ id: 'guild', commands: {
    fetch: async () => new Map(commands), delete: async id => { deleted.push(id); commands.delete(id) },
  } }) } }
  return { client, entries, deleted, options: { client, entries, environment: 'production', guildId: 'guild', clientId: 'app', now: Date.parse(event.endsAt) } }
}
test('expiry deletes only owned event commands and preserves unrelated/server-only commands; repeated cleanup is safe', async () => {
  const f = fixture(); assert.deepEqual(await reconcile(f.options), ['spooky', 'spooky-admin'])
  assert.deepEqual(await reconcile(f.options), []); assert.equal(f.client.commands.has('game'), true); assert.equal(f.client.commands.has('fate'), true)
  assert.deepEqual(f.deleted, ['spooky', 'spooky-admin'])
})
test('cleanup refuses the wrong application and keeps failed deletion eligible for retry', async () => {
  const f = fixture(); await assert.rejects(() => reconcile({ ...f.options, clientId: 'other' }), /pinned/)
  let failed = true
  const fetch = f.client.guilds.fetch
  f.client.guilds.fetch = async () => { const guild = await fetch(); const remove = guild.commands.delete; guild.commands.delete = async id => { if (failed) throw new Error('Discord failure'); return remove(id) }; return guild }
  await assert.rejects(() => reconcile(f.options), /Discord failure/)
  assert.equal(f.client.commands.has('spooky'), true)
  failed = false; assert.deepEqual(await reconcile(f.options), ['spooky', 'spooky-admin'])
})
