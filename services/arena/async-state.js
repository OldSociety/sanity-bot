const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

// Serialize read/modify/rename by path, including callers using separate stores.
// Re-read on each operation so maintenance edits are not hidden by stale caches.
const writers = new Map()
function serialize(file, work) {
  const previous = writers.get(file) || Promise.resolve()
  const next = previous.catch(() => {}).then(work)
  writers.set(file, next)
  next
    .finally(() => {
      if (writers.get(file) === next) writers.delete(file)
    })
    .catch(() => {})
  return next
}
function createJsonStore(file, { empty, validate }) {
  file = path.resolve(file)
  async function read() {
    let raw
    try {
      raw = await fs.readFile(file, 'utf8')
    } catch (error) {
      if (error.code === 'ENOENT') return empty()
      throw error
    }
    const value = JSON.parse(raw)
    if (!validate(value)) throw Error('Invalid Arena state file')
    return value
  }
  function update(change) {
    return serialize(file, async () => {
      const value = await read()
      const next = change(value)
      if (next === undefined) return
      await fs.mkdir(path.dirname(file), { recursive: true })
      const temp = `${file}.${randomUUID()}.tmp`
      try {
        await fs.writeFile(temp, JSON.stringify(next), 'utf8')
        await fs.rename(temp, file)
      } finally {
        await fs.unlink(temp).catch((error) => {
          if (error.code !== 'ENOENT') throw error
        })
      }
    })
  }
  return { read: () => serialize(file, read), update }
}

let reportsPending = 0
function appendReport(file, line) {
  if (reportsPending >= 1024)
    return Promise.reject(Error('Arena report queue is full'))
  reportsPending++
  return serialize(path.resolve(file), async () => {
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.appendFile(file, line, 'utf8')
  }).finally(() => {
    reportsPending--
  })
}
async function flushState() {
  while (writers.size) await Promise.allSettled([...writers.values()])
}
module.exports = { createJsonStore, appendReport, flushState }
