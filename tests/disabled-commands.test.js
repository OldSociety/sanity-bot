const test = require('node:test'), assert = require('node:assert/strict')
const { commandEnabled } = require('../services/command-environment')
const { disabledNames } = require('../services/disabled-commands')
test('paused commands are excluded from runtime and future registration in both environments', () => {
  for (const environment of ['production', 'development']) {
    for (const name of disabledNames) assert.equal(commandEnabled({ name }, environment), false)
    assert.equal(commandEnabled(require('../commands/Server/Profile'), environment), true)
    assert.equal(commandEnabled({ name: 'game' }, environment), true)
  }
})
test('stale paused commands are answered privately before command lookup or execution', async () => {
  const dispatcher = require('../Events/InteractionCreate'), replies = []
  for (const commandName of disabledNames) await dispatcher.execute({ commandName, isChatInputCommand: () => true,
    get client() { throw Error('Disabled commands must not look up handlers') }, reply: async payload => replies.push(payload) })
  assert.equal(replies.length, disabledNames.length)
  for (const payload of replies) { assert.equal(payload.ephemeral, true); assert.deepEqual(payload.allowedMentions, { parse: [] }) }
})
test('direct Winter/badge/achievement handlers return without reading options, members or storage', async t => {
  const { User } = require('../Models/model'); t.after(() => User.sequelize.close())
  const paths = ['../commands/Holiday/Christmas', '../commands/Holiday/Slots', '../commands/Achievements/Badges', '../commands/Achievements/Achievements']
  for (const file of paths) {
    let reply
    await require(file).execute({ reply: async payload => { reply = payload } })
    assert.equal(reply.ephemeral, true)
    assert.deepEqual(require(file).environments, [])
  }
})

test('startup cleanup removes paused commands and preserves profile/game with pinned ownership', async () => {
  const commands = new Map(['achievement', 'badges', 'throw', 'slots', 'profile', 'game'].map(name => [name, { name, id: name, type: 1, applicationId: 'app', guildId: 'guild' }]))
  const entries = [...commands.keys()].map(name => ({ name, command: { name } }))
  const client = { application: { id: 'app' }, commands: new Map(commands), guilds: { fetch: async () => ({ id: 'guild', commands: { fetch: async () => new Map(commands), delete: async id => commands.delete(id) } }) } }
  const removed = await require('../services/event-command-lifecycle').reconcile({ client, entries, environment: 'production', guildId: 'guild', clientId: 'app' })
  assert.deepEqual(removed.sort(), ['achievement', 'badges', 'slots', 'throw'])
  assert.deepEqual([...commands.keys()].sort(), ['game', 'profile'])
})
