const { flatEvents } = require('./battle-report')
const number = value => Math.max(0, Number(value) || 0)
const sum = value => Object.values(value || {}).reduce((total, n) => total + number(n), 0)

function plainText(value = '') {
  return String(value)
    .replace(/^\*\*\d+\.\*\*\s*/, '')
    .replace(/\*\*/g, '')
    .replaceAll('🟡', 'Hope ')
    .replaceAll('🟣', 'Fear ')
    .replaceAll('🔺', 'd4=')
    .replace(/[·•]/g, ' | ')
    .replaceAll('×', 'x')
    .replaceAll('→', '->')
    .replaceAll('…', '...')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u200D]/gu, '')
}
const cleanName = value => plainText(value).replace(/[\r\n\t\x00-\x1f]/g, ' ').trim()
function playerLabel(report) {
  const username = cleanName(report.ownerUsername)
  const display = cleanName(report.ownerDisplayName)
  if (!username) return display || 'Unknown player'
  return display && display !== username ? `${display} (@${username})` : `@${username}`
}
const seconds = value => Number.isFinite(value) ? `${(value / 1000).toFixed(2)}s` : '-'

function formatDiagnostic(report) {
  const { actionLines } = require('./interface')
  const battle = report.battle, stats = battle.statistics || {}
  const names = [plainText(battle.player.name), plainText(battle.enemy.name)]
  const lines = [
    `ARENA - ${String(battle.status).toUpperCase()}`,
    `Player: ${playerLabel(report)}`,
    require('./versioning').label(report.arenaVersion || battle.arenaVersion),
    `Match: ${names[0]} (you) vs ${names[1]} (opponent)`,
    `Turns: ${battle.tick}`,
    `Game: https://discord.com/channels/${report.guildId}/${report.channelId}/${report.messageId}`,
    '', 'RESULT', '------',
  ]
  for (const side of ['player', 'enemy']) {
    const fighter = battle[side], row = stats[side] || {}
    lines.push(
      `${plainText(fighter.name)} (${side === 'player' ? 'you' : 'opponent'})`,
      `  HP remaining: ${number(fighter.hp)} / ${number(fighter.maxHp)}`,
      `  Damage dealt: ${sum(row.damage)} (${number(row.hpDamage)} HP removed; ${number(row.overkill)} overkill)`,
      `  HP restored: ${number(row.hpRestored)}${row.brinkActivations ? `; revives: ${row.brinkActivations}` : ''}`,
      '',
    )
  }
  const totals = Object.entries(report.roundTimings || {}).filter(([,r]) => Number.isFinite(r.totalMs))
  if (totals.length) {
    const sorted = totals.map(([,r])=>r.totalMs).sort((a,b)=>a-b)
    const middle = Math.floor(sorted.length / 2)
    const median = sorted.length % 2 ? sorted[middle] : (sorted[middle-1] + sorted[middle]) / 2
    const slowest = totals.reduce((a,b)=>a[1].totalMs>b[1].totalMs?a:b)
    lines.push(`Turn timing: median ${seconds(median)}; slowest ${seconds(slowest[1].totalMs)} (turn ${slowest[0]}).`, '')
  }
  lines.push('TURN-BY-TURN', '------------')
  const rounds = new Map()
  for (const event of flatEvents(battle.history)) {
    if (!rounds.has(event.tick)) rounds.set(event.tick, [])
    rounds.get(event.tick).push(event)
  }
  for (const [tick, events] of rounds) {
    const timing = report.roundTimings?.[tick]
    lines.push('', `Turn ${tick}${Number.isFinite(timing?.totalMs) ? ` - ${seconds(timing.totalMs)}` : ''}`)
    for (const event of events) {
      const text = actionLines([event])[0]
      if (text) lines.push(`  ${event.kind === 'roll' ? 'Roll: ' : ''}${plainText(text)}`)
    }
  }
  lines.push('', 'DETAILED TOTALS', '---------------')
  const player = stats.player || {}, enemy = stats.enemy || {}
  const selfDamage = side => flatEvents(battle.history)
    .filter(event => event.kind === 'sacrifice' && event.actor ===
      (side === 'player' && battle.player.name === battle.enemy.name ? `Your ${battle.player.name}` : battle[side].name))
    .reduce((total,event)=>total+number(event.hp),0)
  const rows = [
    ['Basic damage', r=>number(r.damage?.basic)],
    ['S1/S2 damage', r=>number(r.damage?.special1)+number(r.damage?.special2)],
    ['Finisher damage', r=>number(r.damage?.special3)],
    ['Bleed damage', r=>number(r.damage?.bleeding)],
    ['Critical basics', r=>sum(r.criticals)],
    ['Specials used', r=>number(r.uses?.special1)+number(r.uses?.special2)],
    ['Finishers used', r=>number(r.uses?.special3)],
    ['Own packets blocked', r=>sum(r.blocks)],
    ['Finishers resisted / faced', r=>`${number(r.superMoveResistance?.resisted)} / ${number(r.superMoveResistance?.attempts)}`],
    ['Resistance damage prevented', r=>number(r.superMoveResistance?.prevented)],
    ['Duality earned / spent', r=>`${number(r.generated)} / ${number(r.spent)}`],
    ['Stress spent / recovered', r=>`${number(r.stressSpent)} / ${number(r.stressRecovered)}`],
  ]
  lines.push('Metric'.padEnd(30) + names[0].padEnd(20) + names[1])
  for (const [label, read] of rows) lines.push(label.padEnd(30)+String(read(player)).padEnd(20)+String(read(enemy)))
  lines.push('Incoming packets blocked'.padEnd(30)+String(sum(enemy.blocks)).padEnd(20)+sum(player.blocks))
  lines.push('Self-damage'.padEnd(30)+String(selfDamage('player')).padEnd(20)+selfDamage('enemy'))
  lines.push('', 'TIMING BREAKDOWN', '----------------', 'Times are bot processing and Discord delivery, not player thinking time.',
    'Action'.padEnd(20)+'Turn'.padEnd(7)+'Total'.padEnd(10)+'Combat'.padEnd(10)+'Render'.padEnd(10)+'Discord'.padEnd(10)+'Requests / rate limits')
  const actions = { open:'Open Arena',start:'Start fight',basic:'Basic',special1:'S1',special2:'S2',special3:'Open finisher',pick:'Finisher selection','finisher-timeout':'Finisher timeout' }
  for (const record of report.interactionTimings || []) {
    const render = Number.isFinite(record.renderMs) || Number.isFinite(record.legendMs)
      ? number(record.renderMs)+number(record.legendMs) : undefined
    lines.push((actions[record.action] || record.action || 'Update').padEnd(20)+String(record.round || '-').padEnd(7)+
      seconds(record.totalMs).padEnd(10)+seconds(record.combatMs).padEnd(10)+seconds(render).padEnd(10)+seconds(record.deliveryMs).padEnd(10)+
      `${record.restAttempts ?? '-'} / ${record.restRateLimits ?? '-'}${record.failed ? ' - DELIVERY FAILED' : ''}`)
  }
  lines.push('', 'Notes: Damage dealt includes overkill. HP removed is effective damage.',
    'Exposed means 0 Stress and increased damage taken. Bleed bypasses Block.',
    'Complete timing metadata and battle state are retained in the local technical archive.',
    `Report reference: ${report.sessionId}, fight ${report.fightNumber}`)
  return lines.join('\r\n') + '\r\n'
}
const utf8Text = text => Buffer.from('\uFEFF' + text, 'utf8')
module.exports = { plainText, playerLabel, formatDiagnostic, utf8Text }
