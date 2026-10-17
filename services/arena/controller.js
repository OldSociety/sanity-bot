const { randomInt } = require('node:crypto')
const { newBattle, advance, beginFinisher } = require('./combat')
const { screen, artFiles } = require('./interface')
const { familyFor, variantsFor, groupsFor, createMemoryPreferences, createPreferenceStore, preferredVariant } = require('./selection')
const { combatReport, saveCombatReport } = require('./statistics')
const { canUse, activeTickMs, idleTickMs: defaultIdleTickMs, sessionTimeoutMs, finisherStepMs, finisherWindowMs } = require('./rules')
const shuffle = () => {
  const values = [1, 2, 3, 4, 5]
  for (let i = 4; i > 0; i--) { const j = randomInt(i + 1); [values[i], values[j]] = [values[j], values[i]] }
  return values
}
function createArena({ roll, rollDuality, rollFearSpend, rollAccuracy, rollCritical, rollEffect, aiPolicy = 'tactical', logger = console, maxSessions = 1000,
  tickMs = activeTickMs, idleTickMs = defaultIdleTickMs, timeoutMs = sessionTimeoutMs, gameStepMs = finisherStepMs, choiceWindowMs = finisherWindowMs,
  setTimer = setTimeout, clearTimer = clearTimeout, setExpiryTimer = setTimeout, clearExpiryTimer = clearTimeout, shuffleButtons = shuffle,
  leases = null, preferences = createMemoryPreferences(), now = Date.now, onComplete = () => {} } = {}) {
  const sessions = new Map()
  const privateReply = (interaction, content) => interaction.reply({ content, ephemeral: true, allowedMentions: { parse: [] } }).catch(() => {})
  function cancel(session) {
    if (session.timer !== null) clearTimer(session.timer)
    session.timer = null
    if (session.minigame?.endTimer != null) clearTimer(session.minigame.endTimer)
    if (session.minigame) session.minigame.endTimer = null
  }
  function cancelExpiry(session) {
    session.expiryGeneration++
    if (session.expiryTimer !== null) clearExpiryTimer(session.expiryTimer)
    session.expiryTimer = null
  }
  async function render(session) {
    const view = screen(session)
    const files = view.embeds[0].data.image ? artFiles(session.character, session.opponent, session.page) : []
    const key = files[0]?.name || null
    // Keep one relevant image attached; never reupload art on ordinary ticks.
    await session.edit({ ...view, ...(key !== session.artKey ? { attachments: [], ...(files.length ? { files } : {}) } : {}) })
    session.artKey = key
  }
  function enqueue(session, work) {
    session.work = session.work.then(work).catch(async error => {
      logger.error('Arena update failed:', error.message)
      session.stopped = true
      session.pendingSpecial = null
      cancel(session)
      session.minigame = null
      await render(session).catch(() => {})
      if (!session.expired) armExpiry(session)
    })
    return session.work
  }
  function expire(session, notify = true) {
    if (session.expired) return session.work
    session.expired = true; session.stopped = true; session.pendingSpecial = null; session.revision++
    cancel(session); session.minigame = null; cancelExpiry(session); sessions.delete(session.id)
    return enqueue(session, async () => {
      try { await render(session); leases?.remove(session.messageId) }
      catch (error) { logger.warn?.(`Arena button cleanup failed: ${error.message}`) }
      if (notify) await session.notify({ content: 'Session expired. Please use /arena to try again.', ephemeral: true,
        allowedMentions: { parse: [] } }).catch(error => logger.warn?.(`Arena expiry followUp failed: ${error.message}`))
    })
  }
  function armExpiry(session) {
    cancelExpiry(session)
    session.expiresAt = null
    // Optional ability buttons are not a required response. Running exchanges
    // keep progressing; only a lobby, result, or stopped fight is waiting.
    if (session.expired || (session.battle?.status === 'playing' && !session.stopped)) return
    session.expiresAt = now() + timeoutMs
    const generation = session.expiryGeneration
    session.expiryTimer = setExpiryTimer(() => {
      if (generation !== session.expiryGeneration || session.expired) return
      session.expiryTimer = null
      return expire(session, !['victory', 'defeat', 'quit'].includes(session.battle?.status))
    }, timeoutMs)
    session.expiryTimer?.unref?.()
  }
  function schedule(session) {
    if (session.expired || session.stopped || session.minigame || session.battle?.status !== 'playing' || session.timer !== null) return
    session.timer = setTimer(() => {
      session.timer = null
      return enqueue(session, async () => {
        if (session.expired || session.stopped || session.minigame || session.battle?.status !== 'playing') return
        const action = session.pendingSpecial ? { [session.pendingSpecial]: true } : {}
        session.battle = advance(session.battle, action, roll, rollDuality, rollFearSpend, rollAccuracy, rollCritical, rollEffect, { aiPolicy })
        if (session.pendingSpecial) session.revision++
        session.pendingSpecial = null
        complete(session)
        await render(session)
        if (session.battle.status !== 'playing') armExpiry(session)
        schedule(session)
      })
    }, session.battle.mode === 'idle' ? idleTickMs : tickMs)
    session.timer?.unref?.()
  }
  function complete(session) {
    if (session.reported || !['victory', 'defeat'].includes(session.battle?.status)) return
    session.reported = true
    try { Promise.resolve(onComplete(combatReport(session.battle))).catch(error => logger.error('Arena report failed:', error.message)) }
    catch (error) { logger.error('Arena report failed:', error.message) }
  }
  function order() {
    const values = shuffleButtons()
    if (!Array.isArray(values) || values.length !== 5 || [...values].sort().join() !== '1,2,3,4,5') throw Error('Expected a permutation of 1–5')
    return values
  }
  async function resolveGame(session, choice) {
    if (session.expired || !session.minigame) return
    cancel(session); session.minigame = null; session.revision++
    session.battle = advance(session.battle, { special3: true, choice }, roll, rollDuality, rollFearSpend, rollAccuracy, rollCritical, rollEffect, { aiPolicy })
    complete(session)
    await render(session)
    if (session.battle.status !== 'playing') armExpiry(session)
    schedule(session)
  }
  function scheduleGame(session) {
    const game = session.minigame
    if (!game || game.claimed || session.expired || session.timer !== null) return
    if (game.deadline === null) {
      game.deadline = now() + choiceWindowMs
      game.endTimer = setTimer(() => {
        if (session.minigame !== game || game.claimed || session.expired) return
        game.claimed = true; game.choice = 0; session.revision++
        cancel(session)
        return enqueue(session, () => resolveGame(session, 0))
      }, choiceWindowMs)
      game.endTimer?.unref?.()
    }
    if (now() + gameStepMs >= game.deadline) return
    session.timer = setTimer(() => {
      session.timer = null
      return enqueue(session, async () => {
        if (session.minigame !== game || game.claimed || session.expired || now() >= game.deadline) return
        game.frame++; game.order = order(); session.revision++
        await render(session)
        scheduleGame(session)
      })
    }, gameStepMs)
    session.timer?.unref?.()
  }
  async function execute(interaction, character, { selection = false } = {}) {
    const level = 1
    let saved
    if (selection) {
      try { saved = preferences.get(interaction.guildId, interaction.user.id) }
      catch (error) { logger.warn?.(`Arena preference read failed: ${error.message}`) }
    }
    character = preferredVariant(saved, character)
    for (const previous of sessions.values()) {
      if (previous.ownerId === interaction.user.id && previous.guildId === interaction.guildId) await expire(previous, false)
    }
    if (sessions.size >= maxSessions) {
      const oldest = [...sessions.values()].find(session => !session.initializing)
      if (!oldest) return privateReply(interaction, 'The arena is busy. Try /arena again shortly.')
      await expire(oldest, false)
    }
    const session = { id: interaction.id, ownerId: interaction.user.id, guildId: interaction.guildId,
      channelId: interaction.channelId, revision: 0, battle: null, character, initializing: true, expired: false,
      messageId: null, level, opponent: 'maxim', page: selection ? 'characters' : 'prefight', selectionFlow: selection, groupId: null, artKey: null,
      pendingSpecial: null, minigame: null, stopped: false, timer: null, reported: false,
      expiryTimer: null, expiryGeneration: 0, work: Promise.resolve(), edit: payload => interaction.editReply(payload),
      notify: payload => interaction.followUp ? interaction.followUp(payload) : Promise.resolve() }
    sessions.set(session.id, session)
    try {
      const files = artFiles(character, session.opponent, session.page)
      session.artKey = files[0].name
      const message = await interaction.reply({ ...screen(session), files, fetchReply: true })
      session.messageId = message.id; session.initializing = false
      leases?.add({ guildId: session.guildId, channelId: session.channelId, messageId: message.id })
      if (session.expired) {
        await render(session); leases?.remove(session.messageId)
        return
      }
      armExpiry(session)
    } catch (error) {
      sessions.delete(session.id)
      if (session.messageId) await interaction.editReply({ components: [] }).catch(() => {})
      throw error
    }
  }
  async function handleButton(interaction) {
    const match = /^arena:([^:]+):(0|[1-9]\d*):(start|idle|opponent|quit|special1|special2|special3|pick|selectgroup|selectcharacter|selectskin|chooseskin|backcharacters|backskins|confirmfighter|changefighter)(?::([1-5]))?$/.exec(interaction.customId)
    const session = match && sessions.get(match[1])
    if (!session || session.expired || session.guildId !== interaction.guildId || session.channelId !== interaction.channelId || session.messageId !== interaction.message?.id) {
      return privateReply(interaction, 'This arena session has ended or the bot restarted. Use /arena for a new fight.')
    }
    if (interaction.user.id !== session.ownerId) return privateReply(interaction, 'Only the player who opened this arena can control it. Use /arena for your own fight.')
    if (session.expiresAt !== null && now() >= session.expiresAt) {
      await expire(session)
      return privateReply(interaction, 'This arena session expired. Use /arena for a new fight.')
    }
    // Start the acknowledgement before any state work or queued message edit.
    // A failed acknowledgement must not strand an already-paid Finisher.
    const acknowledgement = interaction.deferUpdate().then(() => null, error => error)
    const current = Number(match[2]) === session.revision
    const game = session.minigame
    const quit = current && match[3] === 'quit' && !match[4] && session.battle?.status === 'playing' && !session.stopped
    const opponent = current && match[3] === 'opponent' && !match[4] && !session.battle && session.page === 'prefight'
    let navigation = false
    if (current && session.selectionFlow && !match[4] && (!session.battle || session.battle.status !== 'playing')) {
      const action = match[3], family = familyFor(session.character), value = interaction.values?.length === 1 ? interaction.values[0] : null
      const isSelect = interaction.isStringSelectMenu?.() === true
      if (action === 'selectgroup' && isSelect && session.page === 'characters') {
        const group = groupsFor().find(entry => entry.id === value)
        if (group && groupsFor().length > 1) { session.groupId = group.id; session.character = variantsFor(group.entries[0])[0]; navigation = true }
      } else if (action === 'selectcharacter' && isSelect && session.page === 'characters') {
        const group = groupsFor().find(entry => entry.id === session.groupId) || groupsFor().find(entry => entry.entries.some(item => item.id === family.id))
        const entry = group.entries.find(item => item.id === value)
        if (entry) { session.character = entry.id === family.id ? session.character : variantsFor(entry)[0]; navigation = true }
      } else if (action === 'selectskin' && isSelect && session.page === 'skins') {
        const variant = variantsFor(family).find(entry => entry.id === value)
        if (variant) { session.character = variant; navigation = true }
      } else if (action === 'chooseskin' && session.page === 'characters') { session.page = 'skins'; navigation = true }
      else if (action === 'backcharacters' && session.page === 'skins') { session.page = 'characters'; navigation = true }
      else if (action === 'backskins' && session.page === 'prefight' && !session.battle) { session.page = 'skins'; navigation = true }
      else if (action === 'confirmfighter' && session.page === 'skins' && variantsFor(family).some(entry => entry.id === session.character.id)) {
        session.page = 'prefight'; navigation = true
        try { preferences.set(session.guildId, session.ownerId, { familyId: family.id, variantId: session.character.id }) }
        catch (error) { logger.warn?.(`Arena preference save failed: ${error.message}`) }
      } else if (action === 'changefighter' && session.battle && session.battle.status !== 'playing') {
        session.battle = null; session.page = 'characters'; navigation = true
      }
      if (navigation) { session.revision++; armExpiry(session) }
    }
    const lateGame = session.minigame && session.minigame.deadline !== null && now() >= session.minigame.deadline && !session.minigame.claimed
    if (lateGame) { cancel(session); session.minigame.claimed = true; session.minigame.choice = 0; session.revision++ }
    const start = current && session.page === 'prefight' && !match[4] && ['start', 'idle'].includes(match[3]) && (!session.battle || session.battle.status !== 'playing' || session.stopped)
    const special = current && !match[4] && ['special1', 'special2', 'special3'].includes(match[3]) && !session.stopped && !session.minigame &&
      session.battle?.status === 'playing' && session.battle.mode !== 'idle' && session.pendingSpecial !== match[3] && canUse(session.battle.marq, match[3])
    // Shuffling moves numbered buttons but does not invalidate that game's
    // controls. A new game receives a fresh revision, so old fights stay stale.
    const pick = !lateGame && game && Number(match[2]) === game.revision && match[3] === 'pick' && match[4] && !game.claimed
    let gameStarted = false
    if (quit) {
      cancel(session); session.minigame = null; session.pendingSpecial = null
      session.battle = { ...session.battle, status: 'quit', marq: { ...session.battle.marq, slayerCharges: 0,
        criticalReady: false, opportunityReady: false } }; session.revision++
      armExpiry(session)
    } else if (opponent) {
      session.opponent = session.opponent === 'maxim' ? 'marq' : 'maxim'; session.revision++; armExpiry(session)
    } else if (start) {
      cancel(session)
      session.battle = newBattle(0, { mode: match[3] === 'idle' ? 'idle' : 'active', character: session.character, level: session.level, opponent: session.opponent })
      session.pendingSpecial = null; session.minigame = null; session.stopped = false; session.reported = false; session.revision++
      armExpiry(session)
    } else if (special) {
      if (match[3] === 'special3') {
        const values = order()
        cancel(session); session.pendingSpecial = null
        session.battle = beginFinisher(session.battle)
        session.minigame = { revision: session.revision + 1, order: values, frame: 0, claimed: false, choice: 0, deadline: null, endTimer: null }
        gameStarted = true
      } else session.pendingSpecial = match[3]
      session.revision++; armExpiry(session)
    } else if (pick) {
      cancel(session); session.minigame.claimed = true; session.minigame.choice = Number(match[4]); session.revision++; armExpiry(session)
    }
    return enqueue(session, async () => {
      const error = await acknowledgement
      if (error) logger.warn?.(`Arena acknowledgement failed: ${error.message}`)
      if (lateGame && session.minigame === game && !session.expired) return resolveGame(session, 0)
      if (pick && session.minigame === game && !session.expired) return resolveGame(session, Number(match[4]))
      if (!quit && !opponent && !start && !special && !navigation) return
      await render(session)
      if (gameStarted || session.minigame) scheduleGame(session)
      else schedule(session)
    })
  }
  function dispose() {
    const pending = [...sessions.values()].map(session => expire(session, false))
    sessions.clear()
    return Promise.allSettled(pending)
  }
  return { execute, handleButton, dispose }
}
const leases = process.env.NODE_ENV === 'development' ? require('./message-leases').createLeaseStore() : null
module.exports = { createArena, arena: createArena({ leases, preferences: process.env.NODE_ENV === 'development' ? createPreferenceStore() : createMemoryPreferences(), onComplete: process.env.NODE_ENV === 'development' ? saveCombatReport : () => {} }) }
