const { screen, actionLines, fallbackStatus } = require('./interface')
const { framedArtFiles } = require('./art')
const { cardName, cardData } = require('./health-card')
const { imageVersion } = require('./portrait')
const { recapText, reportLines } = require('./battle-report')
const { createHash } = require('node:crypto')

// Only presentation data crosses asynchronous boundaries; never a live session.
function snapshot(session, unlock) {
  const { diagnosticClient, ...presentation } = session
  return {
    ...presentation,
    busy: unlock ? false : session.busy,
    battle: session.battle ? structuredClone(session.battle) : null,
    minigame: session.minigame
      ? { ...session.minigame, order: [...session.minigame.order] }
      : null,
  }
}
async function buildPresentation(
  state,
  { renderCard, renderLegend, logger = console, now = Date.now, timing } = {}
) {
  if (state.battle?.status === 'playing') {
    const identify = () =>
      imageVersion(cardData(state).fighters.map((fighter) => fighter.image))
    state.assetVersion = timing
      ? await timing.phase('assetMs', identify)
      : await identify()
  }
  const view = screen(state)
  let files = []
  if (state.battle?.status === 'playing') {
    let card = state.card
    try {
      if (state.cardRetryAt > now()) throw Error('Image retry cooling down')
      if (card?.name !== cardName(state))
        card = await (timing
          ? timing.phase('renderMs', () => renderCard(state))
          : renderCard(state))
      files.push(card)
      state.card = card
      state.cardRetryAt = 0
    } catch (error) {
      delete view.embeds[0].data.image
      view.embeds[0].addFields(fallbackStatus(state.battle))
      if (!(state.cardRetryAt > now())) {
        logger.warn?.(`Arena card render unavailable: ${error.message}`)
        state.cardRetryAt = now() + 5000
      }
    }
    try {
      if (state.legendRetryAt > now())
        throw Error('Legend retry cooling down')
      files.push(
        await (timing
          ? timing.phase('legendMs', () => renderLegend(state.battle))
          : renderLegend(state.battle))
      )
      state.legendRetryAt = 0
    } catch (error) {
      view.embeds = [view.embeds[0]]
      if (!(state.legendRetryAt > now())) {
        logger.warn?.(`Arena legend render unavailable: ${error.message}`)
        state.legendRetryAt = now() + 5000
      }
    }
  } else if (view.embeds[0].data.image || view.embeds[0].data.thumbnail) {
    const art = () =>
      framedArtFiles(state.character, state.opponent, state.page, logger)
    files = timing ? await timing.phase('renderMs', art) : await art()
  }
  if (
    ['victory', 'defeat', 'quit'].includes(state.battle?.status) &&
    (!state.presentationV2 || state.diagnostic !== false)
  ) {
    const text = state.presentationV2
      ? recapText(
          state.battle,
          reportLines(state.battle.history, actionLines, {
            diagnostic: state.diagnostic !== false,
            timings: state.roundTimings,
          }),
          {
            diagnostic: state.diagnostic !== false,
            interactions: state.interactionTimings,
          }
        )
      : actionLines(state.battle.history).join('\n') || 'No actions recorded.'
    files.push({
      attachment: Buffer.from(text),
      name: `arena-recap-${state.id}-${state.revision}-${createHash('sha256')
        .update(text)
        .digest('hex')
        .slice(0, 12)}.txt`,
    })
  }
  return {
    view,
    files,
    card: state.card,
    cardRetryAt: state.cardRetryAt,
    legendRetryAt: state.legendRetryAt,
  }
}
module.exports = { snapshot, buildPresentation }
