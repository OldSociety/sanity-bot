const { randomInt } = require('node:crypto')
const secondary = require('./secondary')
const { newBattle, takeTurn, beginFinisher } = require('./combat')
const { screen, actionLines, fallbackStatus } = require('./interface')
const { framedArtFiles } = require('./art')
const { cardName, renderHealthCard } = require('./health-card')
const { legendFile } = require('./legend')
const {
  familyFor,
  variantsFor,
  groupsFor,
  rosterFor,
  defaultPlayerVariant,
  createMemoryPreferences,
  createPreferenceStore,
  createAsyncPreferenceStore,
  preferredVariant,
} = require('./selection')
const { combatReport, saveCombatReport } = require('./statistics')
const { canUse, kitFor, sessionTimeoutMs } = require('./rules')
const { balance } = require('./rules')
const { availableOpponents, initialOpponent } = require('./opponents')
const {
  createMessageTransport,
  lockedControls,
} = require('./message-transport')
const { snapshot, buildPresentation } = require('./presentation')
const { createTiming } = require('./timing')
const { timingFooter } = require('./battle-report')
const { createClickResponse } = require('./click-response')
const { measureRest } = require('./rest-timing')
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
  renderLegend = legendFile,
  engine = { newBattle, takeTurn, beginFinisher },
  responsive = process.env.NODE_ENV !== 'production' || require('./build-profile').productionPlaytest,
  retryDelay,
  diagnostics = () => true,
  onTiming = () => {},
  onDiagnosticReport = null,
  arenaVersion = () => require('./versioning').runtimeVersion(),
  quickResponses = responsive,
  setResponseTimer = setTimeout,
  clearResponseTimer = clearTimeout,
  lifecycle = null,
  getPlayerAccess = null,
} = {}) {
  const sessions = new Map()
  function applyPlayerAccess(session, access) {
    const { characters, isSelectable } = require('./characters')
    if (!access || !Array.isArray(access.allowedVariantIds) || !Number.isInteger(access.level) || access.level < 1 || access.level > 60)
      throw Error('Invalid Arena player profile')
    const allowed = characters.filter(character => isSelectable(character) && access.allowedVariantIds.includes(character.id))
    if (!allowed.length) throw Error('No unlocked Arena fighters are available')
    session.allowedVariantIds = allowed.map(character => character.id)
    session.diagnosticRoster = access.diagnosticRoster === true
    session.ownershipUnavailable = access.ownershipUnavailable === true
    session.level = access.level
    session.playerProgress = access.progress || null
    if (!allowed.some(character => character.id === session.character.id)) {
      session.character = defaultPlayerVariant(session.allowedVariantIds)
      return true
    }
    return false
  }
  const pendingDiagnostics = new Set()
  let disposed = false
  function queueDiagnostic(session, status = session.battle?.status) {
    if (!onDiagnosticReport || !session.battle || session.diagnosticQueued ||
        !['victory', 'defeat', 'quit', 'expired'].includes(status)) return
    session.diagnosticQueued = true
    const report = structuredClone({
      sessionId: session.id, fightNumber: session.fightNumber,
      ownerId: session.ownerId, ownerUsername: session.ownerUsername,
      ownerDisplayName: session.ownerDisplayName, guildId: session.guildId,
      arenaVersion: session.arenaVersion,
      channelId: session.channelId, messageId: session.messageId,
      battle: { ...session.battle, status },
      roundTimings: session.roundTimings,
      interactionTimings: session.interactionTimings.filter(r => r.fightNumber === session.fightNumber),
    })
    const work = Promise.resolve()
      .then(() => onDiagnosticReport(report, session.diagnosticClient))
      .catch(error => logger.error('Arena private diagnostic failed:', error.code || error.name))
      .finally(() => pendingDiagnostics.delete(work))
    pendingDiagnostics.add(work)
  }
  async function diagnosticValue() {
    try {
      return Boolean(await diagnostics())
    } catch {
      logger.warn?.('Arena diagnostic setting unavailable; using compact logs')
      return false
    }
  }
  function trace(session) {
    const initialRound = session.battle?.tick || 0
    return createTiming({
      logger,
      metadata: { arenaVersion: session.arenaVersion },
      sample: session.diagnostic === true,
      onFinish(record) {
        Object.assign(record, {
          sessionId: session.id,
          round: session.battle?.tick || 0,
          fightNumber: session.fightNumber || 0,
          arenaVersion: session.arenaVersion,
        })
        if (!['duplicate', 'stale', 'expired'].includes(record.action)) {
          session.interactionTimings.push({ ...record })
          if (session.interactionTimings.length > 512)
            session.interactionTimings.shift()
          session.lastTiming = record
          if (record.round > initialRound) {
            session.roundTimings[record.round] = record
            const keys = Object.keys(session.roundTimings)
            if (keys.length > 512) delete session.roundTimings[keys[0]]
          }
        }
        Promise.resolve()
          .then(() => onTiming(record))
          .catch(() => logger.warn?.('Arena timing record could not be saved'))
        // Wait for the player's completed delivery timing, but never make the
        // player wait for the separate private-channel send.
        queueDiagnostic(session)
      },
    })
  }
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
    if (responsive) {
      session.diagnostic = await diagnosticValue()
      // Expiry may invalidate a snapshot while native rendering is in flight.
      // Discard it before publishing, then render the new terminal revision.
      for (;;) {
        const state = snapshot(session, unlock)
        const presentation = await buildPresentation(state, {
          renderCard,
          renderLegend,
          logger,
          now,
          timing: session.timing,
        })
        if (state.revision !== session.revision) continue
        Object.assign(session, {
          card: presentation.card,
          cardRetryAt: presentation.cardRetryAt,
          legendRetryAt: presentation.legendRetryAt,
        })
        try {
          if (session.timing && session.diagnostic !== false)
            timingFooter(
              presentation.view,
              session.timing.snapshot(),
              session.lastTiming
            )
          const send = () =>
            session.clickResponse
              ? session.transport.send(
                  presentation.view,
                  presentation.files,
                  session.clickResponse
                )
              : measureRest(
                  session.rest,
                  () =>
                    session.transport.send(
                      presentation.view,
                      presentation.files
                    ),
                  session.timing
                )
          if (session.timing) await session.timing.phase('deliveryMs', send)
          else await send()
          session.deliveredRevision = state.revision
          session.deliveryPending = false
          return true
        } catch (error) {
          // The committed battle remains valid. Refresh/retry only republishes
          // that revision; it must never repeat the paid action or random draw.
          session.deliveryPending = true
          logger.warn?.(
            `Arena message delivery failed: ${error.code || error.name}`
          )
          // Avoid inserting/removing a recovery button on every normal turn.
          // Only offer it after result delivery actually failed, without PNGs.
          if (
            !session.expired &&
            ![10003, 10008, 50001, 50013, 50027].includes(Number(error.code))
          )
            await session.transport
              .recover(session.id, session.revision)
              .catch(() => {})
          return false
        }
      }
    }
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
          require('./versioning').label(session.arenaVersion) + '\n' +
          (actionLines(session.battle.history).join('\n') || 'No actions recorded.')
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
    session.work = session.work
      .then(work)
      .catch(async (error) => {
        logger.error('Arena update failed:', error.message)
        session.stopped = true
        session.busy = false
        cancel(session)
        session.minigame = null
        await render(session).catch(() => {})
        if (!session.expired) armExpiry(session)
      })
      .finally(() => {
        session.clickResponse?.cancel()
        session.clickResponse = null
        drainSelection(session)
      })
    return session.work
  }
  function queueSelection(session, interaction, match, acknowledgement) {
    if (!session.selectionFlow || session.expired || session.battle?.status === 'playing' ||
        interaction.isStringSelectMenu?.() !== true || interaction.values?.length !== 1 ||
        !['selectcharacter', 'selectskin', 'selectgroup'].includes(match[3]) ||
        (match[3] === 'selectskin' ? session.page !== 'skins' : session.page !== 'characters') ||
        ![session.revision, session.deliveredRevision].includes(Number(match[2]))) return null
    session.pendingSelection?.resolve()
    let resolve, reject
    const promise = new Promise((yes, no) => { resolve = yes; reject = no })
    session.pendingSelection = { interaction, action: match[3], value: interaction.values[0], acknowledgement, resolve, reject }
    return promise
  }
  function drainSelection(session) {
    if (session.drainingSelection || !session.pendingSelection || session.expired) return
    session.drainingSelection = true
    session.busy = true
    // This is deliberately outside session.work: replay appends to that queue.
    session.pendingDrain = Promise.resolve().then(async () => {
      while (session.pendingSelection) {
        session.busy = true
        const pending = session.pendingSelection
        session.pendingSelection = null
        const ackError = await pending.acknowledgement
        if (ackError || session.expired || session.pendingSelection) { pending.resolve(); continue }
        session.busy = true
        const source = pending.interaction
        try {
          await handleButton({
            user: source.user, guildId: source.guildId, channelId: source.channelId,
            client: source.client, member: source.member, message: { id: session.messageId },
            customId: `arena:${session.id}:${session.revision}:${pending.action}`,
            values: [pending.value], isStringSelectMenu: () => true, queuedSelection: true,
            deferUpdate: async () => {}, editReply: payload => source.editReply(payload),
            reply: payload => source.followUp?.(payload) || Promise.resolve(),
          })
          pending.resolve()
        } catch (error) { pending.reject(error) }
      }
    }).finally(() => {
      session.drainingSelection = false
      session.busy = false
      drainSelection(session)
    })
    session.pendingDrain.catch(error => logger.warn?.(`Arena selection replay failed: ${error.code || error.name}`))
  }
  function expire(session, notify = true) {
    if (session.expired) return session.work
    session.expired = true
    session.pendingSelection?.resolve()
    session.pendingSelection = null
    session.stopped = true
    session.revision++
    cancel(session)
    session.minigame = null
    cancelExpiry(session)
    sessions.delete(session.id)
    session.releaseMenu?.()
    return enqueue(session, async () => {
      try {
        if ((await render(session)) !== false)
          await leases?.remove(session.messageId)
      } catch (error) {
        logger.warn?.(`Arena button cleanup failed: ${error.message}`)
      }
      queueDiagnostic(session, session.battle?.status === 'playing' ? 'expired' : session.battle?.status)
      complete(session, session.battle?.status === 'playing' ? 'expired' : session.battle?.status)
      if (notify && !responsive)
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
  function complete(session, status = session.battle?.status) {
    if (
      session.reported ||
      !session.battle || !['victory', 'defeat', 'quit', 'expired'].includes(status)
    )
      return
    session.reported = true
    try {
      Promise.resolve(onComplete({
        ...combatReport({ ...session.battle, status }),
        arenaVersion: session.arenaVersion,
        gameId: `${session.id}:${session.fightNumber}`,
        sessionId: session.id, fightNumber: session.fightNumber,
        playerId: session.ownerId, playerUsername: session.ownerUsername,
        guildId: session.guildId, channelId: session.channelId,
        startedAt: session.startedAt, completedAt: new Date(now()).toISOString(),
        outcome: status, gameMode: 'arena', aiPolicy,
        playerCharacterId: session.battle.player.id || session.character,
        opponentCharacterId: session.battle.enemy.id || session.opponent,
      })).catch((error) =>
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
    const autonomous = responsive && !session.timing
    if (autonomous) session.timing = trace(session)
    try {
      session.busy = true
      cancel(session)
      session.minigame = null
      session.revision++
      const advance = () =>
        engine.takeTurn(
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
      session.battle = session.timing
        ? await session.timing.phase('combatMs', advance)
        : advance()
      complete(session)
      await render(session, true)
      session.busy = false
      armExpiry(session)
    } finally {
      if (autonomous) {
        session.timing.finish({
          action: 'finisher-timeout',
          revision: session.revision,
          failed: session.deliveryPending,
        })
        session.timing = null
      }
    }
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
  function startBattle(session) {
    cancel(session)
    if (session.battle && !session.manualOpponentSelection) session.opponent = opponent()
    session.battle = engine.newBattle(0, { character: session.character, level: session.level, opponent: session.opponent })
    session.battle.arenaVersion = structuredClone(session.arenaVersion)
    session.startedAt = new Date(now()).toISOString()
    session.roundTimings = {}
    session.fightNumber++
    session.diagnosticQueued = false
    session.lastTiming = null
    session.minigame = null
    session.stopped = false
    session.reported = false
    session.revision++
  }
  async function execute(interaction, character, options = {}) {
    const timing = responsive
      ? createTiming({
          logger,
          onFinish: (record) => {
            const session = sessions.get(interaction.id)
            if (session) session.interactionTimings.push({ ...record })
            Promise.resolve()
              .then(() =>
                onTiming({ ...record, sessionId: interaction.id, round: 0 })
              )
              .catch(() =>
                logger.warn?.('Arena timing record could not be saved')
              )
          },
        })
      : null
    let failed = false
    try {
      return await executeSession(interaction, character, options, timing)
    } catch (error) {
      failed = true
      throw error
    } finally {
      timing?.finish({ action: 'open', failed })
    }
  }
  async function executeSession(
    interaction,
    character,
    { selection = false, startImmediately = false, initialPage } = {},
    timing
  ) {
    // Give direct /arena fight choices the same equipment step as the picker.
    if (secondary.enabled()) startImmediately = false
    if (disposed)
      return privateReply(
        interaction,
        'Arena is restarting. Please try again shortly.'
      )
    if (authorize && !(await authorize(interaction))) return
    const deferred = Boolean(interaction.deferReply)
    if (deferred && !interaction.deferred && !interaction.replied) {
      if (timing) await timing.phase('ackMs', () => interaction.deferReply())
      else await interaction.deferReply()
    }
    return lifecycle
      ? lifecycle.open(interaction, () => openSession(interaction, character, selection, timing, deferred, { startImmediately, initialPage }))
      : openSession(interaction, character, selection, timing, deferred, { startImmediately, initialPage })
  }
  async function openSession(interaction, character, selection, timing, deferred, { startImmediately, initialPage }) {
    let playerAccess
    if (getPlayerAccess) {
      try { playerAccess = await getPlayerAccess(interaction) }
      catch (error) {
        logger.warn?.(`Arena player profile unavailable: ${error.code || error.name}`)
        const payload = { content: 'Your Arena player data is unavailable. Please try again shortly.', components: [], allowedMentions: { parse: [] } }
        return deferred ? interaction.editReply(payload) : interaction.reply({ ...payload, ephemeral: true })
      }
    }
    const level = playerAccess?.level || 1
    let saved
    if (selection && !getPlayerAccess) {
      try {
        saved = await preferences.get(interaction.guildId, interaction.user.id)
      } catch (error) {
        logger.warn?.(`Arena preference read failed: ${error.message}`)
      }
    }
    character = getPlayerAccess
      ? character || defaultPlayerVariant(playerAccess.allowedVariantIds)
      : preferredVariant(saved, character)
    if (secondary.enabled() && !require('./characters').isSelectable(character))
      character = defaultPlayerVariant(playerAccess?.allowedVariantIds)
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
      arenaVersion: structuredClone(arenaVersion()),
      ownerId: interaction.user.id,
      ownerUsername: interaction.user.username,
      ownerDisplayName: interaction.member?.displayName || interaction.member?.nick || interaction.user.globalName || interaction.user.username,
      diagnosticClient: interaction.client,
      diagnosticQueued: false,
      fightNumber: 0,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      revision: 0,
      battle: null,
      character,
      secondaryId: null,
      secondaryDetails: false,
      initializing: true,
      expired: false,
      messageId: null,
      level,
      opponent: opponent(),
      manualOpponentSelection: Boolean(balance.manualOpponentSelection),
      page: selection ? (initialPage === 'skins' ? 'skins' : 'characters') : 'prefight',
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
      rest: interaction.client?.rest,
      presentationV2: responsive,
      diagnostic: responsive ? await diagnosticValue() : true,
      roundTimings: {},
      interactionTimings: [],
      deliveredRevision: 0,
      deliveryPending: false,
      edit: (payload) => interaction.editReply(payload),
      notify: (payload) =>
        interaction.followUp
          ? interaction.followUp(payload)
          : Promise.resolve(),
    }
    if (playerAccess && applyPlayerAccess(session, playerAccess) && startImmediately) {
      const payload = { content: 'That fighter is no longer unlocked. Use /arena fight to choose an available character.', components: [], allowedMentions: { parse: [] } }
      return deferred ? interaction.editReply(payload) : interaction.reply({ ...payload, ephemeral: true })
    }
    timing?.detail('arenaVersion', session.arenaVersion)
    sessions.set(session.id, session)
    session.releaseMenu = lifecycle?.track(interaction, () => expire(session, false))
    try {
      if (startImmediately) startBattle(session)
      const prepareArt = () =>
        framedArtFiles(session.character, session.opponent, session.page, logger)
      const presentation = startImmediately ? await buildPresentation(snapshot(session), { renderCard, renderLegend, logger, now, timing }) : null
      const files = presentation ? presentation.files : timing ? await timing.phase('renderMs', prepareArt) : await prepareArt()
      if (presentation) Object.assign(session, { card: presentation.card, cardRetryAt: presentation.cardRetryAt, legendRetryAt: presentation.legendRetryAt })
      session.artKey = files.map((file) => file.name).join('|')
      const initial = { ...(presentation?.view || screen(session)), files, fetchReply: true }
      if (timing && session.diagnostic !== false)
        timingFooter(initial, timing.snapshot())
      const deliver = () =>
        deferred ? interaction.editReply(initial) : interaction.reply(initial)
      const message = timing
        ? await timing.phase('deliveryMs', () =>
            measureRest(interaction.client?.rest, deliver, timing)
          )
        : await deliver()
      session.messageId = message.id
      if (responsive)
        session.transport = createMessageTransport(message, {
          fallback: (payload) => interaction.editReply(payload),
          retryDelay,
          onRetry: () => logger.warn?.('Arena message delivery retry'),
        })
      session.initializing = false
      await leases?.add({
        guildId: session.guildId,
        channelId: session.channelId,
        messageId: message.id,
      })
      if (session.expired) {
        await render(session)
        await leases?.remove(session.messageId)
        return
      }
      armExpiry(session)
    } catch (error) {
      sessions.delete(session.id)
      session.releaseMenu?.()
      if (session.messageId)
        await interaction.editReply({ components: [] }).catch(() => {})
      throw error
    }
  }
  async function handleButton(interaction) {
    if (authorize && !(await authorize(interaction))) return
    const match =
      /^arena:([^:]+):(0|[1-9]\d*):(start|basic|opponent|quit|special1|special2|special3|pick|selectgroup|selectcharacter|selectskin|chooseskin|backcharacters|backskins|confirmfighter|changefighter|refresh|equipsecondary|secondary)(?::([1-5]))?$/.exec(
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
      if (lifecycle && match && (!session || session.expired) && interaction.update)
        return interaction.update({ components: [], allowedMentions: { parse: [] } })
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
      if (lifecycle && interaction.update) {
        await interaction.update({ components: [], allowedMentions: { parse: [] } })
        return expire(session, false)
      }
      const reply = privateReply(
        interaction,
        'This arena session expired. Use /arena for a new fight.'
      )
      await expire(session)
      return reply
    }
    // Start the acknowledgement before any state work or queued message edit.
    // A failed acknowledgement must not strand an already-paid Finisher.
    const pendingGame = session.minigame
    const reservedPick =
      !session.busy &&
      (!responsive || !session.deliveryPending) &&
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
    const timing = responsive ? trace(session) : null
    if (responsive && !session.busy)
      session.transport.observe(interaction.message)
    const visibleControl = interaction.message.components
      ?.flatMap((row) => row.components || row.toJSON?.().components || [])
      .map((component) =>
        component.toJSON ? component.toJSON() : component.data || component
      )
      .some(
        (component) =>
          component.custom_id === interaction.customId && !component.disabled
      )
    const lock =
      responsive &&
      !session.busy &&
      (Number(match[2]) === session.revision ||
        match[3] === 'refresh' ||
        session.deliveryPending) &&
      visibleControl &&
      interaction.update
    const acknowledge = () =>
      lock
        ? interaction.update(
            lockedControls(interaction.message, session.id, session.revision)
          )
        : interaction.deferUpdate()
    const clickResponse =
      quickResponses && lock && typeof interaction.editReply === 'function'
        ? createClickResponse(interaction, {
            locked: lockedControls(
              interaction.message,
              session.id,
              session.revision
            ),
            timing,
            setTimer: setResponseTimer,
            clearTimer: clearResponseTimer,
            measure: (work) =>
              measureRest(interaction.client?.rest, work, timing),
          })
        : null
    const acknowledgement = Promise.resolve()
      .then(() =>
        clickResponse
          ? null
          : timing
          ? timing.phase('ackMs', () =>
              measureRest(interaction.client?.rest, acknowledge, timing)
            )
          : acknowledge()
      )
      .then(
        () => null,
        (error) => error
      )
    // Drop repeat/stale input immediately; never append it to the edit queue.
    if (session.busy && !interaction.queuedSelection) {
      const queued = queueSelection(session, interaction, match, acknowledgement)
      await acknowledgement
      timing?.finish({ action: queued ? 'queued-selection' : 'duplicate' })
      return queued
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
      timing?.finish({ action: match[3], failed: true })
      drainSelection(session)
      return
    }
    if (session.expired) {
      await clickResponse?.defer()
      clickResponse?.cancel()
      session.busy = false
      timing?.finish({ action: 'expired' })
      return
    }
    session.timing = timing
    session.clickResponse = clickResponse
    if (getPlayerAccess && session.battle?.status !== 'playing') {
      try {
        const access = timing
          ? await timing.phase('playerAccessMs', () => getPlayerAccess(interaction))
          : await getPlayerAccess(interaction)
        const replaced = applyPlayerAccess(session, access)
        if (replaced) {
          session.battle = null
          session.selectionFlow = true
          session.page = 'characters'
          session.groupId = null
          session.revision++
          return enqueue(session, async () => {
            await render(session, true)
            session.busy = false
            armExpiry(session)
            timing?.finish({ action: 'ownership-refresh' })
            session.timing = null
          })
        }
      } catch (error) {
        logger.warn?.(`Arena player profile unavailable: ${error.code || error.name}`)
        session.busy = false
        await clickResponse?.defer()
        await expire(session, false)
        timing?.finish({ action: 'ownership-unavailable', failed: true })
        session.timing = null
        return
      }
    }
    // A stale display can only refresh the committed state, never spend again.
    if (responsive && (match[3] === 'refresh' || session.deliveryPending)) {
      cancelExpiry(session)
      return enqueue(session, async () => {
        await render(session, true)
        session.busy = false
        if (session.minigame && !session.deliveryPending) armFinisher(session)
        armExpiry(session)
        timing?.finish({
          action: 'refresh',
          revision: session.revision,
          failed: session.deliveryPending,
        })
        session.timing = null
      })
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
    if (current && !match[4] && secondary.enabled()) {
      if (match[3] === 'equipsecondary' && session.page === 'prefight' &&
          (!session.battle || session.battle.status !== 'playing') &&
          interaction.isStringSelectMenu?.() === true && interaction.values?.length === 1) {
        const value = interaction.values[0]
        if (value === 'none' || secondary.choices(session).some(character => character.id === value)) {
          session.secondaryId = value === 'none' ? null : value
          session.secondaryDetails = false
          navigation = true
        }
      } else if (match[3] === 'secondary' && secondary.equipped(session) &&
          session.battle?.status === 'playing' && !session.stopped && !session.minigame) {
        session.secondaryDetails = !session.secondaryDetails
        navigation = true
      }
      if (navigation) session.revision++
    }
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
        const groups = groupsFor(rosterFor(session.allowedVariantIds))
        const group = groups.find((entry) => entry.id === value)
        if (group && groups.length > 1) {
          session.groupId = group.id
          session.character = variantsFor(group.entries[0], session.allowedVariantIds)[0]
          navigation = true
        }
      } else if (
        action === 'selectcharacter' &&
        isSelect &&
        session.page === 'characters'
      ) {
        const group =
          groupsFor(rosterFor(session.allowedVariantIds)).find((entry) => entry.id === session.groupId) ||
          groupsFor(rosterFor(session.allowedVariantIds)).find((entry) =>
            entry.entries.some((item) => item.id === family.id)
          )
        const entry = group?.entries.find((item) => item.id === value)
        if (entry) {
          session.character =
            entry.id === family.id ? session.character : variantsFor(entry, session.allowedVariantIds)[0]
          navigation = true
        }
      } else if (
        action === 'selectskin' &&
        isSelect &&
        session.page === 'skins'
      ) {
        const variant = variantsFor(family, session.allowedVariantIds).find((entry) => entry.id === value)
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
        variantsFor(family, session.allowedVariantIds).some((entry) => entry.id === session.character.id)
      ) {
        session.page = 'prefight'
        navigation = true
        try {
          await preferences.set(session.guildId, session.ownerId, {
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
        if (!secondary.equipped(session)) session.secondaryId = null
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
      complete(session)
      armExpiry(session)
    } else if (start) {
      startBattle(session)
      armExpiry(session)
    } else if (basic) {
      session.revision++
    } else if (special) {
      if (match[3] === 'special3') {
        const values = order()
        cancel(session)
        session.battle = engine.beginFinisher(session.battle)
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
      if (lock) await render(session, true)
      session.busy = false
      timing?.finish({ action: 'stale' })
      session.timing = null
      clickResponse?.cancel()
      session.clickResponse = null
      drainSelection(session)
      return
    }
    cancelExpiry(session)
    session.expiresAt = null
    const queuedAt = now()
    return enqueue(session, async () => {
      const queueMs = now() - queuedAt
      try {
        if (pick && session.minigame === game && !session.expired)
          return await resolveGame(session, Number(match[4]))
        if (session.expired) return
        if (basic || (special && !gameStarted)) {
          if (!responsive) await render(session)
          const advance = () =>
            engine.takeTurn(
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
          session.battle = timing
            ? await timing.phase('combatMs', advance)
            : advance()
          complete(session)
          if (session.battle.status !== 'playing') {
            cancel(session)
            armExpiry(session)
          }
        }
        await render(session, true)
        session.busy = false
        if (session.minigame && !session.deliveryPending) armFinisher(session)
        armExpiry(session)
      } finally {
        timing?.finish({
          action: match[3],
          revision: session.revision,
          queueMs,
          failed: session.deliveryPending,
        })
        session.timing = null
      }
    })
  }
  function dispose() {
    disposed = true
    const pending = [...sessions.values()].flatMap((session) =>
      [expire(session, false), session.pendingDrain].filter(Boolean)
    )
    sessions.clear()
    return Promise.allSettled(pending).then(async (results) => {
      await Promise.allSettled([...pendingDiagnostics])
      if (responsive) await require('./async-state').flushState()
      return results
    })
  }
  return { execute, handleButton, dispose }
}
const live = ['development', 'production'].includes(process.env.NODE_ENV)
if (live && !process.env.NODE_TEST_CONTEXT) require('./versioning').runtimeVersion()
const leases = live ? require('./message-leases').createLeaseStore() : null
module.exports = {
  createArena,
  arena: createArena({
    getPlayerAccess: process.env.NODE_ENV === 'development' ? interaction => require('./player-access').playerAccess(interaction) : null,
    lifecycle: process.env.NODE_ENV === 'development' ? require('./menu-lifecycle').menuLifecycle : null,
    authorize: require('./access').access.authorize,
    leases,
    preferences:
      process.env.NODE_ENV === 'development' || require('./build-profile').productionPlaytest
        ? createAsyncPreferenceStore()
        : live
        ? createPreferenceStore()
        : createMemoryPreferences(),
    onComplete: live ? saveCombatReport : () => {},
    onDiagnosticReport: process.env.NODE_ENV === 'production'
      ? require('./private-diagnostics').createPrivateDiagnosticReporter()
      : null,
    diagnostics: () => process.env.NODE_ENV === 'production'
      ? false
      : require('./diagnostics').diagnosticSettings.get(),
    onTiming:
      process.env.NODE_ENV === 'development' || require('./build-profile').productionPlaytest
        ? (record) =>
            require('./async-state').appendReport(
              require('node:path').resolve(
                __dirname,
                process.env.NODE_ENV === 'production'
                  ? '../../artifacts/arena-interactions-production.jsonl'
                  : '../../artifacts/arena-interactions-development.jsonl'
              ),
              JSON.stringify({
                recordedAt: new Date().toISOString(),
                ...record,
              }) + '\n'
            )
        : () => {},
  }),
}
