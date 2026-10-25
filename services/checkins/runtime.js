const fs = require('node:fs')
const path = require('node:path')
let controller
let timer
const configuration = () => JSON.parse(fs.readFileSync(path.join(__dirname, '../../config/checkins/checkins.json'), 'utf8'))
function enabled() {
  const c = configuration(), env = process.env.NODE_ENV
  return env === 'development' ? c.development.testCommandEnabled === true : env === 'production' && c.production.liveEnabled === true
}
function replacesLegacyReminders() { return process.env.NODE_ENV === 'production' && enabled() && configuration().production.scheduledEnabled === true }
function selected() {
  if (!enabled()) throw Error('Check-in tests are disabled.')
  if (!controller) {
    const { createStore } = require('./storage/sqlite-store')
    const directory = path.join(__dirname, '../../config/checkins/state')
    fs.mkdirSync(directory, { recursive: true })
    const store = createStore(path.join(directory, process.env.NODE_ENV === 'development' ? 'owner-tests-development.sqlite' : 'checkins-production.sqlite'))
    const ready = store.recover().then(() => store.cleanupPrompts())
    controller = require('./application/controller').createController({ store, config: configuration,
      environment: () => process.env.NODE_ENV, botAdminId: () => process.env.BOTADMINID })
    controller.ready = ready
    controller.tick = require('./scheduling/scheduler').createScheduler({ store, config: configuration,
      environment: () => process.env.NODE_ENV }).tick
  }
  return controller
}
async function respond(interaction, action) {
  try {
    if (!enabled()) throw Error('Check-in tests are disabled.')
    const access = require('./application/access').createAccess({ config: configuration, environment: () => process.env.NODE_ENV, botAdminId: () => process.env.BOTADMINID })
    if (action === 'test' || action === 'checkIn') {
      if (action === 'test' && process.env.NODE_ENV !== 'development') throw Error('Check-in tests are disabled.')
      await access.command(interaction)
    }
    const service = selected(); await service.ready; await service[action](interaction)
  } catch (error) {
    const payload = { content: error.message, allowedMentions: { parse: [] } }
    if (interaction.deferred || interaction.replied) await interaction.editReply(payload).catch(() => {})
    else await interaction.reply({ ...payload, ephemeral: Boolean(interaction.guildId) }).catch(() => {})
  }
}
function start(client) {
  if (!enabled() || timer) return
  const work = async () => {
    try { const service = selected(); await service.ready; await service.tick(client); await service.flush(client) }
    catch { console.error('Check-in delivery worker unavailable.') }
  }
  work()
  timer = setInterval(() => { if (enabled()) work() }, 60000)
  timer.unref()
}
module.exports = { enabled, replacesLegacyReminders, configuration, selected, start, test: i => respond(i, 'test'),
  checkIn: i => respond(i, 'checkIn'), handle: i => respond(i, 'handle') }
