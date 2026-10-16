const { newBattle, advance } = require('./combat')
const { screen, artFiles } = require('./interface')
const { defaultCharacter } = require('./characters')
const { statsForLevel, abilityAvailable, abilities, activeTickMs, idleTickMs: defaultIdleTickMs } = require('./rules')

function createArena({ roll, rollDuality, rollFearSpend, rollAccuracy, rollCritical, logger = console, maxSessions = 1000, tickMs = activeTickMs, idleTickMs = defaultIdleTickMs,
  setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const sessions = new Map()
  const privateReply = (interaction, content) => interaction.reply({ content, ephemeral: true, allowedMentions: { parse: [] } }).catch(() => {})
  function cancel(session) {
    if (session.timer !== null) clearTimer(session.timer)
    session.timer = null
  }
  // One write queue per message prevents timer/button updates overtaking each other.
  function enqueue(session, work) {
    session.work = session.work.then(work).catch(async error => {
      logger.error('Arena update failed:', error.message)
      session.stopped = true
      session.pendingSpecial = null
      cancel(session)
      await session.edit(screen(session)).catch(() => {})
    })
    return session.work
  }
  function schedule(session) {
    if (session.stopped || session.battle?.status !== 'playing' || session.timer !== null) return
    session.timer = setTimer(() => {
      session.timer = null
      return enqueue(session, async () => {
        if (session.stopped || session.battle?.status !== 'playing') return
        const action = session.pendingSpecial ? { [session.pendingSpecial]: true } : {}
        session.battle = advance(session.battle, action, roll, rollDuality, rollFearSpend, rollAccuracy, rollCritical)
        if (session.pendingSpecial) session.revision++
        session.pendingSpecial = null
        await session.edit(screen(session))
        schedule(session)
      })
    }, session.battle.mode === 'idle' ? idleTickMs : tickMs)
    session.timer?.unref?.()
  }
  async function execute(interaction, character = defaultCharacter, { level = 1 } = {}) {
    statsForLevel(level) // Validate before allocating a session or sending a message.
    if (sessions.size >= maxSessions) {
      const oldest = [...sessions.values()].find(session => !session.initializing)
      if (!oldest) return privateReply(interaction, 'The arena is busy. Try /arena again shortly.')
      oldest.stopped = true
      cancel(oldest)
      sessions.delete(oldest.id)
    }
    const session = { id: interaction.id, ownerId: interaction.user.id, guildId: interaction.guildId,
      channelId: interaction.channelId, revision: 0, battle: null, character, initializing: true,
      messageId: null, level, pendingSpecial: null, stopped: false, timer: null, work: Promise.resolve(),
      edit: payload => interaction.editReply(payload) }
    sessions.set(session.id, session)
    try {
      const message = await interaction.reply({ ...screen(session), files: artFiles(character), fetchReply: true })
      session.messageId = message.id
      session.initializing = false
    } catch (error) {
      sessions.delete(session.id)
      throw error
    }
  }
  async function handleButton(interaction) {
    const match = /^arena:([^:]+):(0|[1-9]\d*):(start|idle|combo|hope|third)$/.exec(interaction.customId)
    const session = match && sessions.get(match[1])
    if (!session || session.guildId !== interaction.guildId || session.channelId !== interaction.channelId || session.messageId !== interaction.message?.id) {
      return privateReply(interaction, 'This arena session has ended or the bot restarted. Use /arena for a new fight.')
    }
    if (interaction.user.id !== session.ownerId) return privateReply(interaction, 'Only the player who opened this arena can control it. Use /arena for your own fight.')
    // Reserve before acknowledging. Basic ticks keep the revision unchanged, so
    // automatic updates do not invalidate a legitimate in-flight combo click.
    const current = Number(match[2]) === session.revision
    const start = current && ['start', 'idle'].includes(match[3]) && (!session.battle || session.battle.status !== 'playing' || session.stopped)
    const combo = current && match[3] === 'combo' && !session.stopped && session.battle?.status === 'playing' &&
      session.battle.mode !== 'idle' && session.pendingSpecial !== 'combo' && abilityAvailable(session.battle.marq, 'combo') && session.battle.marq.stress > 0
    const hope = current && match[3] === 'hope' && !session.stopped && session.battle?.status === 'playing' &&
      session.battle.mode !== 'idle' && session.pendingSpecial !== 'hope' && abilityAvailable(session.battle.marq, 'hope') && session.battle.marq.hope >= abilities.hope.hopeCost
    const third = current && match[3] === 'third' && !session.stopped && session.battle?.status === 'playing' &&
      session.battle.mode !== 'idle' && session.pendingSpecial !== 'third' && abilityAvailable(session.battle.marq, 'third') && session.battle.marq.hope >= abilities.third.hopeCost
    if (start) {
      cancel(session)
      session.battle = newBattle(0, { mode: match[3] === 'idle' ? 'idle' : 'active', character: session.character, level: session.level })
      session.pendingSpecial = null
      session.stopped = false
      session.revision++
    } else if (combo) {
      session.pendingSpecial = 'combo'
      session.revision++
    } else if (hope) {
      session.pendingSpecial = 'hope'
      session.revision++
    } else if (third) {
      session.pendingSpecial = 'third'
      session.revision++
    }
    // Attach a rejection handler immediately; acknowledgement may fail while a
    // previous edit is still in flight. The queued task handles the failure.
    const acknowledgement = interaction.deferUpdate().then(() => null, error => error)
    return enqueue(session, async () => {
      const error = await acknowledgement
      if (error) throw error
      await session.edit(screen(session))
      schedule(session)
    })
  }
  function dispose() {
    for (const session of sessions.values()) { session.stopped = true; cancel(session) }
    sessions.clear()
  }
  return { execute, handleButton, dispose }
}

module.exports = { createArena, arena: createArena() }
