const { performance, monitorEventLoopDelay } = require('node:perf_hooks')
const recent = []
let completed = 0,
  failed = 0
function createTiming({
  logger = console,
  sample = Math.random() < 0.05,
  onFinish = () => {},
  metadata = {},
} = {}) {
  const start = performance.now(),
    stages = { ...metadata }
  return {
    add: (name, value) => {
      stages[name] = (stages[name] || 0) + value
    },
    detail: (name, value) => {
      stages[name] = value
    },
    snapshot: () => ({
      elapsedMs: Math.round(performance.now() - start),
      ...stages,
    }),
    async phase(name, work) {
      const began = performance.now()
      try {
        return await work()
      } finally {
        stages[name] = Math.round(performance.now() - began)
      }
    },
    finish(details = {}) {
      const totalMs = Math.round(performance.now() - start)
      const record = { totalMs, ...stages, ...details }
      completed++
      failed += Number(Boolean(details.failed))
      recent.push(totalMs)
      if (recent.length > 256) recent.shift()
      if (sample || totalMs >= 1000 || details.failed)
        logger.info?.('Arena timing:', JSON.stringify(record))
      onFinish(record)
      return record
    },
  }
}
const running = new WeakMap()
function startMetrics(client, logger = console) {
  if (running.has(client)) return running.get(client)
  const delay = monitorEventLoopDelay({ resolution: 20 })
  delay.enable()
  let previous = performance.eventLoopUtilization(),
    lastCompleted = completed,
    rateLimits = 0
  const limited = () => {
    rateLimits++
  }
  client.rest?.on('rateLimited', limited)
  const timer = setInterval(() => {
    const utilization = performance.eventLoopUtilization(previous)
    previous = performance.eventLoopUtilization()
    if (completed !== lastCompleted) {
      const sorted = [...recent].sort((a, b) => a - b)
      const percentile = (value) =>
        sorted[
          Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)
        ] || 0
      logger.info?.(
        'Arena metrics:',
        JSON.stringify({
          completed,
          failed,
          sampleSize: sorted.length,
          p50Ms: percentile(0.5),
          p95Ms: percentile(0.95),
          p99Ms: percentile(0.99),
          eventLoopP95Ms: Math.round(delay.percentile(95) / 1e6),
          eventLoopUtilization: Number(utilization.utilization.toFixed(3)),
          rssBytes: process.memoryUsage().rss,
          rateLimits,
          rendering: require('./health-card').renderStats(),
          portraits: require('./portrait').portraitCacheStats(),
        })
      )
    }
    lastCompleted = completed
    delay.reset()
    rateLimits = 0
  }, 60000)
  timer.unref?.()
  const stop = () => {
    clearInterval(timer)
    delay.disable()
    client.rest?.off('rateLimited', limited)
    require('./rest-timing').stopRestTiming(client.rest)
    running.delete(client)
  }
  client.once('invalidated', stop)
  running.set(client, stop)
  return stop
}
module.exports = { createTiming, startMetrics }
