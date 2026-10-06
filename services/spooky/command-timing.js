const { performance } = require('node:perf_hooks')
const traces = new WeakMap()
function begin(interaction) {
  if (!traces.has(interaction)) traces.set(interaction, { start: performance.now(), stages: {} })
}
function mark(interaction, name) {
  const trace = traces.get(interaction)
  if (trace) trace.stages[name] = Math.round(performance.now() - trace.start)
}
async function phase(interaction, name, work) {
  const start = performance.now()
  try { return await work() }
  finally {
    const trace = traces.get(interaction)
    if (trace) trace.stages[name] = Math.round(performance.now() - start)
  }
}
function finish(interaction) {
  const trace = traces.get(interaction)
  if (!trace) return
  traces.delete(interaction)
  const totalMs = Math.round(performance.now() - trace.start)
  if (totalMs >= 1000) console.warn('Spooky slow command:', JSON.stringify({
    interactionId: interaction.id, command: interaction.options.getSubcommand(), totalMs, ...trace.stages,
  }))
}
function rememberMember(interaction, member) {
  const trace = traces.get(interaction)
  if (trace) trace.member = { value: member, fetchedAt: performance.now() }
}
function takeMember(interaction) {
  const trace = traces.get(interaction)
  const saved = trace?.member
  if (trace) delete trace.member
  // Only reuse the fresh REST result within this immediate request. Chooser
  // callbacks and delayed commands obtain their own fresh membership evidence.
  return saved && performance.now() - saved.fetchedAt < 1000 ? saved.value : null
}
module.exports = { begin, mark, phase, finish, rememberMember, takeMember }
