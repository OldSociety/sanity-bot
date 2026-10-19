function attachmentMap(message) {
  return new Map(
    [...(message?.attachments?.values?.() || [])]
      .filter((file) => file.id && file.name)
      .map((file) => [file.name, { id: file.id, filename: file.name }])
  )
}

function createMessageTransport(
  message,
  {
    fallback,
    retryDelay = () => new Promise((resolve) => setTimeout(resolve, 150)),
    onRetry = () => {},
  } = {}
) {
  // Message.edit uses the bot token, unlike the original interaction webhook.
  const edit =
    typeof message.edit === 'function'
      ? (payload) => message.edit(payload)
      : fallback
  let attached = attachmentMap(message)
  let lastMessage = message
  let fileKey = null
  function observe(current) {
    if (current?.id !== message.id || !current.attachments?.values) return
    attached = attachmentMap(current)
    lastMessage = current
  }
  async function send(view, files, click) {
    const key = files.map((file) => file.name).join('|')
    const kept = files
      .filter((file) => attached.has(file.name))
      .map((file) => attached.get(file.name))
    const uploads = files.filter((file) => !attached.has(file.name))
    const payload = { ...view }
    if (key !== fileKey) {
      payload.attachments = kept
      if (uploads.length) payload.files = uploads
    }
    let response
    for (let attempt = 0; ; attempt++) {
      try {
        response = await (click ? click.send(payload, edit) : edit(payload))
        break
      } catch (error) {
        const status = error.status || error.httpStatus
        // Retrying delivery must never execute a game action again.
        if (
          attempt ||
          [10003, 10008, 50001, 50013, 50027].includes(Number(error.code)) ||
          (status >= 400 && status < 500)
        )
          throw error
        onRetry()
        await retryDelay()
      }
    }
    // Only publish attachment identities after a successful response. A retry
    // with the same manifest replaces ambiguous uploads rather than appending.
    if (response?.attachments?.values) {
      attached = attachmentMap(response)
      lastMessage = response
    } else {
      // Keep known retained IDs until a future component payload supplies new
      // upload IDs. No extra GET is needed after a direct callback response.
      attached = new Map(kept.map((file) => [file.filename, file]))
    }
    fileKey = key
    return response
  }
  // Recovery is an exceptional, controls-only edit. It never renders an image
  // or enters the normal click acknowledgement path.
  const recover = (sessionId, revision) =>
    edit(lockedControls(lastMessage, sessionId, revision, { recovery: true }))
  return { send, recover, observe }
}

function lockedControls(
  message,
  sessionId,
  revision,
  { recovery = false } = {}
) {
  const rows = (message.components || [])
    .map((row) => {
      const data = row.toJSON ? row.toJSON() : structuredClone(row)
      return {
        ...data,
        components: data.components
          .filter((component) => !component.custom_id?.endsWith(':refresh'))
          .map((component) => ({ ...component, disabled: true })),
      }
    })
    .filter((row) => row.components.length)
  if (!recovery) return { components: rows, allowedMentions: { parse: [] } }
  const refresh = {
    type: 2,
    style: 2,
    label: 'Refresh Display',
    custom_id: `arena:${sessionId}:${revision}:refresh`,
  }
  const last = rows.at(-1)
  if (
    last &&
    last.components.length < 5 &&
    last.components.every((item) => item.type === 2)
  )
    last.components.push(refresh)
  else if (rows.length < 5) rows.push({ type: 1, components: [refresh] })
  return { components: rows, allowedMentions: { parse: [] } }
}
module.exports = { createMessageTransport, lockedControls, attachmentMap }
