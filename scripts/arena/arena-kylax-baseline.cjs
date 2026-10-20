// Read-only comparison against this task's exact pre-edit source copies.
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module')
const original = Module._extensions['.js']
Module._extensions['.js'] = (mod, filename) => {
  const relative = path.relative(path.resolve('services/arena'), filename)
  const saved = path.resolve('artifacts/arena-kylax-2026-10-20/before/services', relative)
  if (!relative.startsWith('..') && fs.existsSync(saved))
    return mod._compile(fs.readFileSync(saved, 'utf8'), filename)
  return original(mod, filename)
}
