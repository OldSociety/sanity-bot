const path = require('node:path')
const { createJsonStore } = require('./async-state')
const { requireBotAdmin } = require('../../utils/botAdmin')

function createDiagnosticSettings(
  file = path.resolve(
    __dirname,
    '../../config/arena/state/arena-diagnostics-development.json'
  )
) {
  const store = createJsonStore(file, {
    empty: () => ({ diagnostic: false }),
    validate: (value) =>
      Boolean(value && typeof value.diagnostic === 'boolean'),
  })
  let cached = false,
    loaded = false,
    loading
  async function get() {
    if (loaded) return cached
    loading ||= store
      .read()
      .then((value) => {
        cached = value.diagnostic
        loaded = true
        return cached
      })
      .finally(() => {
        loading = null
      })
    return loading
  }
  async function set(diagnostic) {
    if (typeof diagnostic !== 'boolean')
      throw Error('Expected diagnostic true or false')
    await store.update((value) => ({ ...value, diagnostic }))
    cached = diagnostic
    loaded = true
  }
  return { get, set }
}
const diagnosticSettings = createDiagnosticSettings()
async function manageDiagnostic(
  interaction,
  value,
  {
    settings = diagnosticSettings,
    authorize = requireBotAdmin,
    environment = process.env.NODE_ENV,
  } = {}
) {
  if (environment !== 'development')
    return interaction.reply({
      content: 'Arena diagnostics can only be changed on the development bot.',
      ephemeral: true,
      allowedMentions: { parse: [] },
    })
  if (!(await authorize(interaction))) return
  await interaction.deferReply({ ephemeral: true })
  try {
    await settings.set(value)
    return interaction.editReply({
      content: `Arena diagnostic: ${value}. ${
        value
          ? 'Detailed logs with rolls, costs and timings are enabled.'
          : 'Compact gameplay logs are enabled; log rolls, detailed tracking and timings are hidden.'
      } Portraits, live dice and Duality emojis, and the status key stay visible in both modes. Active fights use this setting on their next update.`,
      allowedMentions: { parse: [] },
    })
  } catch {
    return interaction.editReply({
      content:
        'The diagnostic setting could not be saved. The previous setting remains active.',
      allowedMentions: { parse: [] },
    })
  }
}
module.exports = {
  createDiagnosticSettings,
  diagnosticSettings,
  manageDiagnostic,
}
