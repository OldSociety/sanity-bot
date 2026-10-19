const sum = (value) =>
  Object.values(value || {}).reduce((total, n) => total + (Number(n) || 0), 0)
const amount = (value) => Math.max(0, Number(value) || 0)
function flatEvents(events = []) {
  return events.flatMap((event) =>
    event.kind === 'move' ? flatEvents(event.events) : [event]
  )
}
function sideFor(battle, event) {
  const mirror = battle.player.name === battle.enemy.name
  return event.actor ===
    (mirror ? `Your ${battle.player.name}` : battle.player.name)
    ? 'player'
    : event.actor === battle.enemy.name
    ? 'enemy'
    : null
}
function summaryFields(battle) {
  const events = flatEvents(battle.history)
  return ['player', 'enemy'].map((side) => {
    const other = side === 'player' ? 'enemy' : 'player'
    const stats = battle.statistics?.[side] || {},
      opposing = battle.statistics?.[other] || {}
    const own = events.filter((event) => sideFor(battle, event) === side)
    const raw = stats.damage || {}
    const basic = amount(raw.basic),
      specials = amount(raw.special1) + amount(raw.special2),
      final = amount(raw.special3),
      bleed = amount(raw.bleeding)
    const self = own
      .filter((event) => event.kind === 'sacrifice')
      .reduce((total, event) => total + amount(event.hp), 0)
    const criticals = stats.criticals
      ? sum(stats.criticals)
      : own
          .filter((event) => event.kind === 'hit')
          .reduce(
            (total, event) =>
              total +
              (event.strikes
                ? event.strikes.filter(
                    (strike) => strike.outcome === 'critical'
                  ).length
                : Number(event.outcome === 'critical')),
            0
          )
    const uses = stats.uses || {}
    const lines = [
      `Basic **${basic}** · Specials S1/S2 **${specials}** · Final **${final}**${
        bleed ? ` · Bleeding **${bleed}**` : ''
      }`,
      `Total damage **${sum(raw)}** · HP removed **${amount(
        stats.hpDamage
      )}** · Overkill **${amount(stats.overkill)}**`,
      `HP restored **${amount(stats.hpRestored)}** · Self-damage **${self}**${
        stats.brinkActivations ? ` · Revives **${stats.brinkActivations}**` : ''
      }`,
      `Criticals **${criticals}** · Specials used **${
        amount(uses.special1) + amount(uses.special2)
      }** · Finals used **${amount(uses.special3)}**`,
      `Packets blocked **${sum(
        opposing.blocks
      )}** · Own packets blocked **${sum(stats.blocks)}**`,
    ]
    if (stats.superMoveResistance?.attempts)
      lines.push(
        `Finals resisted **${amount(stats.superMoveResistance.resisted)} / ${
          stats.superMoveResistance.attempts
        }** · Damage prevented **${amount(
          stats.superMoveResistance.prevented
        )}**`
      )
    if (stats.resource)
      lines.push(
        `${stats.resource} gained/spent **${amount(stats.generated)} / ${amount(
          stats.spent
        )}** · Stress spent/recovered **${amount(stats.stressSpent)} / ${amount(
          stats.stressRecovered
        )}**`
      )
    return {
      name: `${battle[side].name} · ${
        side === 'player' ? 'You' : 'Opponent'
      }`.slice(0, 256),
      value: lines.join('\n').slice(0, 1024),
    }
  })
}
function playerRecapFields(battle) {
  const fields = ['player', 'enemy'].map((side) => {
    const fighter = battle[side],
      stats = battle.statistics?.[side] || {}
    return {
      name: `${fighter.name} · ${side === 'player' ? 'You' : 'Opponent'}`,
      value: `HP **${amount(fighter.hp)} / ${amount(fighter.maxHp)}**\nDamage dealt **${amount(stats.hpDamage)}**${
        stats.hpRestored ? ` · HP restored **${amount(stats.hpRestored)}**` : ''
      }`,
    }
  })
  const moments = flatEvents(battle.history)
    .filter(
      (event) => event.kind === 'survival' ||
        (event.kind === 'special' && event.slot === 'special3')
    )
    .slice(-3)
    .map((event) =>
      event.kind === 'survival'
        ? `Turn ${event.tick}: ${event.actor} survived with **${amount(event.hp)} HP**.`
        : `Turn ${event.tick}: ${event.actor} used **${event.name.toUpperCase()}** for **${amount(event.damage)} damage**${event.resisted ? ' (resisted)' : ''}.`
    )
  if (moments.length)
    fields.push({ name: 'Highlights', value: moments.join('\n').slice(0, 1024) })
  return fields
}
function compactEvent(event) {
  if (['stressed', 'stressRelief'].includes(event.kind))
    return require('./stress-log').stressLine(event)
  if (event.kind === 'hit')
    return `${event.actor} → ${event.target}: **${amount(
      event.damage
    )}** damage.${event.stressedTargetMultiplier ? require('./stress-log').damageNote(event) : ''}`
  if (event.kind === 'sacrifice')
    return `${event.actor}: **−${amount(event.hp)} HP** self-damage.`
  if (event.kind === 'survival')
    return `${event.actor}: restored to **${amount(event.hp)} HP**.`
  if (event.kind === 'special') {
    if (event.type === 'heal')
      return `${event.actor} · **${event.name.toUpperCase()}**: **+${amount(event.healing)} HP** healed.${event.healingOnly ? ' Healing only; no attack.' : ''}`
    if (['rage', 'buff', 'windWall', 'bleeding'].includes(event.type))
      return `${event.actor} used **${event.name.toUpperCase()}**.`
    if (typeof event.damage === 'number')
      return `${event.actor} · **${event.name.toUpperCase()}**: **${amount(
        event.damage
      )}** damage.${event.stressedTargetMultiplier ? require('./stress-log').damageNote(event) : ''}`
  }
  return ''
}
function reportLines(
  history,
  verboseLines,
  { diagnostic = true, timings = {} } = {}
) {
  const rounds = new Map()
  for (const event of flatEvents(history)) {
    if (!rounds.has(event.tick)) rounds.set(event.tick, [])
    rounds.get(event.tick).push(event)
  }
  const lines = []
  for (const [tick, events] of rounds) {
    const rolls = diagnostic
      ? events.filter((event) => event.kind === 'roll')
      : []
    const others = events.filter((event) => event.kind !== 'roll')
    const body = others
      .map((event) =>
        diagnostic
          ? (verboseLines([event])[0] || '').replace(/^\*\*\d+\.\*\* /, '')
          : compactEvent(event)
      )
      .filter(Boolean)
    if (!rolls.length && !body.length) continue
    if (rolls.length) lines.push(...verboseLines(rolls))
    else lines.push(`**${tick}.**`)
    lines.push(...body)
    if (diagnostic && Number.isFinite(timings[tick]?.totalMs))
      lines.push(
        `(${timings[tick].totalMs}ms)${
          timings[tick].failed ? ' · delivery failed' : ''
        }`
      )
  }
  return lines
}
function recapText(battle, lines, { diagnostic = true, interactions = [] } = {}) {
  const labels = {
    open: 'Character select',
    chooseskin: 'Choose skin',
    confirmfighter: 'Confirm fighter',
    selectcharacter: 'Select character',
    selectskin: 'Select skin',
    start: 'Start fight',
  }
  return [
    `BATTLE RECAP · ${battle.tick} rounds · ${battle.status}`,
    ...summaryFields(battle).flatMap((field) => [field.name, field.value]),
    'Damage totals include overkill; HP removed is effective opponent HP damage. Blocks count packets, including independent strikes; self-damage is separate. Specials excludes Finals. HP restored includes revives.',
    ...(diagnostic
      ? ['Round timings measure bot processing and Discord delivery, not client image paint. The update carrying this file is still being sent; its completed total is recorded server-side after delivery.']
      : []),
    ...(diagnostic && interactions.length
      ? [
          '',
          'INTERACTION TIMINGS',
          ...interactions.map(
            (record) =>
              `${labels[record.action] || record.action}${
                record.round ? ` · round ${record.round}` : ''
              }: (${record.totalMs}ms)${record.failed ? ' · failed' : ''} · ${[
                'ackMs',
                'combatMs',
                'assetMs',
                'renderMs',
                'legendMs',
                'deliveryMs',
                'restPrepareWaitMs',
                'restHttpHeadersMs',
                'restAfterHeadersMs',
              ]
                .filter((key) => Number.isFinite(record[key]))
                .map((key) => `${key}=${record[key]}`)
                .join(' · ')}${
                record.responseMode ? ` · ${record.responseMode}` : ''
              }`
          ),
        ]
      : []),
    '',
    'ROUND LOG',
    ...lines,
  ].join('\n')
}
function timingFooter(view, current, previous) {
  const embed = view.embeds[0]
  const base = embed.data.footer?.text || ''
  const suffix = `Processing (${current.elapsedMs}ms)${
    previous ? ` · Previous update total (${previous.totalMs}ms)` : ''
  }`
  embed.setFooter({
    text: [base, suffix].filter(Boolean).join(' | ').slice(0, 2048),
  })
}
module.exports = {
  playerRecapFields,
  flatEvents,
  summaryFields,
  reportLines,
  recapText,
  timingFooter,
}
