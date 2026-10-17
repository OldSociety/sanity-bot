const transactions = new WeakMap(), hooked = new WeakSet()
function invalidate(transaction) { if (transaction) transactions.delete(transaction) }
function install(model, { updates = true } = {}) {
  if (hooked.has(model)) return
  hooked.add(model)
  const hooks = ['afterCreate', 'afterDestroy', 'afterBulkCreate', 'afterBulkDestroy', ...(updates ? ['afterUpdate', 'afterBulkUpdate'] : [])]
  for (const hook of hooks) {
    model.addHook(hook, 'development-effect-cache', (...args) => invalidate(args.at(-1)?.transaction))
  }
}
function get(transaction, scope, load) {
  if (!transaction) return load()
  if (!transactions.has(transaction)) transactions.set(transaction, new Map())
  const values = transactions.get(transaction), key = JSON.stringify([scope.eventId, scope.guildId])
  if (!values.has(key)) values.set(key, Promise.resolve().then(load).catch(error => { values.delete(key); throw error }))
  return values.get(key)
}
module.exports = { install, get, invalidate }
