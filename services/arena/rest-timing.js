const { AsyncLocalStorage } = require('node:async_hooks')
const { performance } = require('node:perf_hooks')
const scope = new AsyncLocalStorage()
const installed = new WeakMap()

// Instrument the supported REST makeRequest hook. Never retain/log request
// URLs, tokens, headers, payloads or response bodies.
function installRestTiming(rest) {
  if (!rest?.options || typeof rest.options.makeRequest !== 'function') return
  if (installed.has(rest)) return
  const original = rest.options.makeRequest
  async function wrapped(...args) {
    const sample = scope.getStore()
    if (!sample) return original.apply(this, args)
    const began = performance.now()
    sample.prepareWait += began - sample.previousHeaders
    sample.attempts++
    try {
      return await original.apply(this, args)
    } finally {
      const ended = performance.now()
      sample.httpHeaders += ended - began
      sample.previousHeaders = ended
    }
  }
  const limited = (data) => {
    const sample = scope.getStore()
    if (!sample) return
    sample.rateLimits++
    sample.advertisedWait += Math.max(0, Number(data.timeToReset) || 0)
  }
  rest.options.makeRequest = wrapped
  rest.on?.('rateLimited', limited)
  installed.set(rest, () => {
    if (rest.options.makeRequest === wrapped)
      rest.options.makeRequest = original
    rest.off?.('rateLimited', limited)
    installed.delete(rest)
  })
}
async function measureRest(rest, work, timing) {
  installRestTiming(rest)
  if (!timing || !installed.has(rest)) return work()
  const sample = {
    previousHeaders: performance.now(),
    prepareWait: 0,
    httpHeaders: 0,
    attempts: 0,
    rateLimits: 0,
    advertisedWait: 0,
  }
  return scope.run(sample, async () => {
    try {
      return await work()
    } finally {
      timing.add('restPrepareWaitMs', Math.round(sample.prepareWait))
      timing.add('restHttpHeadersMs', Math.round(sample.httpHeaders))
      timing.add(
        'restAfterHeadersMs',
        sample.attempts
          ? Math.round(performance.now() - sample.previousHeaders)
          : 0
      )
      timing.add('restAttempts', sample.attempts)
      timing.add('restRateLimits', sample.rateLimits)
      timing.add('restAdvertisedWaitMs', sample.advertisedWait)
    }
  })
}
function stopRestTiming(rest) {
  installed.get(rest)?.()
}
module.exports = { installRestTiming, measureRest, stopRestTiming }
