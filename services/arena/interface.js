const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} = require('discord.js')
const {
  exhausted,
  resourceMeter,
  healthCost,
  usesRage,
} = require('./resources')
const { arenaEmojis } = require('./emojis')
const { defaultCharacter, resolveCharacter } = require('./characters')
const {
  specialSlots,
  balance,
  statsForLevel,
  abilityAvailable,
  canUse,
  kitFor,
  passives,
  finisherPercent,
  exhaustedStressMultiplier,
} = require('./rules')
const { artFiles, bannerName } = require('./art')
const { cardName } = require('./health-card')
const secondary = require('./secondary')
const { legendNameFor } = require('./legend')
const { familyFor, variantsFor, groupsFor, rosterFor } = require('./selection')
const {
  abilityCost,
  abilitySummary,
  passiveSummary,
} = require('./ability-summary')
const { summaryFields, playerRecapFields, reportLines } = require('./battle-report')
const { damageLabels, comboRolls } = require('./damage-labels')
function actionLines(actions = []) {
  return actions
    .map((event) => {
      let text
      if (event.kind === 'move') {
        text = actionLines(event.events)
          .map((line) => line.replace(/^\*\*\d+\.\*\* /, ''))
          .join(' ')
      } else if (event.kind === 'sacrifice') {
        text = `${
          event.actor ? event.actor + ' · ' : ''
        }**${event.name.toUpperCase()}** · Sacrificed ${event.hp} HP.`
      } else if (event.kind === 'rageMiss') {
        text = `${
          event.actor ? event.actor + ' · ' : ''
        }BASIC MISSED · Rage decreased to ${event.rage}/3`
      } else if (event.kind === 'rageBlock') {
        text = `${
          event.actor ? event.actor + ' · ' : ''
        }BASIC BLOCKED · Rage decreased to ${event.rage}/3`
      } else if (event.kind === 'roll') {
        const result = event.critical
          ? 'Critical success'
          : `${
              event.success
                ? 'Success'
                : event.immediateCritical
                ? 'Failure (Block)'
                : 'Failure'
            } with ${event.withHope ? 'Hope' : 'Fear'}`
        const effects = event.critical
          ? `${event.hopeGained ? ' Gained 1 Hope.' : ''}${
              event.stressRestored ? ' Restored 1 Stress.' : ''
            }${event.stressRemoved ? ' Removed 1 opponent Stress.' : ''} ${
              event.immediateCritical
                ? 'Current basic ×2.'
                : 'Next basic hit ×2.'
            }`
          : ''
        text = `🟡${event.hope} + 🟣${event.fear} = ${event.total}. ${result}.${effects}`
      } else if (event.kind === 'recovery') {
        text = `${event.actor} recovered ${event.stressRestored} Stress instead of attacking.`
      } else if (event.kind === 'stressed') {
        text = require('./stress-log').stressLine(event)
      } else if (event.kind === 'stressRelief') {
        text = require('./stress-log').stressLine(event)
      } else if (event.kind === 'hit') {
        text =
          event.outcome === 'critical'
            ? `${event.actor} scored a critical ${
                require('./outcomes').enabled() ? 'basic ' : ''
              }hit! ${event.damage} damage${damageLabels(event)}.`
            : event.outcome === 'block'
            ? `${event.actor}'s attack was blocked: ${event.damage} damage (${
              require('./rules').balance.damageRules ? '75' : '25'
            }%)${damageLabels(event)}.`
            : event.damage
            ? `${event.actor} hit ${event.target} for ${event.damage}${damageLabels(event)}.`
            : `${event.actor} missed.`
        if (event.stressRestored) text += ' Restored 1 Stress.'
        if (event.stressRemoved) text += ' Removed 1 opponent Stress.'
        if (event.fearGained) text += ` Gained ${event.fearGained} Fear.`
        if (event.guaranteed) text += ' **STOKE** guaranteed hit.'
        if (event.strikes)
          text =
            `${event.actor}: ${event.damage} damage${damageLabels(event)}.` +
            (event.stressRestored ? ' Restored 1 Stress.' : '') +
            (event.stressRemoved ? ' Removed 1 opponent Stress.' : '')
      } else if (event.kind === 'special') {
        const cost = `Spent ${event.cost} ${event.resource}.`
        const name = `**${event.name.toUpperCase()}**`
        if (event.type === 'heal') {
          text = `${event.actor} used ${name}: restored ${event.healing} HP. ${cost}${event.healingOnly ? ' Healing only; no attack.' : ''}`
        } else if (event.type === 'graveward') {
          text = `${event.actor} used ${name}: ${event.reductionPercent}% less direct damage this round.${event.bleedingRemoved ? ' Bleeding removed.' : ''} ${cost}`
        } else if (event.type === 'windWall') {
          text = `${event.actor} used ${name}: Slow gives 75% Block this round and the next two rounds, plus 75% Super Move resistance. ${cost}`
        } else if (event.type === 'rage') {
          text = `${event.actor} · ${name} · Gained 1 Rage · Rage ${event.rage}/3`
        } else if (event.type === 'combo') {
          text = `${event.actor}: ${name}:${comboRolls(event)}${
            event.flatPercent ? ` + ${event.flatPercent}%` : ''
          } = **${Number(event.percent.toFixed(3))}%** · **${
            event.damage
          }** damage${damageLabels(event)}. ${cost}`
        } else if (event.type === 'buff') {
          text = `${event.actor} used ${name}: next ${event.hits} landed basics +${event.percent}% Attack. ${cost}`
        } else if (event.slot === 'special3') {
          text =
            event.resource === 'Fear' &&
            event.damage === 0 &&
            !require('./resistance').enabled()
              ? `${event.actor}: ${name} missed! ${cost}`
              : `${event.actor}: ${name}: ${
                  event.resource === 'Fear'
                    ? 'rolled'
                    : event.choice
                    ? `picked ${event.choice}`
                    : 'no choice'
                } · ${event.percent}% · ${event.damage} damage${damageLabels(event)}.${
                  event.resisted
                    ? ` Resisted: 50% damage (${event.resistancePrevented} prevented).`
                    : ''
                } ${cost}`
        } else
          text = `${event.actor} used ${name} for ${
            event.damage
          }${event.type === 'flurry' ? ' guaranteed bonus damage' : ''}${damageLabels(event)}. ${cost}`
      } else if (event.kind === 'survival')
        text = `${event.actor}: ${(
          event.name || 'Survival'
        ).toUpperCase()} · survived with ${event.hp} HP.`
      else return ''
      if (event.kind === 'special') {
        const removed = event.outcome === 'critical'
          ? Math.max(0, (event.stressRemoved || 0) - 1)
          : event.stressRemoved || 0
        if (removed) text += ` Removed ${removed} opponent Stress.`
      }
      if (event.kind === 'special' && event.outcome === 'block')
        text += ` BLOCKED · ${
          require('./rules').balance.damageRules ? '50' : '25'
        }% damage; no on-hit effects.`
      if (event.kind === 'special' && event.outcome === 'critical')
        text += ' CRITICAL · current attack ×2.'
      if (
        event.kind === 'special' &&
        event.rage !== undefined &&
        event.type !== 'rage'
      )
        text += ` · ${event.percent}% Attack · Rage ${event.rage}/3`
      return `**${event.tick}.** ${text}`
    })
    .filter(Boolean)
}
const actionLog = (actions = []) =>
  actionLines(actions.slice(-5)).join('\n') || 'The fight starts here.'
function historyFields(history, options = {}) {
  const lines = options.clean
    ? reportLines(history, actionLines, options)
    : actionLines(history)
  let units = lines
  if (options.clean) {
    units = []
    for (const line of lines) {
      if (/^\*\*\d+\.\*\*/.test(line) || !units.length) units.push(line)
      else units[units.length - 1] += '\n' + line
    }
  }
  let chosen = [],
    used = 0
  for (const line of units.slice().reverse()) {
    if (used + line.length + 1 > (options.maxChars || 4800)) break
    chosen.unshift(line)
    used += line.length + 1
  }
  const fields = [],
    omitted = units.length - chosen.length
  let chunk = ''
  for (const line of chosen) {
    if (line.length > 1000) {
      // Only unusually long rounds need splitting; normal rounds stay whole.
      const sub = line.split('\n')
      for (const part of sub) {
        if (chunk && chunk.length + part.length + 1 > 1000) {
          fields.push({
            name: fields.length ? 'Combat log · continued' : 'Combat log',
            value: chunk,
          })
          chunk = ''
        }
        chunk += (chunk ? '\n' : '') + part.slice(0, 1000)
      }
      continue
    }
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
  return { fields, omitted, unit: options.clean ? 'rounds' : 'actions' }
}
function screen(session) {
  const logOptions = {
    clean: Boolean(session.presentationV2),
    diagnostic: session.diagnostic !== false,
    timings: session.roundTimings,
    maxChars: session.presentationV2 ? 2800 : 4800,
  }
  const { id, revision, battle } = session,
    character = session.character || defaultCharacter
  const player = battle?.player,
    kit = kitFor(player || { kit: character.kit })
  const playerName = player?.name || character.name
  const enemyName =
    battle?.enemy.name ||
    resolveCharacter(session.opponent || 'maxim')?.[
      session.manualOpponentSelection ? 'label' : 'name'
    ] ||
    'Opponent'
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
        : '⚔️ Arena'
    )
  const equippedSecondary = secondary.equipped(session)
  if (equippedSecondary && (!battle || session.secondaryDetails))
    embed.addFields({ name: 'Secondary', value: `${equippedSecondary.label}\nEquipped for this session. Combat abilities coming later.` })
  const button = (
    action,
    label,
    style,
    disabled = false,
    controlRevision = revision
  ) =>
    new ButtonBuilder()
      .setCustomId(`arena:${id}:${controlRevision}:${action}`)
      .setLabel(label)
      .setStyle(style)
      .setDisabled(Boolean(disabled || session.busy))
  if (battle)
    embed.setFooter({
      text: `🟡${battle.player.hope}/6 | 🟣Fear ${battle.enemy.fear}/6`,
    })
  const payload = (buttons) => {
    if (session.arenaVersion || battle?.arenaVersion) {
      const version = require('./versioning').label(battle?.arenaVersion || session.arenaVersion)
      embed.setFooter({ text: [embed.data.footer?.text, version].filter(Boolean).join(' · ').slice(0, 2048) })
    }
    return ({
    content: '',
    embeds:
      battle?.status === 'playing'
        ? [
            embed,
            new EmbedBuilder()
              .setColor(embed.data.color)
              .setTitle('Status key')
              .setImage(`attachment://${legendNameFor(battle)}`),
          ]
        : [embed],
    allowedMentions: { parse: [] },
    components: !session.expired
      ? Array.from({ length: Math.ceil(buttons.length / 5) }, (_, i) =>
          new ActionRowBuilder().addComponents(buttons.slice(i * 5, i * 5 + 5))
        )
      : [],
    })
  }
  const startButtons = (again = false) => [
    button(
      'start',
      again ? 'Fight Again' : 'Start Fight',
      ButtonStyle.Primary
    ).setEmoji('⚔️'),
  ]
  const withOpponentPicker = (view) => {
    if (secondary.enabled() && !session.expired && session.page === 'prefight' &&
        (!battle || battle.status !== 'playing')) {
      view.components.unshift(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`arena:${id}:${revision}:equipsecondary`)
          .setPlaceholder('Equip secondary character')
          .setDisabled(Boolean(session.busy))
          .addOptions([
            { label: 'No secondary', value: 'none', default: !equippedSecondary },
            ...secondary.choices(session).map(character => ({
              label: character.label, value: character.id,
              default: character.id === equippedSecondary?.id,
            })),
          ])))
    }
    if (!session.manualOpponentSelection || session.expired) return view
    view.components.unshift(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`arena:${id}:${revision}:opponent`)
          .setPlaceholder('Choose enemy')
          .setDisabled(Boolean(session.busy))
          .addOptions(
            require('./opponents')
              .availableOpponents()
              .map((opponent) => {
                const stats = statsForLevel(session.level, opponent.kit)
                return {
                  label: opponent.label,
                  value: opponent.id,
                  description: `Level ${stats.level} · ${stats.maxHp} HP · ${stats.attack} Attack`,
                  default:
                    opponent.id === resolveCharacter(session.opponent)?.id,
                }
              })
          )
      )
    )
    return view
  }
  if (!battle && ['characters', 'skins'].includes(session.page)) {
    const family = familyFor(character),
      stats = statsForLevel(session.level || 1, character.kit),
      skinPage = session.page === 'skins'
    const groups = groupsFor(rosterFor(session.allowedVariantIds)),
      group =
        groups.find((entry) => entry.id === session.groupId) ||
        groups.find((entry) =>
          entry.entries.some((item) => item.id === family.id)
        ) ||
        groups[0]
    embed
      .setTitle(
        skinPage ? `${family.name} — Choose Skin` : 'Choose Your Fighter'
      )
      .setThumbnail(
        `attachment://${
          artFiles(character, session.opponent, session.page)[0].name
        }`
      )
      .setDescription(
        session.expired
          ? 'Session expired. Use /arena to try again.'
          : skinPage
          ? `**${character.version} ${family.name}**\n${
              family.role
            } · Level ${session.level || 1}\n${stats.maxHp} HP · ${stats.attack} Attack\n${
              character.kit === 'hellfed-marq' ? 'Rage 0/3' : 'Stress 6/6'
            }`
          : `**${family.name}** · ${family.role}\n${family.lore}`
      )
    if (session.allowedVariantIds) embed.addFields({ name: `Arena Player · Level ${session.level}`,
      value: session.diagnosticRoster ? 'Diagnostic mode: full testing roster available.' : 'Your unlocked fighters share your Arena player level.' })
    if (session.ownershipUnavailable) embed.addFields({ name: 'Badge access unavailable', value: session.diagnosticRoster
      ? 'Badge ownership could not be checked. Diagnostic roster access is temporary.'
      : 'Only starter fighters are shown until your badges can be checked.' })
    if (skinPage) {
      const fighter = { ...stats, kit: character.kit }
      if (character.passive)
        embed.addFields({
          name: 'Passive',
          value: `**${
            passives[character.passive]?.name ?? 'None'
          }** — ${passiveSummary(character, fighter)}`,
        })
      embed.addFields(
        specialSlots.map((slot, i) => ({
          name: `S${i + 1} · ${kit[slot].name} — ${abilityCost(
            fighter,
            kit[slot]
          )}`,
          value: abilitySummary(fighter, slot),
        }))
      )
      if (balance.offensiveSpecialBasics)
        embed.addFields({
          name: 'Attack rules',
          value:
            (require('./rules').balance.damageRules
              ? `Offensive specials include a basic. Only basics can crit. Block: 75% basic / 50% special damage. Bleeding ignores Block; Finishers are guaranteed.${
                  require('./resistance').enabled()
                    ? ' Super Moves can be resisted for 50% damage at the defender’s Block chance.'
                    : ''
                }`
              : 'Offensive specials include a basic. Only basics can crit. Block: 25% damage; no on-hit effects.') +
            (balance.damageRounding === 'floor'
              ? ' All damage rounds down.'
              : ''),
        })
    }
    const select = (action, placeholder, options) =>
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`arena:${id}:${revision}:${action}`)
          .setPlaceholder(placeholder)
          .setDisabled(Boolean(session.busy))
          .addOptions(options)
      )
    const view = payload(
      skinPage
        ? [
            button('backcharacters', 'Back', ButtonStyle.Secondary),
            button('confirmfighter', 'Confirm Fighter', ButtonStyle.Primary),
          ]
        : [button('chooseskin', 'Choose Skin →', ButtonStyle.Primary)]
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
          }))
        )
      )
    view.components.splice(
      view.components.length - 1,
      0,
      skinPage
        ? select(
            'selectskin',
            'Choose skin',
            variantsFor(family, session.allowedVariantIds).map((variant) => ({
              label: `${variant.version} ${family.name}`,
              value: variant.id,
              default: variant.id === character.id,
            }))
          )
        : select(
            'selectcharacter',
            'Choose character',
            group.entries.map((entry) => ({
              label: entry.name,
              value: entry.id,
              default: entry.id === family.id,
            }))
          )
    )
    return view
  }
  if (won || lost || quit) {
    const playerRecap = session.presentationV2 && session.diagnostic === false
    const log = idle
      ? { fields: [], omitted: 0 }
      : playerRecap
      ? { fields: [], omitted: 0 }
      : historyFields(battle.history, logOptions)
    embed.setDescription(
      `${quit ? 'Fight quit. Use /arena to choose another character.\n' : ''}${
        session.presentationV2 ? '' : '**Rewards:** None — prototype\n'
      }**Turns:** ${battle.tick} · ${idle ? 'Idle' : 'Active'}${
        log.omitted
          ? `\nShowing the most recent ${log.unit || 'actions'}; ${
              log.omitted
            } earlier ${log.unit || 'actions'} omitted.`
          : ''
      }`
    )
    if (!idle) {
      if (playerRecap) embed.addFields(playerRecapFields(battle))
      else if (session.presentationV2) embed.addFields(summaryFields(battle))
      embed.addFields(log.fields)
      if (session.presentationV2 && !playerRecap)
        embed.setFooter({
          text: 'Damage includes overkill; HP removed is effective damage. Blocks count packets/strikes. Specials excludes Finals; healing includes revives.',
        })
    }
    return withOpponentPicker(
      payload([
        ...startButtons(true),
        ...(session.selectionFlow
          ? [button('changefighter', 'Change Fighter', ButtonStyle.Secondary)]
          : []),
      ])
    )
  }
  embed.setImage(
    `attachment://${
      battle ? cardName(session) : bannerName(character, session.opponent)
    }`
  )
  if (!battle) {
    const stats = statsForLevel(session.level, character.kit)
    const enemyStats = statsForLevel(
      session.level,
      resolveCharacter(session.opponent || 'maxim')?.kit
    )
    embed
      .setDescription(
        session.expired
          ? 'Session expired. Use /arena to try again.'
          : `**${character.label}** vs ${enemyName}\n${character.name}: ${
              stats.maxHp
            } HP · ${stats.attack} Damage\n${enemyName}: ${
              enemyStats.maxHp
            } HP · ${enemyStats.attack}\n\n${
              session.manualOpponentSelection
                ? `${character.name}: ${
                    usesRage(character) ? 'Rage 0/3' : 'Stress 6/6'
                  } · ${enemyName}: ${
                    usesRage(resolveCharacter(session.opponent))
                      ? 'Rage 0/3'
                      : 'Stress 6/6'
                  }`
                : character.kit === 'hellfed-marq'
                ? `Rage 0/3 · Opponent Stress 6/6\nStoke: ${kitFor({
                    kit: character.kit,
                  }).special1.hpCostPercentByRage.join(
                    ' / '
                  )}% max HP for the next Rage bar. Normal Duality roll, guaranteed basic hit, then +1 Rage. Ordinary basic ${
                    require('./outcomes').enabled() ? 'blocks' : 'misses'
                  } lose 1 Rage.`
                : 'Stress 6/6 each'
            }`
      )
      .addFields({ name: 'Combat log', value: actionLog() })
    return withOpponentPicker(
      payload([
        ...startButtons(),
        ...(session.selectionFlow
          ? [button('backskins', 'Back', ButtonStyle.Secondary)]
          : []),
      ])
    )
  }
  const dice =
    require('./outcomes').enabled() &&
    battle.recentRolls.at(-1)?.tick !== battle.tick
      ? null
      : battle.duality
  if (dice) {
    const icon = dice.withHope ? icons.hopeIcon : icons.fearIcon
    if (icon) embed.setThumbnail(icon)
  }
  const outcome = dice
    ? dice.critical
      ? '⭐ Critical success'
      : `${
          dice.success
            ? '✅ Success'
            : require('./outcomes').enabled()
            ? '🛡️ Failure (Block)'
            : '❌ Failure'
        } with ${dice.withHope ? 'Hope' : 'Fear'}`
    : 'Your turn · choose a move'
  let summary = dice
    ? `${icons.hope} **${dice.hope}** + ${icons.fear} **${dice.fear}** = **${dice.total}** · ${outcome}`
    : outcome
  if (session.expired) summary += '\nSession expired. Use /arena to try again.'
  else if (session.stopped) summary += '\n⚠️ Paused · restart fight'
  if (session.busy) summary += '\nResolving…'
  embed.setDescription(summary)
  const lines = session.presentationV2
    ? reportLines(
        battle.history.filter((event) => event.tick === battle.tick),
        actionLines,
        logOptions
      )
    : actionLines(
        battle.actions.filter((event) => event.kind !== 'roll').slice(-2)
      )
  embed.addFields({
    name: 'Latest moves',
    value:
      (session.presentationV2
        ? lines.join('\n').slice(0, 1000)
        : lines.join('\n')) || 'The fight starts here.',
  })
  const quitButton = () => button('quit', 'Quit', ButtonStyle.Secondary)
  if (session.minigame && !session.expired) {
    embed.setDescription(
      `💥 ${kit.special3.name} · pick a number!\n${finisherPercent(
        player,
        1
      )}–${finisherPercent(player, 5)}% Attack\nChoose within ${
        (kit.special3.responseMs || 5000) / 1000
      } seconds · combat paused`
    )
    return payload([
      ...session.minigame.order.map((value) =>
        button(
          `pick:${value}`,
          String(value),
          ButtonStyle.Primary,
          session.minigame.claimed,
          session.minigame.revision ?? revision
        )
      ),
      quitButton(),
    ])
  }
  const styles = [ButtonStyle.Primary, ButtonStyle.Success, ButtonStyle.Danger],
    emojis = ['⚔️', icons.hopeButton, '💥']
  const buttons = specialSlots.map((slot, i) => {
    const definition = kit[slot],
      ready = abilityAvailable(player, slot)
    const cost = healthCost(player, definition)
      ? `${healthCost(player, definition)} HP`
      : definition.stressCost
      ? `${definition.stressCost} Stress`
      : `${definition.hopeCost} Hope`
    const recharge =
      definition.requiredRecharge &&
      player.focusHits < definition.requiredRecharge
        ? `${player.focusHits}/${definition.requiredRecharge} hits · `
        : ''
    const state = !ready ? 'Unavailable' : recharge + cost
    return button(
      slot,
      `${definition.name} [${state}]`,
      styles[i],
      ended || !canUse(player, slot)
    ).setEmoji(emojis[i])
  })
  if (ended) buttons.push(...startButtons(true))
  else {
    buttons.unshift(
      button('basic', 'Basic Attack', ButtonStyle.Secondary).setEmoji('⚔️')
    )
    buttons.push(quitButton())
    if (secondary.enabled()) buttons.push(button('secondary', '2nd', ButtonStyle.Secondary, !equippedSecondary))
  }
  return payload(buttons)
}
function fallbackStatus(battle) {
  return [battle.player, battle.enemy].map((fighter) => ({
    name: fighter.name,
    value:
      `HP ${fighter.hp}/${fighter.maxHp} · ${resourceMeter(fighter).label} ${
        resourceMeter(fighter).value
      }/${resourceMeter(fighter).max}` +
      (fighter.bleeding ? '\nBleeding' : '') +
      (fighter.passive === 'celestial-alignment'
        ? `\nCelestial Alignment +${
            (fighter.alignmentStacks || 0) *
            require('./build-profile').buildFor('selene')
              .passive.stackPercent
          }%`
        : '') +
      (fighter.windWall
        ? '\nWind Wall · 75% Block for the next protected rounds'
        : '') +
      (exhausted(fighter)
        ? `\nTakes ×${exhaustedStressMultiplier} damage`
        : '') +
      (fighter.slayerCharges
        ? `\n${kitFor(fighter).special2.name} · ${fighter.slayerCharges} hits`
        : ''),
  }))
}
module.exports = {
  screen,
  artFiles,
  actionLog,
  actionLines,
  historyFields,
  fallbackStatus,
}
