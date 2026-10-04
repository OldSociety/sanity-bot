const { privateScreen } = require('./presentation')
const log = (component, operationId, error) => console.error(`Spooky ${component} pending (${operationId}):`, error.message)
async function safeEdit(interaction, payload, operationId) {
  try { await interaction.editReply(payload); return true }
  catch (error) { log('reply', operationId, error); return false }
}
async function settleProjection(work, onError, timeoutMs = 1000) {
  let timer
  const pending = Promise.resolve().then(work).catch(onError)
  try { await Promise.race([pending, new Promise(resolve => { timer = setTimeout(resolve, timeoutMs) })]) }
  finally { clearTimeout(timer) }
}
// A webhook failure cannot roll back an operation or suppress its durable outbox.
async function finishSaved({ interaction, result, payload, publish, badgeAccess, userId, savedTitle = '🎃 Action Saved', hideAfterPublish = false }) {
  if (!hideAfterPublish) await safeEdit(interaction, payload, result.operationId)
  try {
    const delivery = publish ? await publish() : null
    if (hideAfterPublish && delivery?.allSent === false) throw new Error('Public result remains undelivered')
    if (hideAfterPublish) {
      // The public flavor embed is the result. Remove the deferred private
      // acknowledgement only after delivery succeeds, keeping failures visible.
      try {
        if (typeof interaction.deleteReply === 'function') await interaction.deleteReply()
        else await safeEdit(interaction, payload, result.operationId)
      } catch (error) { log('acknowledgement cleanup', result.operationId, error); await safeEdit(interaction, payload, result.operationId) }
    }
  }
  catch (error) {
    log('public delivery', result.operationId, error)
    await safeEdit(interaction, require('./presentation').withBalances(privateScreen(savedTitle, 'Your turn counted, but its message could not be delivered. Please ask an admin for help; do not spend candy again to recover it.'), result.receipt), result.operationId)
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
module.exports = { finishSaved, safeEdit, settleProjection }
