// Development only. Leave durable leases for startup cleanup if shutdown times out.
function installShutdown(
  client,
  {
    signals = process,
    dispose = () => require('./controller').arena.dispose(),
    flush = () => require('./async-state').flushState(),
    exit = (code) => process.exit(code),
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    logger = console,
  } = {}
) {
  let closing = false
  async function stop() {
    if (closing) return
    closing = true
    const deadline = setTimer(() => exit(1), 8000)
    deadline.unref?.()
    let code = 0
    try {
      await dispose()
      await flush()
      await client.destroy()
    } catch (error) {
      code = 1
      logger.error('Arena shutdown failed:', error.code || error.name)
    } finally {
      clearTimer(deadline)
      exit(code)
    }
  }
  signals.once('SIGINT', stop)
  signals.once('SIGTERM', stop)
  return stop
}
module.exports = { installShutdown }
