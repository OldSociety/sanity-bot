// One current Arena screen per player/server, shared by fight, campaign and shop.
function createMenuLifecycle({ logger = console } = {}) {
  const active = new Map(), opening = new Map()
  let closing = false
  const keyFor = interaction => `${interaction.guildId}:${interaction.user.id}`
  const restarting = interaction => interaction.editReply({ content: 'Arena is restarting. Please try again shortly.', components: [], allowedMentions: { parse: [] } })
  function track(interaction, retire) {
    const key = keyFor(interaction), entry = { retire }
    active.set(key, entry)
    return () => { if (active.get(key) === entry) active.delete(key) }
  }
  function open(interaction, show) {
    if (closing) return restarting(interaction)
    const key = keyFor(interaction)
    const work = (opening.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
      if (closing) return restarting(interaction)
      const previous = active.get(key)
      if (previous) {
        active.delete(key)
        try { await previous.retire() }
        catch (error) { logger.warn?.(`Arena menu cleanup failed: ${error.code || error.name}`) }
      }
      return show()
    })
    opening.set(key, work)
    return work.finally(() => { if (opening.get(key) === work) opening.delete(key) })
  }
  async function dispose() {
    closing = true
    await Promise.allSettled([...opening.values()])
    const entries = [...active.values()]
    active.clear()
    return Promise.allSettled(entries.map(entry => entry.retire()))
  }
  return { open, track, dispose }
}
const menuLifecycle = createMenuLifecycle()
module.exports = { createMenuLifecycle, menuLifecycle }
