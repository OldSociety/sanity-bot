const { screen, actionLines, fallbackStatus } = require('./interface')
const { framedArtFiles } = require('./art')
const { cardName, cardData } = require('./health-card')
const { imageVersion } = require('./portrait')

// Only presentation data crosses asynchronous boundaries; never a live session.
function snapshot(session, unlock) {
  return {
    ...session,
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
  if (state.battle?.status === 'playing')
    state.assetVersion = await imageVersion(
      cardData(state).fighters.map((fighter) => fighter.image)
    )
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
      if (state.legendRetryAt > now()) throw Error('Legend retry cooling down')
      files.push(await renderLegend(state.battle))
      state.legendRetryAt = 0
    } catch (error) {
      view.embeds = [view.embeds[0]]
      if (!(state.legendRetryAt > now())) {
        logger.warn?.(`Arena legend render unavailable: ${error.message}`)
        state.legendRetryAt = now() + 5000
      }
    }
  } else if (view.embeds[0].data.image || view.embeds[0].data.thumbnail) {
    files = await framedArtFiles(
      state.character,
      state.opponent,
      state.page,
      logger
    )
  }
  if (['victory', 'defeat', 'quit'].includes(state.battle?.status))
    files.push({
      attachment: Buffer.from(
        actionLines(state.battle.history).join('\n') || 'No actions recorded.'
      ),
      name: `arena-recap-${state.id}-${state.revision}.txt`,
    })
  return {
    view,
    files,
    card: state.card,
    cardRetryAt: state.cardRetryAt,
    legendRetryAt: state.legendRetryAt,
  }
}
module.exports = { snapshot, buildPresentation }
