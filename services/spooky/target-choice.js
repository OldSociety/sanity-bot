const { privateScreen, withBalances } = require('./presentation')
const { safeName } = require('../display-name')
const prefix = 'spooky-target:'
const sessions = new Set()
function hasSession(id) { return sessions.has(id) }
async function chooseTarget(interaction, candidates, { outcome, timeoutMs = 20000, random = Math.random, balances = {}, event }) {
  if (!candidates.length) return null
  const value = random()
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Invalid target fallback roll')
  // Freeze the fallback before waiting; a timeout never rerolls the action.
  const fallback = candidates[Math.floor(value * candidates.length)].userId
  const ids = candidates.map((_, i) => `${prefix}${interaction.id}:${i}`)
  ids.forEach(id => sessions.add(id))
  try {
    const payload = withBalances(privateScreen(outcome === 'temporary_immunity' ? '✨ Choose Your Sweet Shield!' : outcome === 'break_curse' ? '💫 Whose Curse Will You Break?' : '🦇 Choose Your Curse!',
      `Pick someone below within ${timeoutMs / 1000} seconds. If you leave it to Halloween magic, one of these people will be chosen at random.${outcome === 'temporary_immunity' ? ' A cursed player will have their curse broken instead of receiving a shield.' : ''}`), balances, new Date(), event)
    if (interaction.user.displayAvatarURL) payload.embeds[0].thumbnail = { url: interaction.user.displayAvatarURL() }
    await interaction.editReply({ ...payload,
      components: [{ type: 1, components: candidates.map((member, i) => ({ type: 2, style: 2,
        custom_id: ids[i], label: safeName(member.displayName || member.userId).slice(0, 80) })) }] })
    const message = await interaction.fetchReply()
    return await new Promise((resolve, reject) => {
      let claimed = false
      const collector = message.createMessageComponentCollector({ time: timeoutMs, filter: button => ids.includes(button.customId) })
      collector.on('collect', async button => {
        if (claimed || button.user.id !== interaction.user.id || button.guildId !== interaction.guildId || button.channelId !== interaction.channelId)
          return button.reply({ content: 'This choice belongs to another player or has already been made.', ephemeral: true, allowedMentions: { parse: [] } }).catch(() => {})
        claimed = true
        try {
          await button.deferUpdate()
          await interaction.editReply({ components: [] })
          collector.stop('chosen')
          resolve(candidates[ids.indexOf(button.customId)].userId)
        } catch (error) { collector.stop('failed'); reject(error) }
      })
      collector.on('end', () => {
        if (claimed) return
        claimed = true
        void interaction.editReply({ components: [] }).then(() => resolve(fallback), reject)
      })
    })
  } finally { ids.forEach(id => sessions.delete(id)) }
}
module.exports = { chooseTarget, hasSession, prefix }
