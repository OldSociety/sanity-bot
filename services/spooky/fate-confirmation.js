const { privateScreen, withBalances, fateBalanceFields } = require('./presentation')
const sessions = new Set()
const prefix = 'spooky-spend-fate:'
function hasSession(customId) { return sessions.has(customId) }
function confirmationPayload(interaction, quote, event) {
  const paymentText = event.fate.paymentResource === 'normal-fate-only' ? '**normal Fate only**. Banked Fate is reserved for rerolls' : '**Bank first**, then your **Fate balance**'
  const payload = withBalances(privateScreen('🔮 Spend Fate Points?',
    `Buy **one random quarter** for **${event.fate.quarterCost} Fate Points**?\n\nPayment uses ${paymentText}. The numbers below show this purchase's deductions.\nA duplicate is possible; five duplicates automatically grant an unowned piece.\n\nNothing is spent until you press **Confirm**. This offer expires in two minutes.`, fateBalanceFields(quote.payment)), quote)
  if (interaction.user.displayAvatarURL) payload.embeds[0].thumbnail = { url: interaction.user.displayAvatarURL() }
  payload.components = [{ type: 1, components: [
    { type: 2, style: 3, custom_id: `${prefix}${interaction.id}:confirm`, label: 'Confirm' },
    { type: 2, style: 4, custom_id: `${prefix}${interaction.id}:cancel`, label: 'Cancel' },
  ] }]
  return payload
}
async function showConfirmation(interaction, { quote, event, onConfirm }) {
  const payload = confirmationPayload(interaction, quote, event)
  const ids = payload.components[0].components.map(button => button.custom_id)
  ids.forEach(id => sessions.add(id))
  try {
    await interaction.editReply(payload)
    const message = await interaction.fetchReply()
    await new Promise((resolve, reject) => {
      let claimed = false
      const collector = message.createMessageComponentCollector({ time: 120000, filter: button => ids.includes(button.customId) })
      const deny = button => button.reply({ content: 'This confirmation belongs to another player or has already been handled.', ephemeral: true, allowedMentions: { parse: [] } }).catch(() => {})
      collector.on('collect', async button => {
        if (claimed || button.user.id !== interaction.user.id || button.guildId !== interaction.guildId || button.channelId !== interaction.channelId) return deny(button)
        // Claim synchronously before any awaited acknowledgement or DB work.
        claimed = true
        try {
          await button.deferUpdate()
          await interaction.editReply({ components: [] })
          collector.stop('handled')
          // The collector has stopped: later clicks use the global expired-
          // confirmation handler while the committed reward is being delivered.
          ids.forEach(id => sessions.delete(id))
          if (button.customId.endsWith(':confirm')) await onConfirm()
          else await interaction.editReply({ ...withBalances(privateScreen('🔮 Purchase Cancelled', 'Your Fate Points are untouched.'), quote), components: [] })
          resolve()
        } catch (error) { collector.stop('failed'); reject(error) }
      })
      collector.on('end', () => {
        if (claimed) return
        claimed = true
        void interaction.editReply({ ...withBalances(privateScreen('🔮 Confirmation Expired', 'Nothing was spent. Use /spooky spend-fate to review a new purchase.'), quote), components: [] })
          .catch(() => {}).finally(resolve)
      })
    })
  } finally { ids.forEach(id => sessions.delete(id)) }
}
module.exports = { showConfirmation, confirmationPayload, hasSession, prefix }
