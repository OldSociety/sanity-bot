const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} = require('discord.js')
const { arenaEmojis } = require('./emojis')
const { defaultCharacter } = require('./characters')
const {
  specialSlots,
  statsForLevel,
  abilityAvailable,
  canUse,
  kitFor,
  finisherPercent,
  finisherWindowMs,
  exhaustedStressMultiplier,
  activeTickMs,
  idleTickMs,
} = require('./rules')
const { artFiles, bannerName } = require('./art')
const { familyFor, variantsFor, groupsFor } = require('./selection')
function healthDisplay(character) {
  const ratio = Math.max(0, Math.min(1, character.hp / character.maxHp))
  const filled = ratio > 0 ? Math.max(1, Math.round(ratio * 8)) : 0
  return {
    percent: Math.round(ratio * 100),
    bar: '``' + '🟥'.repeat(filled) + '⬛'.repeat(8 - filled) + '``',
  }
}
const stressBar = (fighter) =>
  '``' +
  '🟦'.repeat(fighter.stress) +
  '⬛'.repeat(fighter.maxStress - fighter.stress) +
  '``'
// Keep resources in the final field: Discord footer text cannot render custom emojis.
const currencyLine = (battle, reservedHope = 0, icons = {}) =>
  `${icons.hope || '🟡'} Hope ${
    (battle?.marq.hope || 0) - Number(reservedHope)
  }/6${reservedHope ? ` · ${Number(reservedHope)} queued` : ''} | ${
    battle?.warrior.name || 'Opponent'
  }: ${icons.fear || '🟣'} Fear ${battle?.warrior.fear || 0}/6`
function actionLines(actions = []) {
  return actions
    .map((event) => {
      let text
      if (event.kind === 'roll') {
        const result = event.critical
          ? 'Critical success'
          : `${event.success ? 'Success' : 'Failure'} with ${
              event.withHope ? 'Hope' : 'Fear'
            }`
        const effects = event.critical
          ? `${event.hopeGained ? ' Gained 1 Hope.' : ''}${
              event.stressRestored ? ' Restored 1 Stress.' : ''
            } Next basic hit ×2.`
          : ''
        text = `🟡${event.hope} + 🟣${event.fear} = ${event.total}. ${result}.${effects}`
      } else if (event.kind === 'hit') {
        text =
          event.outcome === 'critical'
            ? `${event.actor} scored a critical hit! ${event.damage} damage.`
            : event.damage
            ? `${event.actor} hit ${event.target} for ${event.damage}.`
            : `${event.actor} missed.`
      } else if (event.kind === 'special') {
        const cost = `Spent ${event.cost} ${event.resource}.`
        if (event.type === 'combo') {
          const chain = event.rolls
            .slice(0, 40)
            .map((value) => `🔺${value}`)
            .join(' + ')
          const extra =
            event.rolls.length > 40
              ? ` + … (${event.rolls.length - 40} more)`
              : ''
          text = `${event.actor}: ${event.name}: ${chain}${extra}${
            event.flatPercent ? ` + ${event.flatPercent}%` : ''
          } = **${Number(event.percent.toFixed(3))}%** · **${
            event.damage
          }** damage. ${cost}`
        } else if (event.type === 'buff') {
          text = `${event.actor} used ${event.name}: next ${event.hits} landed basics +${event.percent}% Attack. ${cost}`
        } else if (event.slot === 'special3') {
          text =
            event.resource === 'Fear' && event.damage === 0
              ? `${event.actor}: ${event.name} missed! ${cost}`
              : `${event.actor}: ${event.name}: ${
                  event.resource === 'Fear'
                    ? 'midpoint'
                    : event.choice
                    ? `picked ${event.choice}`
                    : 'no choice'
                } · ${event.percent}% · ${event.damage} damage. ${cost}`
        } else
          text = `${event.actor} used ${event.name} for ${
            event.damage
          }. ${cost}${event.stressRemoved ? ' Removed 1 enemy Stress.' : ''}`
      } else if (event.kind === 'survival')
        text = `${event.actor}: ON THE BRINK · survived with ${event.hp} HP.`
      else return ''
      return `**${event.tick}.** ${text}`
    })
    .filter(Boolean)
}
const actionLog = (actions = []) =>
  actionLines(actions.slice(-5)).join('\n') || 'The fight starts here.'
function historyFields(history) {
  const lines = actionLines(history)
  let chosen = [],
    used = 0
  for (const line of lines.slice().reverse()) {
    if (used + line.length + 1 > 4800) break
    chosen.unshift(line)
    used += line.length + 1
  }
  const fields = [],
    omitted = lines.length - chosen.length
  let chunk = ''
  for (const line of chosen) {
    if (chunk && chunk.length + line.length + 1 > 1000) {
      fields.push({
        name: fields.length ? 'Combat log · continued' : 'Combat log',
        value: chunk,
      })
      chunk = ''
    }
    chunk += (chunk ? '\n' : '') + line
  }
  if (chunk)
    fields.push({
      name: fields.length ? 'Combat log · continued' : 'Combat log',
      value: chunk,
    })
  if (!fields.length)
    fields.push({ name: 'Combat log', value: 'No actions recorded.' })
  return { fields, omitted }
}
function screen(session) {
  const { id, revision, battle } = session,
    character = session.character || defaultCharacter
  const player = battle?.marq,
    kit = kitFor(player || { kit: character.kit })
  const reservedHope = session.pendingSpecial
    ? kit[session.pendingSpecial].hopeCost
    : 0
  const playerName = player?.name || character.name
  const enemyName =
    battle?.warrior.name || (session.opponent === 'marq' ? 'Marq' : 'Maxim')
  const idle = battle?.mode === 'idle',
    icons = arenaEmojis(session.guildId)
  const won = battle?.status === 'victory',
    lost = battle?.status === 'defeat',
    quit = battle?.status === 'quit'
  const ended = Boolean(battle && (won || lost || quit || session.stopped))
  const embed = new EmbedBuilder()
    .setColor(won ? 0x57a86b : lost ? 0xd55252 : 0x984b50)
    .setTitle(
      won
        ? 'VICTORY'
        : lost
        ? 'DEFEAT'
        : quit
        ? 'FIGHT ENDED'
        : battle
        ? `${idle ? '⏩' : '⚔️'} ${playerName} vs ${enemyName} · ${battle.tick}`
        : '⚔️ Arena',
    )
  const button = (
    action,
    label,
    style,
    disabled = false,
    controlRevision = revision,
  ) =>
    new ButtonBuilder()
      .setCustomId(`arena:${id}:${controlRevision}:${action}`)
      .setLabel(label)
      .setStyle(style)
      .setDisabled(disabled)
  const payload = (buttons) => ({
    content: '',
    embeds: [
      embed.addFields({
        name: 'Available',
        value: currencyLine(battle, reservedHope, icons),
      }),
    ],
    allowedMentions: { parse: [] },
    components: !session.expired
      ? Array.from({ length: Math.ceil(buttons.length / 5) }, (_, i) =>
          new ActionRowBuilder().addComponents(buttons.slice(i * 5, i * 5 + 5)),
        )
      : [],
  })
  const startButtons = (again = false) => [
    button(
      'start',
      again ? 'Fight Again' : 'Start Fight',
      ButtonStyle.Primary,
    ).setEmoji('⚔️'),
    button('idle', 'Idle', ButtonStyle.Success).setEmoji('⏩'),
  ]
  if (!battle && ['characters', 'skins'].includes(session.page)) {
    const family = familyFor(character),
      stats = statsForLevel(1, character.kit),
      skinPage = session.page === 'skins'
    const groups = groupsFor(),
      group =
        groups.find((entry) => entry.id === session.groupId) ||
        groups.find((entry) =>
          entry.entries.some((item) => item.id === family.id),
        ) ||
        groups[0]
    embed
      .setTitle(
        skinPage ? `${family.name} — Choose Skin` : 'Choose Your Fighter',
      )
      .setImage(
        `attachment://${
          artFiles(character, session.opponent, session.page)[0].name
        }`,
      )
      .setDescription(
        session.expired
          ? 'Session expired. Use /arena to try again.'
          : `**${skinPage ? character.version : family.name}**\n${
              family.role ? family.role + ' · ' : ''
            }Level 1\n${stats.maxHp} HP · ${stats.attack} Attack`,
      )
    if (!skinPage)
      embed.addFields({
        name: 'Abilities',
        value:
          `Passive: ${
            character.passive === 'on-the-brink'
              ? 'On the Brink'
              : 'Not Good Enough'
          }\n` +
          specialSlots
            .map(
              (slot, i) =>
                `S${i + 1}: ${kit[slot].name} · ${
                  kit[slot].stressCost
                    ? kit[slot].stressCost + ' Stress'
                    : kit[slot].hopeCost + ' Hope'
                }`,
            )
            .join('\n'),
      })
    const select = (action, placeholder, options) =>
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`arena:${id}:${revision}:${action}`)
          .setPlaceholder(placeholder)
          .addOptions(options),
      )
    const view = payload(
      skinPage
        ? [
            button('backcharacters', 'Back', ButtonStyle.Secondary),
            button('confirmfighter', 'Confirm Fighter', ButtonStyle.Primary),
          ]
        : [button('chooseskin', 'Choose Skin →', ButtonStyle.Primary)],
    )
    if (session.expired) return view
    if (!skinPage && groups.length > 1)
      view.components.unshift(
        select(
          'selectgroup',
          'Choose alphabetical group',
          groups.map((entry) => ({
            label: entry.label.slice(0, 100),
            value: entry.id,
            default: entry.id === group.id,
          })),
        ),
      )
    view.components.splice(
      view.components.length - 1,
      0,
      skinPage
        ? select(
            'selectskin',
            'Choose skin',
            variantsFor(family).map((variant) => ({
              label: `${variant.version} ${family.name}`,
              value: variant.id,
              default: variant.id === character.id,
            })),
          )
        : select(
            'selectcharacter',
            'Choose character',
            group.entries.map((entry) => ({
              label: entry.name,
              value: entry.id,
              default: entry.id === family.id,
            })),
          ),
    )
    return view
  }
  if (won || lost || quit) {
    const log = idle
      ? { fields: [], omitted: 0 }
      : historyFields(battle.history)
    embed.setDescription(
      `${
        quit ? 'Fight quit. Use /arena to choose another character.\n' : ''
      }**Rewards:** None — prototype\n**Turns:** ${battle.tick} · ${
        idle ? 'Idle' : 'Active'
      }${
        log.omitted
          ? `\nShowing the most recent actions; ${log.omitted} earlier actions omitted.`
          : ''
      }`,
    )
    if (!idle) embed.addFields(log.fields)
    return payload([
      ...startButtons(true),
      ...(session.selectionFlow
        ? [button('changefighter', 'Change Fighter', ButtonStyle.Secondary)]
        : []),
    ])
  }
  embed.setImage(`attachment://${bannerName(character, session.opponent)}`)
  if (!battle) {
    const stats = statsForLevel(session.level, character.kit)
    const enemyStats = statsForLevel(
      session.level,
      session.opponent === 'marq' ? 'spooky-marq' : 'maxim',
    )
    embed
      .setDescription(
        session.expired
          ? 'Session expired. Use /arena to try again.'
          : `**${character.label}** vs ${enemyName} · Difficulty 12\nLv ${
              stats.level
            } · Rank ${stats.rank}\n${character.name}: ${stats.maxHp} HP · ${
              stats.attack
            } Attack\n${enemyName}: ${enemyStats.maxHp} HP · ${
              enemyStats.attack
            } Attack\n⚔️ Active · ${
              activeTickMs / 1000
            }-second turns · one special per turn\n⏩ Idle · ${
              idleTickMs / 1000
            }-second turns · dice + basic attacks\nStress 6/6 each`,
      )
      .addFields({ name: 'Combat log', value: actionLog() })
    return payload([
      ...startButtons(),
      button('opponent', `Opponent: ${enemyName}`, ButtonStyle.Secondary),
      ...(session.selectionFlow
        ? [button('backskins', 'Back', ButtonStyle.Secondary)]
        : []),
    ])
  }
  const dice = battle.duality,
    seconds = (idle ? idleTickMs : activeTickMs) / 1000
  const outcome = dice
    ? dice.critical
      ? '⭐ Critical success'
      : `${dice.success ? '✅ Success' : '❌ Failure'} with ${
          dice.withHope ? 'Hope' : 'Fear'
        }`
    : `Next roll in ${seconds} seconds`
  let summary = dice
    ? `${icons.hope} **${dice.hope}** + ${icons.fear} **${dice.fear}** = **${dice.total}** · ${outcome}`
    : outcome
  if (idle) summary += '\n⏩ Idle · basic attacks only'
  if (session.expired) summary += '\nSession expired. Use /arena to try again.'
  else if (session.stopped) summary += '\n⚠️ Paused · restart fight'
  if (session.pendingSpecial)
    summary += `\n⏳ ${kit[session.pendingSpecial].name} queued`
  embed.setDescription(summary)
  const status = (fighter, includeName = true) => {
    const health = healthDisplay(fighter)
    return `${
      includeName
        ? `**${fighter.name}** · Lv ${fighter.level} · Rank ${fighter.rank}\n`
        : ''
    }❤️${fighter.hp}/${fighter.maxHp} (${health.percent}%)\n${
      health.bar
    }\n${stressBar(fighter)} Stress ${fighter.stress}/${fighter.maxStress}${
      fighter.stress === 0
        ? `\n⚠️ Takes ×${exhaustedStressMultiplier} damage`
        : ''
    }${
      fighter.slayerCharges
        ? `\nSlayer +${kitFor(fighter).special2.percent}% · ${
            fighter.slayerCharges
          } hits`
        : ''
    }`
  }
  embed.addFields({
    name: `${player.name} · Lv ${player.level} · Rank ${player.rank}`,
    value: status(player, false) + '\n' + status(battle.enemy),
  })
  const lines = actionLines(battle.actions)
  if (battle.latestCombo && !battle.actions.includes(battle.latestCombo))
    lines.unshift(...actionLines([battle.latestCombo]))
  embed.addFields({
    name: 'Combat log',
    value: lines.join('\n') || 'The fight starts here.',
  })
  const quitButton = () => button('quit', 'Quit', ButtonStyle.Secondary)
  if (session.minigame && !session.expired) {
    embed.setDescription(
      `💥 ${kit.special3.name} · pick a number!\n${finisherPercent(
        player,
        1,
      )}–${finisherPercent(player, 5)}% Attack · no choice: ${finisherPercent(
        player,
        0,
      )}%\n${finisherWindowMs / 1000} seconds to choose · combat paused`,
    )
    return payload([
      ...session.minigame.order.map((value) =>
        button(
          `pick:${value}`,
          String(value),
          ButtonStyle.Primary,
          session.minigame.claimed,
          session.minigame.revision ?? revision,
        ),
      ),
      quitButton(),
    ])
  }
  if (idle) return payload(ended ? startButtons(true) : [quitButton()])
  const styles = [ButtonStyle.Primary, ButtonStyle.Success, ButtonStyle.Danger],
    emojis = ['⚔️', icons.hopeButton, '💥']
  const buttons = specialSlots.map((slot, i) => {
    const definition = kit[slot],
      ready = abilityAvailable(player, slot),
      queued = session.pendingSpecial === slot
    const cost = definition.stressCost
      ? `${definition.stressCost} Stress`
      : `${definition.hopeCost} Hope`
    const recharge =
      definition.requiredRecharge &&
      player.focusHits < definition.requiredRecharge
        ? `${player.focusHits}/${definition.requiredRecharge} hits · `
        : ''
    const state = !ready ? 'Unavailable' : queued ? 'queued' : recharge + cost
    return button(
      slot,
      `${definition.name} [${state}]`,
      styles[i],
      ended || queued || !canUse(player, slot),
    ).setEmoji(emojis[i])
  })
  if (ended) buttons.push(...startButtons(true))
  else buttons.push(quitButton())
  return payload(buttons)
}
module.exports = { screen, artFiles, currencyLine, actionLog, historyFields }
