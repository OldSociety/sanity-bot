const test = require('node:test'), assert = require('node:assert/strict')
const { runDeployment, offlineDefinitions } = require('../deploy-commands')
const { commandEntry, inventory, validateDefinition, loadRegistry } = require('../services/command-registry')
const root = require('node:path').resolve(__dirname, '..')
test('Discord omissions preserve false defaults and empty lists while enforcing supplied constraints', () => {
  const { matches } = require('../deploy-commands')
  const desired = { name: 'fixture', options: [{ name: 'empty', type: 1, options: [] }, { name: 'optional', type: 3, required: false, autocomplete: false }] }
  const actual = { name: 'fixture', options: [{ name: 'empty', type: 1 }, { name: 'optional', type: 3 }] }
  assert.equal(matches(actual, desired), true)
  assert.equal(matches({ ...actual, options: [] }, desired), false)
  assert.equal(matches({ type: 3 }, { type: 3, required: true }), false)
  assert.equal(matches({ type: 1 }, { type: 1, options: [{ name: 'missing' }] }), false)
})
const desired = [{ type: 1, name: 'example', description: 'Synthetic example', options: [] }]
function fixture(live = []) {
  const calls = [], runtime = { env: 'development', guildId: '123456789012345678', clientId: '234567890123456789', database: { storage: ':memory:' } }
  const dependencies = { loadEnvironment: () => { calls.push('env'); return runtime }, root,
    definitions: () => { calls.push('definitions'); return desired }, log: () => {},
    rest: { get: async () => { calls.push('get'); return live }, put: async (route, input) => { calls.push('put'); return input.body } },
    saveSnapshot: (root, plan, stage) => { calls.push(stage); return 'synthetic-snapshot' } }
  return { calls, dependencies }
}
test('strict deployment arguments reject typos, mixtures and missing hashes before environment or REST', async () => {
  for (const args of [['--check-taget'], ['--plan', '--apply'], ['--apply'], ['--apply', 'bad'], ['--check-target', '--plan'], ['development']]) {
    const f = fixture(); await assert.rejects(runDeployment(args, f.dependencies), /Usage/); assert.deepEqual(f.calls, [])
  }
  const f = fixture(); await runDeployment(['--check-target'], f.dependencies); assert.deepEqual(f.calls, ['env'])
})
test('actual registry builders fail closed for incomplete exports, duplicate names and unreviewed inactive files', () => {
  for (const command of [null, { data: { toJSON: () => desired[0] }, execute: 'wrong' }, { data: {} }]) assert.throws(() => commandEntry(command, 'fixture.js'), /Incomplete/)
  const entry = commandEntry({ data: { toJSON: () => desired[0] }, execute() {} }, 'fixture.js')
  assert.throws(() => inventory([entry, entry]), /Duplicate/)
  assert.throws(() => inventory([commandEntry({}, 'commands/Broken/Broken.js')], { strictInactive: true }), /Unreviewed inactive/)
  assert.doesNotThrow(() => inventory([commandEntry({}, 'commands/Daily/Daily.js')], { strictInactive: true }))
  assert.throws(() => validateDefinition({ ...desired[0], options: [{ name: 'nested', description: 'Invalid', type: 3, options: [] }] }), /cannot nest/)
  assert.throws(() => validateDefinition({ ...desired[0], options: [{ name: 'nested', description: 'Invalid', type: 2, options: [] }] }), /group/)
  // Runtime and deployment consume the same active definitions, using an inert
  // loader in this test so global models and execution code cannot run.
  const defs = offlineDefinitions(root)
  const runtime = loadRegistry(root, file => {
    const entry = require('../scripts/command-registry-audit').definition(require('node:fs').readFileSync(require('node:path').join(root, file), 'utf8'), file)
    return entry.inactive ? {} : { data: { toJSON: () => entry.definition }, execute() {} }
  })
  assert.deepEqual(runtime.active.map(item => item.definition), defs); assert.equal(defs.length, 14)
})
test('default deployment plans and snapshots live-only removals; apply binds definitions and live versions', async () => {
  const live = [{ id: 'old', version: '1', name: 'server_only', type: 1, description: 'Existing command' }]
  const f = fixture(live), planned = await runDeployment([], f.dependencies)
  assert.equal(planned.applied, false); assert.deepEqual(planned.plan.removals, ['1:server_only'])
  assert.deepEqual(f.calls, ['env', 'definitions', 'get', 'review'])
  const apply = fixture(live); const result = await runDeployment(['--apply', planned.plan.planHash], apply.dependencies)
  assert.equal(result.applied, true); assert.deepEqual(apply.calls, ['env', 'definitions', 'get', 'before-apply', 'put'])
  for (const change of ['live', 'desired']) {
    const stale = fixture(change === 'live' ? [{ ...live[0], version: '2' }] : live)
    if (change === 'desired') stale.dependencies.definitions = () => [{ ...desired[0], description: 'Changed' }]
    await assert.rejects(runDeployment(['--apply', planned.plan.planHash], stale.dependencies), /plan changed/)
    assert.equal(stale.calls.includes('put'), false)
  }
})
test('malformed registries or snapshot failures never send a bulk overwrite; unexpected response reports saved state', async () => {
  for (const defs of [[{ ...desired[0], name: 'UPPERCASE' }], [desired[0], desired[0]], []]) {
    const f = fixture(); f.dependencies.definitions = () => defs
    await assert.rejects(runDeployment([], f.dependencies)); assert.equal(f.calls.includes('get'), false)
  }
  const planned = await runDeployment([], fixture().dependencies)
  const failedSnapshot = fixture(); failedSnapshot.dependencies.saveSnapshot = () => { throw new Error('Disk full') }
  await assert.rejects(runDeployment(['--apply', planned.plan.planHash], failedSnapshot.dependencies), /Disk full/)
  assert.equal(failedSnapshot.calls.includes('put'), false)
  const unexpected = fixture(); unexpected.dependencies.rest.put = async () => []
  await assert.rejects(runDeployment(['--apply', planned.plan.planHash], unexpected.dependencies), /registry changed.*inspect saved snapshot/)
})
