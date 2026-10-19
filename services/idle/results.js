const { EmbedBuilder } = require('discord.js')
const { intervalMs } = require('./combat')
const n = value => Number(value.toFixed(3))
function fighterSummary(actor) {
  const s = actor.summary
  return [
    `Level ${actor.level} · HP ${actor.maxHp} · Attack ${actor.attack}`,
    `Power ${actor.power} · Technique ${actor.technique} · Composure ${actor.composure}`,
    `Action interval ${intervalMs(actor.power) / 1000}s`,
    `Basic attacks ${s.basic} · Hope abilities ${s.hopeAbilities} · Stress abilities ${s.stressAbilities}`,
    `Hope generated/spent ${s.hopeGenerated}/${s.hopeSpent} · Fear generated ${s.fearGenerated} (awarded to opponent)`,
    `Criticals ${s.criticals} · Stress spent/lost/recovered ${n(s.stressSpent)}/${n(s.stressLost)}/${n(s.stressRecovered)}`,
    `Damage dealt/taken ${s.damageDealt}/${s.damageTaken} (includes overkill)`,
    `Remaining HP ${actor.hp}/${actor.maxHp} · Stress ${n(actor.stress)}/${actor.maxStress}`,
    `Remaining Hope ${actor.hope} · Fear held ${actor.fear}`,
  ].join('\n')
}
function logLine(event) {
  const prefix = `${(event.at / 1000).toFixed(2)}s ${event.side === 'player' ? 'P' : 'E'}`
  if (event.event) return `${prefix}: ${event.event}${event.hp ? ` → ${event.hp} HP` : ''}`
  return `${prefix}: ${event.name}${event.criticalBonus ? ' ×2' : ''} ${event.damage} dmg${event.combo ? ` [d4:${event.combo.join(',')}]` : ''} · ${event.roll.hope}/${event.roll.fear} ${event.roll.outcome}${event.roll.converted ? ' (Technique)' : ''}${event.stressLoss ? ` · -${n(event.stressLoss)} Stress` : ''}`
}
function resultEmbed(battle) {
  const winner = battle.status === 'limit' ? 'Unresolved (simulation limit)' :
    battle.status === 'victory' ? `Player — ${battle.player.name}${battle.tiedVictory ? ' (simultaneous KO rule)' : ''}` : `Enemy — ${battle.enemy.name}`
  // Keep first and final events and report omitted diagnostics explicitly.
  const lines = battle.log.map(logLine)
  const beginning = lines.slice(0, 6).map(line => line.slice(0, 160))
  const ending = lines.slice(Math.max(6, lines.length - 6)).map(line => line.slice(0, 160))
  const omitted = lines.length - beginning.length - ending.length
  const excerpt = [...beginning, ...(omitted > 0 ? [`… ${omitted} events omitted …`] : []), ...ending].join('\n')
  const embed = new EmbedBuilder().setTitle('Idle • Automated Arena prototype')
    .setDescription(`Player: **${battle.player.label}**\nEnemy: **${battle.enemy.label}**\nWinner: **${winner}**\nSimulated time: **${(battle.elapsedMs / 1000).toFixed(2)}s**`)
    .addFields({ name: 'Player', value: fighterSummary(battle.player), inline: true },
      { name: 'Enemy', value: fighterSummary(battle.enemy), inline: true })
    .setFooter({ text: 'Development prototype • No rewards • P = player, E = enemy • Natural criticals recover 1 Stress' })
  // At most 3 fields of <=1024 chars; the entire embed stays below 6000.
  let chunk = ''
  let index = 1
  for (const line of excerpt.split('\n')) {
    if (chunk.length + line.length + 1 > 1000) {
      embed.addFields({ name: `Timeline ${index++}`, value: chunk })
      chunk = ''
    }
    chunk += (chunk ? '\n' : '') + line
  }
  if (chunk) embed.addFields({ name: `Timeline ${index}`, value: chunk })
  return embed
}
module.exports = { resultEmbed, fighterSummary, logLine }
