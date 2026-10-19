const { randomInt } = require('node:crypto')
const { newBattle, takeTurn, beginFinisher } = require('./combat')
const { screen, actionLines, fallbackStatus } = require('./interface')
const { framedArtFiles } = require('./art')
const { cardName, renderHealthCard } = require('./health-card')
const { legendFile } = require('./legend')
const {
  familyFor,
  variantsFor,
  groupsFor,
  createMemoryPreferences,
  createPreferenceStore,
  preferredVariant,
} = require('./selection')
const { combatReport, saveCombatReport } = require('./statistics')
const { canUse, kitFor, sessionTimeoutMs } = require('./rules')
const { balance } = require('./rules')
const { availableOpponents, initialOpponent } = require('./opponents')
const shuffle = () => {
  const values = [1, 2, 3, 4, 5]
  for (let i = 4; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[values[i], values[j]] = [values[j], values[i]]
  }
  return values
}
function createArena({
  roll,
  rollDuality,
  rollFearSpend,
  rollAccuracy,
  rollCritical,
  rollEffect,
  rollFinisher,
  rollRecovery,
  aiPolicy = 'tactical',
  logger = console,
  maxSessions = 1000,
  timeoutMs = sessionTimeoutMs,
  turnTimeoutMs = 300000,
  finisherResponseMs = 5000,
  chooseOpponent = (choices) => choices[randomInt(choices.length)],
  authorize = null,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  setExpiryTimer = setTimeout,
  clearExpiryTimer = clearTimeout,
  shuffleButtons = shuffle,
  leases = null,
  preferences = createMemoryPreferences(),
  now = Date.now,
  onComplete = () => {},
  renderCard = renderHealthCard,
} = {}) {
  const sessions = new Map()
  const privateReply = (interaction, content) =>
    interaction
      .reply({ content, ephemeral: true, allowedMentions: { parse: [] } })
      .catch(() => {})
  function cancel(session) {
    if (session.timer !== null) clearTimer(session.timer)
    session.timer = null
    if (session.minigame?.endTimer != null)
      clearTimer(session.minigame.endTimer)
    if (session.minigame) session.minigame.endTimer = null
  }
  function cancelExpiry(session) {
    session.expiryGeneration++
    if (session.expiryTimer !== null) clearExpiryTimer(session.expiryTimer)
    session.expiryTimer = null
  }
  async function render(session, unlock = false) {
    const view = screen(unlock ? { ...session, busy: false } : session)
    let files =
      view.embeds[0].data.image || view.embeds[0].data.thumbnail
        ? await framedArtFiles(
            session.character,
            session.opponent,
            session.page,
            logger
          )
        : []
    if (session.battle?.status === 'playing') {
      try {
        if (session.card?.name !== cardName(session))
          session.card = await renderCard(session)
        files = [session.card, await legendFile(session.battle)]
        session.cardFailed = false
      } catch (error) {
        view.embeds = [view.embeds[0]]
        delete view.embeds[0].data.image
        view.embeds[0].addFields(fallbackStatus(session.battle))
        files = []
        if (!session.cardFailed)
          logger.warn?.(`Arena health image unavailable: ${error.message}`)
        session.cardFailed = true
      }
    }
    if (['victory', 'defeat', 'quit'].includes(session.battle?.status))
      files.push({
        attachment: Buffer.from(
          actionLines(session.battle.history).join('\n') ||
            'No actions recorded.'
        ),
        name: `arena-recap-${session.id}-${session.revision}.txt`,
      })
    const key = files.map((file) => file.name).join('|') || null
    // Keep one relevant image attached; never reupload art on ordinary ticks.
    await session.edit({
      ...view,
      ...(key !== session.artKey
        ? { attachments: [], ...(files.length ? { files } : {}) }
        : {}),
    })
    session.artKey = key
  }
  function enqueue(session, work) {
    session.work = session.work.then(work).catch(async (error) => {
      logger.error('Arena update failed:', error.message)
      session.stopped = true
      session.busy = false
      cancel(session)
      session.minigame = null
      await render(session).catch(() => {})
      if (!session.expired) armExpiry(session)
    })
    return session.work
  }
  function expire(session, notify = true) {
    if (session.expired) return session.work
    session.expired = true
    session.stopped = true
    session.revision++
    cancel(session)
    session.minigame = null
    cancelExpiry(session)
    sessions.delete(session.id)
    return enqueue(session, async () => {
      try {
        await render(session)
        leases?.remove(session.messageId)
      } catch (error) {
        logger.warn?.(`Arena button cleanup failed: ${error.message}`)
      }
      if (notify)
        await session
          .notify({
            content: 'Session expired. Please use /arena to try again.',
            ephemeral: true,
            allowedMentions: { parse: [] },
          })
          .catch((error) =>
            logger.warn?.(`Arena expiry followUp failed: ${error.message}`)
          )
    })
  }
  function armExpiry(session) {
    cancelExpiry(session)
    session.expiresAt = null
    // A battle waits for its player; cleanup never performs a combat move.
    if (session.expired || session.busy) return
    const delay =
      session.battle?.status === 'playing' && !session.stopped
        ? turnTimeoutMs
        : timeoutMs
    session.expiresAt = now() + delay
    const generation = session.expiryGeneration
    session.expiryTimer = setExpiryTimer(() => {
      if (generation !== session.expiryGeneration || session.expired) return
      session.expiryTimer = null
      return expire(
        session,
        !['victory', 'defeat', 'quit'].includes(session.battle?.status)
      )
    }, delay)
    session.expiryTimer?.unref?.()
  }
  function complete(session) {
    if (
      session.reported ||
      !['victory', 'defeat'].includes(session.battle?.status)
    )
      return
    session.reported = true
    try {
      Promise.resolve(onComplete(combatReport(session.battle))).catch((error) =>
        logger.error('Arena report failed:', error.message)
      )
    } catch (error) {
      logger.error('Arena report failed:', error.message)
    }
  }
  function order() {
    const values = shuffleButtons()
    if (
      !Array.isArray(values) ||
      values.length !== 5 ||
      [...values].sort().join() !== '1,2,3,4,5'
    )
      throw Error('Expected a permutation of 1–5')
    return values
  }
  async function resolveGame(session, choice) {
    if (session.expired || !session.minigame) return
    session.busy = true
    cancel(session)
    session.minigame = null
    session.revision++
    session.battle = takeTurn(
      session.battle,
      { special3: true, choice },
      roll,
      rollDuality,
      rollFearSpend,
      rollAccuracy,
      rollCritical,
      rollEffect,
      { aiPolicy, rollFinisher, rollRecovery }
    )
    complete(session)
    await render(session, true)
    session.busy = false
    armExpiry(session)
  }
  function armFinisher(session, game = session.minigame) {
    if (!game || session.expired || session.minigame !== game || game.claimed)
      return
    if (game.endTimer != null) clearTimer(game.endTimer)
    game.deadline ??=
      now() +
      (kitFor(session.battle.player).special3.responseMs || finisherResponseMs)
    game.endTimer = setTimer(() => {
      game.endTimer = null
      if (session.expired || session.minigame !== game || game.claimed) return
      // A valid pick reserves itself before awaiting Discord acknowledgement.
      // Other pending acknowledgements cannot make a late pick valid.
      if (session.busy) {
        game.endTimer = setTimer(() => armFinisher(session, game), 50)
        return
      }
      game.claimed = true
      session.busy = true
      cancelExpiry(session)
      return enqueue(session, () => resolveGame(session, 0))
    }, Math.max(0, game.deadline - now()))
    game.endTimer?.unref?.()
  }
  function opponent() {
    if (balance.manualOpponentSelection) return initialOpponent().id
    const { characters, isSelectable } = require('./characters')
    const choices = characters
      .filter(
        (character) =>
          isSelectable(character) && character.kit !== 'hellfed-marq'
      )
      .map((character) =>
        character.kit === 'spooky-marq' ? 'marq' : character.kit
      )
    const chosen = chooseOpponent(choices)
    if (!choices.includes(chosen))
      throw Error('Expected an available Arena opponent')
    return chosen
  }
  async function execute(interaction, character, { selection = false } = {}) {
    if (authorize && !(await authorize(interaction))) return
    const deferred = Boolean(interaction.deferReply)
    if (deferred) await interaction.deferReply()
    const level = 1
    let saved
    if (selection) {
      try {
        saved = preferences.get(interaction.guildId, interaction.user.id)
      } catch (error) {
        logger.warn?.(`Arena preference read failed: ${error.message}`)
      }
    }
    character = preferredVariant(saved, character)
    for (const previous of sessions.values()) {
      if (
        previous.ownerId === interaction.user.id &&
        previous.guildId === interaction.guildId
      )
        await expire(previous, false)
    }
    if (sessions.size >= maxSessions) {
      const oldest = [...sessions.values()].find(
        (session) => !session.initializing
      )
      if (!oldest)
        return deferred
          ? interaction.editReply({
              content: 'The arena is busy. Try /arena again shortly.',
            })
          : privateReply(
              interaction,
              'The arena is busy. Try /arena again shortly.'
            )
      await expire(oldest, false)
    }
    const session = {
      id: interaction.id,
      ownerId: interaction.user.id,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      revision: 0,
      battle: null,
      character,
      initializing: true,
      expired: false,
      messageId: null,
      level,
      opponent: opponent(),
      manualOpponentSelection: Boolean(balance.manualOpponentSelection),
      page: selection ? 'characters' : 'prefight',
      selectionFlow: selection,
      groupId: null,
      artKey: null,
      busy: false,
      minigame: null,
      stopped: false,
      timer: null,
      reported: false,
      expiryTimer: null,
      expiryGeneration: 0,
      work: Promise.resolve(),
      edit: (payload) => interaction.editReply(payload),
      notify: (payload) =>
        interaction.followUp
          ? interaction.followUp(payload)
          : Promise.resolve(),
    }
    sessions.set(session.id, session)
    try {
      const files = await framedArtFiles(
        character,
        session.opponent,
        session.page,
        logger
      )
      session.artKey = files.map((file) => file.name).join('|')
      const initial = { ...screen(session), files, fetchReply: true }
      const message = await (deferred
        ? interaction.editReply(initial)
        : interaction.reply(initial))
      session.messageId = message.id
      session.initializing = false
      leases?.add({
        guildId: session.guildId,
        channelId: session.channelId,
        messageId: message.id,
      })
      if (session.expired) {
        await render(session)
        leases?.remove(session.messageId)
        return
      }
      armExpiry(session)
    } catch (error) {
      sessions.delete(session.id)
      if (session.messageId)
        await interaction.editReply({ components: [] }).catch(() => {})
      throw error
    }
  }
  async function handleButton(interaction) {
    if (authorize && !(await authorize(interaction))) return
    const match =
      /^arena:([^:]+):(0|[1-9]\d*):(start|basic|opponent|quit|special1|special2|special3|pick|selectgroup|selectcharacter|selectskin|chooseskin|backcharacters|backskins|confirmfighter|changefighter)(?::([1-5]))?$/.exec(
        interaction.customId
      )
    const session = match && sessions.get(match[1])
    if (
      !session ||
      session.expired ||
      session.guildId !== interaction.guildId ||
      session.channelId !== interaction.channelId ||
      session.messageId !== interaction.message?.id
    ) {
      return privateReply(
        interaction,
        'This arena session has ended or the bot restarted. Use /arena for a new fight.'
      )
    }
    if (interaction.user.id !== session.ownerId)
      return privateReply(
        interaction,
        'Only the player who opened this arena can control it. Use /arena for your own fight.'
      )
    if (session.expiresAt !== null && now() >= session.expiresAt) {
      await expire(session)
      return privateReply(
        interaction,
        'This arena session expired. Use /arena for a new fight.'
      )
    }
    // Start the acknowledgement before any state work or queued message edit.
    // A failed acknowledgement must not strand an already-paid Finisher.
    const pendingGame = session.minigame
    const reservedPick =
      !session.busy &&
      pendingGame &&
      !pendingGame.claimed &&
      Number(match[2]) === pendingGame.revision &&
      match[3] === 'pick' &&
      match[4] &&
      pendingGame.deadline !== null &&
      now() < pendingGame.deadline
        ? pendingGame
        : null
    if (reservedPick) {
      reservedPick.claimed = true
      if (reservedPick.endTimer != null) clearTimer(reservedPick.endTimer)
      reservedPick.endTimer = null
    }
    const acknowledgement = interaction.deferUpdate().then(
      () => null,
      (error) => error
    )
    // Drop repeat/stale input immediately; never append it to the edit queue.
    if (session.busy) {
      await acknowledgement
      return
    }
    session.busy = true
    const ackError = await acknowledgement
    if (ackError) {
      session.busy = false
      if (reservedPick && session.minigame === reservedPick) {
        reservedPick.claimed = false
        armFinisher(session, reservedPick)
      }
      logger.warn?.(`Arena acknowledgement failed: ${ackError.message}`)
      return
    }
    if (session.expired) {
      session.busy = false
      return
    }
    const current = Number(match[2]) === session.revision
    const game = session.minigame
    const quit =
      current &&
      match[3] === 'quit' &&
      !match[4] &&
      session.battle?.status === 'playing' &&
      !session.stopped
    let navigation = false
    if (
      current &&
      session.manualOpponentSelection &&
      match[3] === 'opponent' &&
      !match[4] &&
      session.page === 'prefight' &&
      (!session.battle || session.battle.status !== 'playing') &&
      interaction.isStringSelectMenu?.() === true &&
      interaction.values?.length === 1
    ) {
      const chosen = availableOpponents().find(
        (character) => character.id === interaction.values[0]
      )
      if (chosen) {
        session.opponent = chosen.id
        session.battle = null
        navigation = true
        session.revision++
        armExpiry(session)
      }
    }
    if (
      current &&
      !navigation &&
      session.selectionFlow &&
      !match[4] &&
      (!session.battle || session.battle.status !== 'playing')
    ) {
      const action = match[3],
        family = familyFor(session.character),
        value = interaction.values?.length === 1 ? interaction.values[0] : null
      const isSelect = interaction.isStringSelectMenu?.() === true
      if (
        action === 'selectgroup' &&
        isSelect &&
        session.page === 'characters'
      ) {
        const group = groupsFor().find((entry) => entry.id === value)
        if (group && groupsFor().length > 1) {
          session.groupId = group.id
          session.character = variantsFor(group.entries[0])[0]
          navigation = true
        }
      } else if (
        action === 'selectcharacter' &&
        isSelect &&
        session.page === 'characters'
      ) {
        const group =
          groupsFor().find((entry) => entry.id === session.groupId) ||
          groupsFor().find((entry) =>
            entry.entries.some((item) => item.id === family.id)
          )
        const entry = group.entries.find((item) => item.id === value)
        if (entry) {
          session.character =
            entry.id === family.id ? session.character : variantsFor(entry)[0]
          navigation = true
        }
      } else if (
        action === 'selectskin' &&
        isSelect &&
        session.page === 'skins'
      ) {
        const variant = variantsFor(family).find((entry) => entry.id === value)
        if (variant) {
          session.character = variant
          navigation = true
        }
      } else if (action === 'chooseskin' && session.page === 'characters') {
        session.page = 'skins'
        navigation = true
      } else if (action === 'backcharacters' && session.page === 'skins') {
        session.page = 'characters'
        navigation = true
      } else if (
        action === 'backskins' &&
        session.page === 'prefight' &&
        !session.battle
      ) {
        session.page = 'skins'
        navigation = true
      } else if (
        action === 'confirmfighter' &&
        session.page === 'skins' &&
        variantsFor(family).some((entry) => entry.id === session.character.id)
      ) {
        session.page = 'prefight'
        navigation = true
        try {
          preferences.set(session.guildId, session.ownerId, {
            familyId: family.id,
            variantId: session.character.id,
          })
        } catch (error) {
          logger.warn?.(`Arena preference save failed: ${error.message}`)
        }
      } else if (
        action === 'changefighter' &&
        session.battle &&
        session.battle.status !== 'playing'
      ) {
        session.battle = null
        session.page = 'characters'
        navigation = true
      }
      if (navigation) {
        session.revision++
        armExpiry(session)
      }
    }
    const start =
      current &&
      session.page === 'prefight' &&
      !match[4] &&
      match[3] === 'start' &&
      (!session.battle ||
        session.battle.status !== 'playing' ||
        session.stopped)
    const basic =
      current &&
      match[3] === 'basic' &&
      !match[4] &&
      !session.stopped &&
      !session.minigame &&
      session.battle?.status === 'playing'
    const special =
      current &&
      !match[4] &&
      ['special1', 'special2', 'special3'].includes(match[3]) &&
      !session.stopped &&
      !session.minigame &&
      session.battle?.status === 'playing' &&
      session.battle.mode !== 'idle' &&
      canUse(session.battle.player, match[3])
    // One stable random arrangement per Finisher; old games stay stale.
    const pick = game && reservedPick === game
    let gameStarted = false
    if (quit) {
      cancel(session)
      session.minigame = null
      session.battle = {
        ...session.battle,
        status: 'quit',
        player: {
          ...session.battle.player,
          slayerCharges: 0,
          criticalReady: false,
          opportunityReady: false,
        },
      }
      session.revision++
      armExpiry(session)
    } else if (start) {
      cancel(session)
      if (session.battle && !session.manualOpponentSelection)
        session.opponent = opponent()
      session.battle = newBattle(0, {
        character: session.character,
        level: session.level,
        opponent: session.opponent,
      })
      session.minigame = null
      session.stopped = false
      session.reported = false
      session.revision++
      armExpiry(session)
    } else if (basic) {
      session.revision++
    } else if (special) {
      if (match[3] === 'special3') {
        const values = order()
        cancel(session)
        session.battle = beginFinisher(session.battle)
        session.minigame = {
          revision: session.revision + 1,
          order: values,
          claimed: false,
          deadline: null,
        }
        gameStarted = true
      }
      session.revision++
      armExpiry(session)
    } else if (pick) {
      cancel(session)
      session.minigame.claimed = true
      session.minigame.choice = Number(match[4])
      session.revision++
      armExpiry(session)
    }
    if (!quit && !start && !basic && !special && !navigation && !pick) {
      session.busy = false
      return
    }
    cancelExpiry(session)
    session.expiresAt = null
    return enqueue(session, async () => {
      if (pick && session.minigame === game && !session.expired)
        return resolveGame(session, Number(match[4]))
      if (basic || (special && !gameStarted)) {
        await render(session)
        session.battle = takeTurn(
          session.battle,
          basic ? 'basic' : { [match[3]]: true },
          roll,
          rollDuality,
          rollFearSpend,
          rollAccuracy,
          rollCritical,
          rollEffect,
          { aiPolicy, rollFinisher, rollRecovery }
        )
        complete(session)
        if (session.battle.status !== 'playing') {
          cancel(session)
          armExpiry(session)
        }
      }
      await render(session, true)
      session.busy = false
      if (session.minigame) armFinisher(session)
      armExpiry(session)
    })
  }
  function dispose() {
    const pending = [...sessions.values()].map((session) =>
      expire(session, false)
    )
    sessions.clear()
    return Promise.allSettled(pending)
  }
  return { execute, handleButton, dispose }
}
const live = ['development', 'production'].includes(process.env.NODE_ENV)
const leases = live ? require('./message-leases').createLeaseStore() : null
module.exports = {
  createArena,
  arena: createArena({
    authorize: require('./access').access.authorize,
    leases,
    preferences: live ? createPreferenceStore() : createMemoryPreferences(),
    onComplete: live ? saveCombatReport : () => {},
  }),
}
