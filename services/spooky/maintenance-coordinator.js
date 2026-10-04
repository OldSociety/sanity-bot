// Share startup initialization and full worker sweeps. Commands await only the
// database expiry/closure check, never unrelated Discord recovery or reminders.
function createMaintenanceCoordinator({ initialize, beforeCommand, sweep }) {
  let initialized = false, initializing = null, sweeping = null
  function ensureInitialized() {
    if (initialized) return Promise.resolve()
    if (!initializing) initializing = Promise.resolve().then(initialize).then(result => {
      initialized = result !== false
    }).finally(() => { initializing = null })
    return initializing
  }
  async function prepare(key) {
    await ensureInitialized()
    return beforeCommand(key)
  }
  function maintenance(key) {
    if (!sweeping) sweeping = (async () => {
      await ensureInitialized()
      return sweep(key)
    })().finally(() => { sweeping = null })
    return sweeping
  }
  return { beforeCommand: prepare, maintenance }
}
module.exports = { createMaintenanceCoordinator }
