const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js')
const path = require('node:path')
const { arenaEmojis } = require('./emojis')
const { defaultCharacter } = require('./characters')
const { statsForLevel, abilityAvailable, exhaustedStressMultiplier, abilities, activeTickMs, idleTickMs } = require('./rules')

const artFiles = (character = defaultCharacter) => [
  { attachment: path.join(__dirname, '../../assets/badges/Spooky/SPOOKY_MAXIM_BADGE.png'), name: 'arena-maxim.png' },
  { attachment: character.image, name: 'arena-marq.png' },
]

function healthDisplay(character) {
  const ratio = Math.max(0, Math.min(1, character.hp / character.maxHp))
  const filled = ratio > 0 ? Math.max(1, Math.round(ratio * 8)) : 0
  return { percent: Math.round(ratio * 100), bar: '``' + '🟥'.repeat(filled) + '⬛'.repeat(8 - filled) + '``' }
}
function stressBar(character) {
  return '``' + '🟦'.repeat(character.stress) + '⬛'.repeat(character.maxStress - character.stress) + '``'
}
const currencyFooter = (battle, reservedHope = 0, icons = {}) => ({ text:
  `Available: Hope ${(battle?.marq.hope || 0) - Number(reservedHope)}/6${reservedHope ? ` · ${Number(reservedHope)} queued` : ''} | Maxim: Fear ${battle?.warrior.fear || 0}`,
  ...(icons.hopeIcon ? { iconURL: icons.hopeIcon } : {}) })

function actionLines(actions = []) {
  return actions.map(event => {
    let text
    if (event.kind === 'roll') {
      const result = event.critical ? 'Critical success' : `${event.success ? 'Success' : 'Failure'} with ${event.withHope ? 'Hope' : 'Fear'}`
      const criticalEffects = event.critical ? `${event.hopeGained ? ' Gained 1 Hope.' : ''}${event.stressRestored ? ' Restored 1 Stress.' : ''} Next basic hit ×2.` : ''
      text = `🟡${event.hope} + 🟣${event.fear} = ${event.total}. ${result}.${criticalEffects}`
    } else if (event.kind === 'hit') {
      text = event.outcome === 'critical'
        ? `${event.actor} scored a critical hit! ${event.damage} damage${event.stressLost ? ' and removed 1 Stress' : ''}.`
        : event.damage ? `${event.actor} hit ${event.target} for ${event.damage}${event.stressLost ? ' and removed 1 Stress' : ''}.` : `${event.actor} missed.`
    } else if (event.kind === 'combo') {
      const rolls = event.rolls || []
      const chain = rolls.slice(0, 40).map(value => `🔺${value}`).join(' + ')
      const extra = rolls.length > 40 ? ` + … (${rolls.length - 40} more)` : ''
      text = chain ? `Combo Strike: ${chain}${extra} = **${event.total}%** · **${event.damage}** damage. (1 Stress)`
        : `Combo Strike dealt ${event.damage}. Spent 1 Stress.`
    }
    else if (event.kind === 'hope') text = `Hope Strike dealt ${event.damage}. Spent 1 Hope.`
    else if (event.kind === 'third') text = `Power Strike dealt ${event.damage}. Spent 2 Hope.`
    else return ''
    return `**${event.tick}.** ${text}`
  }).filter(Boolean)
}
function actionLog(actions = []) { return actionLines(actions.slice(-5)).join('\n') || 'The fight starts here.' }

function historyFields(history) {
  const lines = actionLines(history)
  let chosen = [], used = 0
  // Leave room for titles, rewards, field headings and the currency footer.
  // Keep complete action lines and prefer the most recent when the log is long.
  for (const line of lines.slice().reverse()) {
    if (used + line.length + 1 > 4800) break
    chosen.unshift(line); used += line.length + 1
  }
  const fields = [], omitted = lines.length - chosen.length
  let chunk = ''
  for (const line of chosen) {
    if (chunk && chunk.length + line.length + 1 > 1000) {
      fields.push({ name: fields.length ? 'Combat log · continued' : 'Combat log', value: chunk }); chunk = ''
    }
    chunk += (chunk ? '\n' : '') + line
  }
  if (chunk) fields.push({ name: fields.length ? 'Combat log · continued' : 'Combat log', value: chunk })
  if (!fields.length) fields.push({ name: 'Combat log', value: 'No actions recorded.' })
  return { fields, omitted }
}

function screen(session) {
  const { id, revision, battle } = session
  const pendingCombo = session.pendingSpecial === 'combo', pendingHope = session.pendingSpecial === 'hope'
  const pendingThird = session.pendingSpecial === 'third'
  const reservedHope = abilities[session.pendingSpecial]?.hopeCost || 0
  const character = session.character || defaultCharacter
  const playerName = battle?.marq.name || character.name
  const idle = battle?.mode === 'idle'
  const icons = arenaEmojis(session.guildId)
  const button = (action, label, style, disabled = false) => new ButtonBuilder()
    .setCustomId(`arena:${id}:${revision}:${action}`).setLabel(label).setStyle(style).setDisabled(disabled)
  const won = battle?.status === 'victory', lost = battle?.status === 'defeat'
  const ended = Boolean(battle && (won || lost || session.stopped))
  const embed = new EmbedBuilder().setColor(won ? 0x57a86b : lost ? 0xd55252 : 0x984b50)
    .setThumbnail('attachment://arena-marq.png')
    .setTitle(won ? 'VICTORY' : lost ? 'DEFEAT' : battle ? `${idle ? '⏩' : '⚔️'} ${playerName} vs Maxim · ${battle.tick}` : '⚔️ Arena')
    .setFooter(currencyFooter(battle, reservedHope, icons))
  // Explicitly clear the previous emoji-only content when repainting a message.
  const payload = buttons => ({ content: '', embeds: [embed],
    components: buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [], allowedMentions: { parse: [] } })
  const startButtons = (again = false) => [
    button('start', again ? 'Fight Again' : 'Start Fight', ButtonStyle.Primary).setEmoji('⚔️'),
    button('idle', 'Idle', ButtonStyle.Success).setEmoji('⏩'),
  ]
  if (won || lost) {
    const log = idle ? { fields: [], omitted: 0 } : historyFields(battle.history)
    embed.setDescription(`**Rewards:** None — prototype\n**Turns:** ${battle.tick} · ${idle ? 'Idle' : 'Active'}${log.omitted ? `\nShowing the most recent actions; ${log.omitted} earlier actions omitted.` : ''}`)
    if (!idle) embed.addFields(log.fields)
    return payload(startButtons(true))
  }
  embed.setImage('attachment://arena-maxim.png')
  if (!battle) {
    const stats = statsForLevel(session.level)
    embed.setDescription(`**${character.label}** vs Maxim · Difficulty 12\nBoth: Lv ${stats.level} · Rank ${stats.rank} · ${stats.maxHp} HP · ${stats.attack} Attack\n⚔️ Active · ${activeTickMs / 1000}-second turns · one special per turn\n⏩ Idle · ${idleTickMs / 1000}-second turns · dice + basic attacks\nStress 6/6 each · Hope Strike Lv 5 · Power Strike Lv 20`)
      .addFields({ name: 'Combat log', value: actionLog() })
    return payload(startButtons())
  }
  const dice = battle.duality
  const nextSeconds = (idle ? idleTickMs : activeTickMs) / 1000
  const outcome = dice ? dice.critical ? '⭐ Critical success' : `${dice.success ? '✅ Success' : '❌ Failure'} with ${dice.withHope ? 'Hope' : 'Fear'}` : `Next roll in ${nextSeconds} second${nextSeconds === 1 ? '' : 's'}`
  let summary = dice ? `${icons.hope} Hope **${dice.hope}** + ${icons.fear} Fear **${dice.fear}** = **${dice.total}**\n${outcome} · Difficulty 12` : outcome
  if (idle) summary += '\n⏩ Idle · basic attacks only'
  if (session.stopped && !won && !lost) summary += '\n⚠️ Paused · restart fight'
  if (pendingCombo) summary += '\n⏳ Combo Strike queued'
  if (pendingHope) summary += '\n⏳ Hope Strike queued'
  if (pendingThird) summary += '\n⏳ Power Strike queued'
  embed.setDescription(summary)
  const characterStatus = (name, character) => {
    const health = healthDisplay(character)
    return `**${name}** · Lv ${character.level} · Rank ${character.rank}\n❤️${character.hp}/${character.maxHp} (${health.percent}%)\n${health.bar}\n${stressBar(character)} Stress ${character.stress}/${character.maxStress}${character.stress === 0 ? `\n⚠️ Takes ×${exhaustedStressMultiplier} damage` : ''}`
  }
  embed.addFields({ name: '\u200b', value: characterStatus(playerName, battle.marq) + '\n\n' + characterStatus('Maxim', battle.warrior) })
  // Keep the last dice chain in the log while later actions advance.
  const lines = actionLines(battle.actions)
  if (battle.latestCombo && !battle.actions.some(event => event.kind === 'combo')) {
    lines.unshift(...actionLines([{ kind: 'combo', ...battle.latestCombo }]))
  }
  embed.addFields({ name: 'Combat log', value: lines.join('\n') || 'The fight starts here.' })
  if (idle) return payload(ended ? startButtons(true) : [])
  const buttons = [button('combo', pendingCombo ? 'Combo Strike [queued]' : 'Combo Strike [1 Stress]', ButtonStyle.Primary,
    ended || pendingCombo || battle.marq.stress <= 0).setEmoji('⚔️')]
  if (!abilityAvailable(battle.marq, 'hope')) buttons.push(button('hope', 'Hope Strike [Lv 5]', ButtonStyle.Success, true).setEmoji(icons.hopeButton))
  else if (battle.marq.hope > 0) buttons.push(button('hope', pendingHope ? 'Hope Strike [queued]' : 'Hope Strike [1 Hope]', ButtonStyle.Success,
    ended || pendingHope).setEmoji(icons.hopeButton))
  buttons.push(button('third', !abilityAvailable(battle.marq, 'third') ? 'Power Strike [Lv 20]' : pendingThird ? 'Power Strike [queued]' : 'Power Strike [2 Hope]', ButtonStyle.Danger,
    ended || pendingThird || !abilityAvailable(battle.marq, 'third') || battle.marq.hope < abilities.third.hopeCost).setEmoji('💥'))
  if (ended) buttons.push(...startButtons(true))
  return payload(buttons)
}

module.exports = { screen, artFiles, currencyFooter, actionLog, historyFields }
