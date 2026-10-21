const { characters, isSelectable } = require('./characters')

const starterIds = Object.freeze(['classic:hen', 'classic:azu', 'classic:kyl'])
function accessSnapshot({ badgeIds = [], diagnostic = false, level = 1 } = {}) {
  if (!Array.isArray(badgeIds) || typeof diagnostic !== 'boolean' || !Number.isInteger(level) || level < 1 || level > 60)
    throw Error('Invalid Arena player access snapshot')
  const available = characters.filter(isSelectable)
  const badgeSet = new Set(badgeIds)
  const unlockedVariantIds = available.filter(character => starterIds.includes(character.id) || badgeSet.has(character.id)).map(character => character.id)
  return {
    level,
    unlockedVariantIds,
    allowedVariantIds: diagnostic ? available.map(character => character.id) : unlockedVariantIds,
    diagnosticRoster: diagnostic === true,
  }
}
function createPlayerAccess({ ownedBadges, playerLevel, diagnostics, logger = console }) {
  return async interaction => {
    let badgeIds = [], diagnostic = false, ownershipUnavailable = false
    try { diagnostic = (await diagnostics(interaction)) === true }
    catch { logger.warn?.('Arena diagnostic roster setting unavailable; applying ownership lock') }
    try { badgeIds = await ownedBadges(interaction.guildId, interaction.user.id) }
    catch {
      ownershipUnavailable = true
      logger.warn?.('Arena badge ownership unavailable; ownership-based roster limited to starter fighters')
    }
    const progress = await playerLevel(interaction.guildId, interaction.user.id)
    const level = typeof progress === 'number' ? progress : progress.level
    return { ...accessSnapshot({ badgeIds, diagnostic, level }), ownershipUnavailable, progress: typeof progress === 'object' ? progress : null }
  }
}
let runtime
async function playerAccess(interaction) {
  if (!runtime) {
    const badges = require('../badges').createBadges({ sequelize: require('../../config/database/sequelize') })
    runtime = createPlayerAccess({
      ownedBadges: (guildId, userId) => badges.owned(guildId, userId),
      playerLevel: (guildId, userId) => require('./player-progression').playerProgression.get(guildId, userId),
      diagnostics: () => process.env.NODE_ENV === 'development' && require('./diagnostics').diagnosticSettings.get(),
    })
  }
  return runtime(interaction)
}
module.exports = { starterIds, accessSnapshot, createPlayerAccess, playerAccess }
