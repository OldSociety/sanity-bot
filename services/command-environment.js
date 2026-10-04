function eventWindow(key, environment) {
  if (key === 'spooky') {
    const event = require('../config/spooky-2026.json')
    return { enabled: event.enabled || (environment === 'development' && event.developmentEnabled) ||
      (environment === 'production' && event.productionEnabled), startsAt: event.startsAt, endsAt: event.endsAt }
  }
  const window = require('../config/event-commands.json')[key]
  if (!window) throw new Error(`No command schedule for event ${key}`)
  return window
}
function commandEnabled(command, environment, now = Date.now()) {
  if (command.environments && !command.environments.includes(environment)) return false
  if (!command.eventKey) return true
  const window = eventWindow(command.eventKey, environment)
  if (!window.enabled) return false
  const start = Date.parse(window.startsAt), end = Date.parse(window.endsAt)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw new Error('Invalid event command schedule')
  return now >= start && now < end
}
module.exports = { commandEnabled, eventWindow }
