// Bounded, promise-deduplicating LRU. Failed work never poisons future requests.
function createBufferCache({
  maxEntries = 64,
  maxBytes = 16 * 1024 * 1024,
} = {}) {
  const entries = new Map()
  let bytes = 0
  const stats = { hits: 0, misses: 0, evictions: 0 }
  function remove(key, entry) {
    if (entries.get(key) !== entry) return
    entries.delete(key)
    bytes -= entry.bytes
  }
  function trim() {
    while (entries.size > maxEntries || bytes > maxBytes) {
      const [key, entry] = entries.entries().next().value
      remove(key, entry)
      stats.evictions++
    }
  }
  function get(key, load) {
    if (entries.has(key)) {
      const entry = entries.get(key)
      entries.delete(key)
      entries.set(key, entry)
      stats.hits++
      return entry.promise
    }
    stats.misses++
    const entry = { bytes: 0 }
    entry.promise = Promise.resolve()
      .then(load)
      .then(
        (value) => {
          if (entries.get(key) === entry) {
            entry.bytes = value.byteLength || 0
            bytes += entry.bytes
            trim()
          }
          return value
        },
        (error) => {
          remove(key, entry)
          throw error
        }
      )
    entries.set(key, entry)
    trim()
    return entry.promise
  }
  return { get, snapshot: () => ({ ...stats, entries: entries.size, bytes }) }
}

// A bounded native-render admission queue; never creates work per duplicate key.
function createRenderQueue({ concurrency = 2, maxPending = 32 } = {}) {
  let active = 0
  const pending = []
  function drain() {
    while (active < concurrency && pending.length) {
      const { work, resolve, reject } = pending.shift()
      active++
      Promise.resolve()
        .then(work)
        .then(resolve, reject)
        .finally(() => {
          active--
          drain()
        })
    }
  }
  function run(work) {
    if (active >= concurrency && pending.length >= maxPending)
      return Promise.reject(new Error('Arena renderer is busy'))
    return new Promise((resolve, reject) => {
      pending.push({ work, resolve, reject })
      drain()
    })
  }
  return { run, snapshot: () => ({ active, pending: pending.length }) }
}
module.exports = { createBufferCache, createRenderQueue }
