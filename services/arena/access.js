const fs = require('node:fs'), path = require('node:path')
const settings = require('../../config/arena/arena-testing.json')
const stateFile = path.resolve(__dirname, '../../config/arena/state/arena-production-access.json')
function createAccess({ config = settings, file = stateFile, environment = () => process.env.NODE_ENV, guildId = () => process.env.GUILDID } = {}) {
  function read() {
    if (!fs.existsSync(file)) return { unlocked: false }
    const state = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (state.guildId !== config.productionGuildId || typeof state.unlocked !== 'boolean') throw Error('Invalid Arena access state')
    return state
  }
  function scope(interaction) {
    const env = environment()
    if (!['development', 'production'].includes(env) || !guildId() || interaction.guildId !== guildId()) return 'Arena is unavailable in this server.'
    if (env === 'production' && (!config.productionEnabled || interaction.guildId !== config.productionGuildId || interaction.channelId !== config.productionChannelId))
      return 'Arena tests are restricted to the bot-tests channel.'
    return null
  }
  function restriction(interaction) {
    const denied = scope(interaction)
    if (denied || environment() !== 'production') return denied
    try { return read().unlocked ? null : 'Arena testing is locked. The server owner can use /arena access:Unlock in bot-tests.' }
    catch { return 'Arena testing is locked because its access state is unavailable.' }
  }
  async function authorize(interaction) {
    const denied = restriction(interaction)
    if (!denied) return true
    await interaction.reply({ content: denied, ephemeral: true, allowedMentions: { parse: [] } }).catch(() => {})
    return false
  }
  async function manage(interaction, action) {
    let content = scope(interaction)
    if (!content && environment() !== 'production') content = 'The testing lock applies to the production bot-tests channel only.'
    if (!content && !['unlock', 'lock', 'status'].includes(action)) content = 'Unknown Arena access option.'
    if (content) return interaction.reply({ content, ephemeral: true, allowedMentions: { parse: [] } })
    await interaction.deferReply({ ephemeral: true })
    if (action === 'status') {
      try { content = `Arena testing is ${read().unlocked ? 'unlocked' : 'locked'}.` }
      catch { content = 'Arena testing is locked because its access state is unavailable.' }
    } else {
      // Fetch the current owner so ownership transfers and stale guild caches cannot grant access.
      const guild = await interaction.guild?.fetch?.()
      if (!guild || guild.id !== config.productionGuildId || guild.ownerId !== interaction.user.id) content = 'Only the current server owner can unlock or lock Arena testing.'
      else {
        const state = { guildId: guild.id, unlocked: action === 'unlock', changedBy: interaction.user.id, changedAt: new Date().toISOString() }
        fs.mkdirSync(path.dirname(file), { recursive: true })
        const temporary = file + '.tmp'
        fs.writeFileSync(temporary, JSON.stringify(state, null, 2)); fs.renameSync(temporary, file)
        content = `Arena testing is now ${state.unlocked ? 'unlocked for everyone in bot-tests' : 'locked for everyone'}.`
      }
    }
    return interaction.editReply({ content, allowedMentions: { parse: [] } })
  }
  return { scope, restriction, authorize, manage, read }
}
module.exports = { createAccess, access: createAccess() }
