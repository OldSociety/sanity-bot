const { AsyncLocalStorage } = require('node:async_hooks')
const { performance } = require('node:perf_hooks')
const context = new AsyncLocalStorage()
function enabled() {
  const config = require('../../config/spooky/spooky-performance.json')
  return process.env.NODE_ENV === 'development' ? config.developmentEnabled === true
    : process.env.NODE_ENV === 'production' && config.productionEnabled === true
}
function run(interaction, work) { return enabled() ? context.run(interaction, work) : work() }
function add(name, ms) {
  const interaction = context.getStore()
  if (interaction) require('./command-timing').add(interaction, name, ms)
}
async function measure(name, work) {
  const start = performance.now()
  try { return await work() } finally { add(name, performance.now() - start) }
}
function background(label, work) {
  // Cosmetic work is observed even after the command returns.
  void Promise.resolve().then(work).catch(error => console.error(`Spooky ${process.env.NODE_ENV} ${label}:`, error.code || error.name))
}
module.exports = { enabled, run, add, measure, background }
