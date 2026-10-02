const { privateScreen } = require('./presentation')
const log = (component, operationId, error) => console.error(`Spooky ${component} pending (${operationId}):`, error.message)
async function safeEdit(interaction, payload, operationId) {
  try { await interaction.editReply(payload); return true }
  catch (error) { log('reply', operationId, error); return false }
}
// A webhook failure cannot roll back an operation or suppress its durable outbox.
async function finishSaved({ interaction, result, payload, publish, badgeAccess, userId, savedTitle = '🎃 Action Saved' }) {
  await safeEdit(interaction, payload, result.operationId)
  try { if (publish) await publish() }
  catch (error) {
    log('public delivery', result.operationId, error)
    await safeEdit(interaction, privateScreen(savedTitle, `Your rewards are saved. **Operation: ${result.operationId}**\nPublic delivery needs recovery or inspection. Do not repeat this paid action to recover its result.`), result.operationId)
  }
  // Access is a repairable cosmetic projection. It must not delay saved rewards.
  if (badgeAccess && userId) {
    let timer
    const access = Promise.resolve().then(() => badgeAccess.reconcileUser(interaction.guildId, userId))
      .catch(error => log('badge access', result.operationId, error))
    // Settle quick projections before returning, while bounding optional REST
    // latency. Late failures stay observed; ownership/views repair interrupted work.
    try { await Promise.race([access, new Promise(resolve => { timer = setTimeout(resolve, 1000) })]) }
    finally { clearTimeout(timer) }
  }
}
module.exports = { finishSaved, safeEdit }
