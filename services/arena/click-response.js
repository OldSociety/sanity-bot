// A fast result is the acknowledgement. Slow work gets a controls-only ACK,
// then edits via this click's fresh webhook, never the original slash token.
function createClickResponse(
  interaction,
  {
    locked,
    timing,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    deadlineMs = 750,
    measure = (work) => work(),
  } = {}
) {
  let state = 'pending',
    acknowledgement,
    timer,
    cancelled = false
  function clear() {
    if (timer != null) clearTimer(timer)
    timer = null
  }
  function defer() {
    if (state !== 'pending' || cancelled) return acknowledgement
    state = 'acknowledging'
    clear()
    const work = () => measure(() => interaction.update(locked))
    acknowledgement = Promise.resolve()
      .then(() => (timing ? timing.phase('ackMs', work) : work()))
      .then(
        () => {
          state = 'acknowledged'
        },
        () => {
          state = 'failed'
        }
      )
    return acknowledgement
  }
  const age = Number.isFinite(interaction.createdTimestamp)
    ? Math.max(0, Date.now() - interaction.createdTimestamp)
    : 0
  const guardMs = Math.max(0, Math.min(deadlineMs, 1800 - age))
  if (guardMs === 0) defer()
  else {
    timer = setTimer(defer, guardMs)
    timer?.unref?.()
  }
  async function send(payload, fallback) {
    clear()
    if (acknowledgement) await acknowledgement
    if (cancelled || state === 'failed' || state === 'sent') {
      timing?.detail('responseMode', 'bot-fallback')
      return measure(() => fallback(payload))
    }
    const direct = state === 'pending'
    state = 'sending'
    timing?.detail('responseMode', direct ? 'direct-update' : 'fresh-webhook')
    try {
      const response = await measure(() =>
        direct ? interaction.update(payload) : interaction.editReply(payload)
      )
      state = 'sent'
      // Older discord.js returns an InteractionResponse from update(). Never
      // fetch a second response just to discover attachment IDs; the next click
      // already carries the authoritative message/attachments.
      return response
    } catch (error) {
      state = 'failed'
      throw error
    }
  }
  return {
    send,
    cancel: () => {
      cancelled = true
      clear()
    },
    defer,
  }
}
module.exports = { createClickResponse }
