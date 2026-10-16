const { randomInt } = require('node:crypto')
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder } = require('discord.js')

const CAPACITY = 21
const MAX_SCOOP = 8
const OUTCOME_GIFS = Object.freeze({
  spilled: 'https://media.tenor.com/J1zMGA5zcQEAAAAM/the-office-coffee.gif',
  perfect: 'https://media.tenor.com/9TKTJjfrPpAAAAAM/hot-chocolate-pour.gif',
})
const newCup = () => ({ fullness: 0, scoops: 0, lastScoop: 0, status: 'playing' })
const newSession = () => ({ completed: 0, served: 0, perfect: 0, spilled: 0, candyCanes: 0 })

function recordCup(totals, cup) {
  if (!['served', 'perfect', 'spilled'].includes(cup.status)) return totals
  return { ...totals, completed: totals.completed + 1,
    served: totals.served + Number(cup.status !== 'spilled'),
    perfect: totals.perfect + Number(cup.status === 'perfect'),
    spilled: totals.spilled + Number(cup.status === 'spilled') }
}

function recap(totals, userId) {
  const percent = count => totals.completed ? `${Math.round(count / totals.completed * 1000) / 10}%` : '0%'
  const embed = new EmbedBuilder().setTitle('☕ Cocoa Stand Recap').setColor(0xad794d)
    .setDescription(`<@${userId}> finished **${totals.completed}** ${totals.completed === 1 ? 'cup' : 'cups'}.`)
    .addFields({ name: 'Drinks served', value: String(totals.served), inline: true },
      { name: '🍬 Candy Canes earned', value: String(totals.candyCanes), inline: true },
      { name: '✨ Perfect pours', value: `${totals.perfect} (${percent(totals.perfect)})`, inline: true },
      { name: '💦 Spilled drinks', value: `${totals.spilled} (${percent(totals.spilled)})`, inline: true })
    .setFooter({ text: 'Percentages of all completed cups • Development playtest' })
  return { embeds: [embed], ephemeral: false, allowedMentions: { parse: [] } }
}

function advance(cup, action, scoop) {
  if (action === 'again' && ['served', 'perfect', 'spilled'].includes(cup.status)) return newCup()
  if (cup.status !== 'playing') return cup
  if (action === 'serve') return cup.fullness ? { ...cup, status: 'served' } : cup
  if (action === 'quit') return { ...cup, status: 'quit' }
  if (action !== 'add') return cup
  if (!Number.isInteger(scoop) || scoop < 1 || scoop > MAX_SCOOP) throw new Error('Cocoa scoop must be an integer from 1 to 8.')
  const fullness = cup.fullness + scoop
  return { fullness, scoops: cup.scoops + 1, lastScoop: scoop,
    status: fullness > CAPACITY ? 'spilled' : fullness === CAPACITY ? 'perfect' : 'playing' }
}

function phrase(cup) {
  if (cup.status === 'spilled') return 'Oh no! Cocoa over the rim and onto the counter. Grab a fresh cup?'
  if (cup.status === 'perfect') return 'Perfect! Right to the rim, without a drop wasted.'
  if (cup.status === 'quit') return 'The cocoa stand is closed. Come back whenever you like.'
  if (cup.status === 'expired') return 'Your cocoa has gone cold. Use /cocoa for a fresh cup.'
  if (cup.status === 'error') return 'The cocoa stand could not finish this cup. Use /cocoa to try again.'
  if (cup.status === 'served') return cup.fullness >= 19 ? 'An exceptional cup! Right up to the rim, served with a steady hand.'
    : cup.fullness >= 16 ? 'A generous cup of cocoa. Beautifully served!' : 'A warm cup of cocoa, ready to serve.'
  if (cup.fullness === 20) return 'One little splash could spill it. Only a scoop of 1 will fit!'
  if (cup.fullness === 19) return 'Careful! Only a scoop of 1 or 2 will fit.'
  if (cup.fullness >= 16) return 'Getting close to the rim. Check how much room is left.'
  if (cup.fullness >= 12) return 'That is a satisfying cup. Keep pouring, or serve it now?'
  if (cup.fullness > 0) return 'Still plenty of room for more cocoa.'
  return 'An empty cup and a warm pot. Let’s pour!'
}

function rewardTier(cup) {
  if (cup.fullness === 0 || !['playing', 'served', 'perfect'].includes(cup.status)) return 'None'
  return cup.fullness >= 19 ? 'Exceptional' : cup.fullness >= 16 ? 'Generous' : 'Standard'
}

function screen(cup, sessionId, revision, closed = false, totals = newSession()) {
  const filled = Math.min(CAPACITY, cup.fullness)
  const bar = '▰'.repeat(filled) + '▱'.repeat(CAPACITY - filled)
  const title = { playing: '☕ Hot Cocoa Stand', served: '☕ Cocoa Served', perfect: '✨ The Perfect Cup',
    spilled: '💦 Cocoa Spilled', quit: '☕ Stand Closed', expired: '☕ Cocoa Gone Cold', error: '☕ Stand Unavailable' }[cup.status]
  const embed = new EmbedBuilder().setTitle(title)
    .setColor(cup.status === 'spilled' ? 0xdc6868 : ['served', 'perfect'].includes(cup.status) ? 0x69b98b : 0xad794d)
    .setDescription(`**${cup.fullness} / ${CAPACITY}**\n${bar}\n\n${phrase(cup)}`)
    .addFields({ name: 'Scoops poured', value: String(cup.scoops), inline: true },
      { name: 'Last scoop', value: cup.lastScoop ? `+${cup.lastScoop}` : '—', inline: true })
    .addFields({ name: 'Reward tier · preview', value: `**${rewardTier(cup)}**`, inline: true },
      { name: 'Session pot', value: `🍬 **${totals.candyCanes} Candy Canes** · ${totals.completed} cups completed` })
    .setFooter({ text: closed ? 'Session ended • Use /cocoa to play again • No rewards' : 'Development playtest • No currency or rewards' })
  if (OUTCOME_GIFS[cup.status]) embed.setImage(OUTCOME_GIFS[cup.status])
  if (cup.status === 'playing' && cup.scoops === 0 && totals.completed === 0) embed.addFields({ name: 'How to play',
    value: 'Each scoop adds **1–8**, with equal chances. Serve whenever you like. Reach **21** for a perfect cup; go over and it spills.\n1–15: modest · 16–18: much higher · 19–21: exceptional.\n**Play Again** keeps your session going. **Collect** ends it and posts a public recap. Candy Canes stay at **0** for now.' })
  const button = (action, label, style) => new ButtonBuilder().setCustomId(`cocoa:${sessionId}:${revision}:${action}`).setLabel(label).setStyle(style)
  let buttons = []
  if (cup.status === 'playing') buttons = [button('add', 'Add Cocoa', ButtonStyle.Primary),
    button('serve', 'Serve', ButtonStyle.Success).setDisabled(cup.fullness === 0),
    button('collect', 'Collect', ButtonStyle.Success).setDisabled(totals.completed === 0), button('quit', 'Quit', ButtonStyle.Secondary)]
  else if (['served', 'perfect', 'spilled'].includes(cup.status)) buttons = [button('again', 'Play Again', ButtonStyle.Primary),
    button('collect', 'Collect', ButtonStyle.Success)]
  return { embeds: [embed], components: !closed && buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [], allowedMentions: { parse: [] } }
}

function createCocoaCommand({ roll = () => randomInt(1, MAX_SCOOP + 1),
  idleMs = 60 * 1000, lifetimeMs = 10 * 60 * 1000, logger = console } = {}) {
  return async interaction => {
    let cup = newCup(), totals = newSession(), revision = 0, busy = false, ending = null, closing = null
    const sessionId = interaction.id
    // The collector belongs to this private reply, never the entire channel.
    const render = (closed = false) => screen(cup, sessionId, revision, closed, totals)
    const message = await interaction.reply({ ...render(), ephemeral: true, fetchReply: true })
    const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, idle: idleMs, time: lifetimeMs })
    function close(reason) {
      if (closing) return closing
      // Reserve finalization before any asynchronous send; repeated clicks and
      // timeout races must never publish a second public recap.
      closing = (async () => {
        if (reason === 'error') cup = { ...cup, status: 'error' }
        else if (cup.status === 'playing') cup = { ...cup, status: ['quit', 'collect'].includes(reason) ? 'quit' : 'expired' }
        revision++
        await interaction.editReply(render(true)).catch(() => {})
        if (totals.completed) {
          try { await interaction.followUp(recap(totals, interaction.user.id)) }
          catch (error) { logger.error('Cocoa recap could not be delivered:', error.message) }
        }
      })()
      return closing
    }
    collector.on('collect', async click => {
      const prefix = `cocoa:${sessionId}:`
      if (!click.customId.startsWith(prefix)) return
      const [version, action] = click.customId.slice(prefix.length).split(':')
      if (click.user.id !== interaction.user.id) {
        await click.reply({ content: 'This cup belongs to another player. Use /cocoa to make your own.', ephemeral: true }).catch(() => {})
        return
      }
      if (ending || busy || Number(version) !== revision || !['add', 'serve', 'quit', 'again', 'collect'].includes(action)) {
        await click.deferUpdate().catch(() => {})
        return
      }
      // Lock before acknowledging: double clicks cannot pour twice or serve an old cup.
      busy = true
      try {
        await click.deferUpdate()
        if (ending) return
        if (action === 'collect') {
          if (totals.completed) collector.stop('collect')
          return
        }
        const next = advance(cup, action, action === 'add' && cup.status === 'playing' ? roll() : undefined)
        if (next !== cup) {
          if (cup.status === 'playing') totals = recordCup(totals, next)
          cup = next
          revision++
          await interaction.editReply(render())
        }
        if (cup.status === 'quit') collector.stop('quit')
      } catch (error) {
        logger.error('Cocoa game unavailable:', error.message)
        cup = { ...cup, status: 'error' }
        collector.stop('error')
      } finally {
        busy = false
        if (ending) await close(ending)
      }
    })
    collector.on('end', async (_, reason) => {
      ending = reason
      if (!busy) await close(reason)
    })
    return collector
  }
}

module.exports = { CAPACITY, MAX_SCOOP, newCup, newSession, recordCup, recap, advance, phrase, rewardTier, screen, createCocoaCommand }
