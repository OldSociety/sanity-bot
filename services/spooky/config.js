const eventData = require('../../config/spooky-2026.json')
const manifestData = require('../../config/spooky-pieces.json')

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`)
}
function validateOutcomes(outcomes, label) {
  if (!Array.isArray(outcomes) || outcomes.length === 0) throw new Error(`${label} must contain outcomes`)
  const ids = new Set()
  for (const outcome of outcomes) {
    if (typeof outcome.id !== 'string' || !outcome.id || ids.has(outcome.id)) throw new Error(`${label} contains an invalid or duplicate ID`)
    ids.add(outcome.id)
    requirePositiveInteger(outcome.percent, `${label} probability`)
  }
  if (outcomes.reduce((sum, item) => sum + item.percent, 0) !== 100) throw new Error(`${label} probabilities must total 100`)
}
function validateEvent(config) {
  if (config.duplicates?.allowDuplicates !== undefined && typeof config.duplicates.allowDuplicates !== 'boolean') throw new Error('Invalid duplicate policy')
  if (config.competition && (!Array.isArray(config.competition.nonCompetitiveUserIds) ||
    config.competition.nonCompetitiveUserIds.some(id => !/^\d{17,20}$/.test(id)) ||
    new Set(config.competition.nonCompetitiveUserIds).size !== config.competition.nonCompetitiveUserIds.length)) throw new Error('Invalid competition identity policy')
  if (!config.eventId || !Number.isSafeInteger(config.version) || config.version < 1) throw new Error('Invalid event identity/version')
  if (typeof config.enabled !== 'boolean' || config.timezone !== 'America/Los_Angeles') throw new Error('Invalid event enabled flag or timezone')
  const start = Date.parse(config.startsAt), end = Date.parse(config.endsAt), redemptionEnd = Date.parse(config.redemptionEndsAt)
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(redemptionEnd) || start >= end || end !== redemptionEnd) {
    throw new Error('Invalid event boundaries; post-October redemption is disabled')
  }
  for (const key of ['starting', 'capacity', 'refillAmount', 'refillIntervalMs', 'actionCost']) requirePositiveInteger(config.candy[key], `candy.${key}`)
  if (config.candy.starting > config.candy.capacity || config.candy.refillAmount > config.candy.capacity) throw new Error('Candy exceeds capacity')
  if (config.candy.actionCost !== 1) throw new Error('Every action costs exactly one candy')
  requirePositiveInteger(config.targetChoice?.timeoutMs, 'target choice timeout')
  requirePositiveInteger(config.nickname?.reversalDurationMs, 'reversal duration')
  requirePositiveInteger(config.actionBuffer?.specialWeightPercent, 'special outcome buffer weight')
  if (config.actionBuffer.mode !== 'same-spell') throw new Error('Invalid repeat buffer mode')
  for (const key of ['holeDurationMs', 'holeBonusPercent', 'holeBonusCap']) requirePositiveInteger(config.combat?.[key], `combat.${key}`)
  if (config.combat.holeBonusPercent > 100 || config.combat.holeBonusCap > config.candy.capacity) throw new Error('Invalid hole bonus')
  if (config.actionBuffer.specialWeightPercent > 100) throw new Error('Invalid special outcome buffer weight')
  requirePositiveInteger(config.protection?.bothPercent, 'dual protection chance')
  if (config.protection.bothPercent > 100) throw new Error('Invalid dual protection chance')
  if (!Number.isSafeInteger(config.gifs?.routinePercent) || config.gifs.routinePercent < 0 || config.gifs.routinePercent > 100) throw new Error('Invalid routine GIF chance')
  for (const key of ['windowMs', 'registeredLimit', 'unregisteredLimit', 'registeredMinIntervalMs', 'chancePercent']) requirePositiveInteger(config.recipientMentions?.[key], `recipientMentions.${key}`)
  if (config.recipientMentions.chancePercent > 100 || config.recipientMentions.registeredMinIntervalMs > config.recipientMentions.windowMs) throw new Error('Invalid recipient mention cadence')
  if (config.eyes.dailyDrawLimit !== null || config.fate.dailyDrawLimit !== null) throw new Error('Hard daily draw limits are disabled')
  if (!config.eyes.automaticConversion || !config.duplicates.automaticConversion || config.duplicates.selection !== 'uniform-missing-piece') throw new Error('Invalid automatic conversion policy')
  for (const [value, label] of [[config.eyes.quarterCost, 'Eye quarter cost'], [config.fate.quarterCost, 'fate quarter cost'], [config.duplicates.exchangeCost, 'duplicate cost'], [config.protection.theftDurationMs, 'protection duration']]) requirePositiveInteger(value, label)
  if (!['bank-then-fate', 'normal-fate-only', 'sanity'].includes(config.fate.paymentResource)) throw new Error('Invalid Fate purchase policy')
  validateOutcomes(Object.entries(config.fate.rarityPercent || {}).map(([id, percent]) => ({ id, percent })), 'Fate rarity')
  if (Object.keys(config.fate.rarityPercent).sort().join(',') !== 'common,legendary,rare') throw new Error('Invalid Fate rarity categories')
  for (const [key, value] of Object.entries(config.crown || {})) requirePositiveInteger(value, `crown.${key}`)
  for (const [key, value] of Object.entries(config.prestigeBonuses || {})) requirePositiveInteger(value, `prestigeBonuses.${key}`)
  if (config.prestige) {
    if (!Number.isSafeInteger(config.prestige.version) || config.prestige.version < 1 || !['approved', 'provisional'].includes(config.prestige.status)) throw new Error('Invalid prestige version/status')
    for (const key of ['success', 'failure', 'curseReplacement', 'noEffect']) if (!Number.isSafeInteger(config.prestige[key])) throw new Error('Invalid prestige weight')
    if (config.prestige.adminEligible !== true || config.prestige.ties !== 'shared' || config.prestige.allowBothTitles !== true) throw new Error('Invalid prestige winner policy')
  }
  validateOutcomes(config.treatOutcomes, 'Treat')
  validateOutcomes(config.trickOutcomes, 'Trick')
  validateOutcomes(Object.entries(config.ordinaryRarity.percent).map(([id, percent]) => ({ id, percent })), 'Rarity')
  if (!['common', 'rare', 'legendary'].every(id => id in config.ordinaryRarity.percent) || Object.keys(config.ordinaryRarity.percent).length !== 3) throw new Error('Invalid rarity categories')
  if (!['provisional-for-simulation', 'approved'].includes(config.ordinaryRarity.status)) throw new Error('Invalid rarity approval status')
  return config
}
function createPieces(manifest) {
  if (manifest.characters.length !== 7 || manifest.positions.length !== 4) throw new Error('Expected seven characters with four positions')
  if (new Set(manifest.characters.map(c => c.id)).size !== 7 || new Set(manifest.positions.map(p => p.id)).size !== 4) throw new Error('Duplicate manifest ID')
  if (manifest.positions.map(position => position.id).join(',') !== 'tl,tr,bl,br') throw new Error('Invalid position order; expected tl,tr,bl,br')
  const ranks = { common: 0, rare: 1, legendary: 2 }
  for (const rarity of Object.keys(ranks)) if (!/^#[0-9A-F]{6}$/i.test(manifest.rarityColors?.[rarity] || '')) throw new Error('Invalid rarity color')
  for (const character of manifest.characters) {
    if (!/^[a-z]{3}$/.test(character.id) || typeof character.name !== 'string' || !character.name) throw new Error('Invalid character identity')
    if (!Array.isArray(character.rarities) || character.rarities.length !== 4 || character.rarities[0] !== 'common'
      || character.rarities.some((rarity, index) => !Object.hasOwn(ranks, rarity) || (index > 0 && ranks[rarity] < ranks[character.rarities[index - 1]]))) throw new Error('Invalid character rarity order')
  }
  // IDs/position order remain permanent; rarity now belongs to each character.
  // Historical acquisition receipts retain their saved original rarity/color.
  return manifest.characters.flatMap(character => manifest.positions.map((position, index) => ({
    id: `${character.id}_${position.id}`, characterId: character.id, characterName: character.name,
    position: position.id, rarity: character.rarities[index], color: manifest.rarityColors[character.rarities[index]],
  })))
}
function deepFreeze(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') deepFreeze(child)
  return Object.freeze(value)
}
function selectEvent(data, environment) {
  if (data.developmentEnabled !== undefined && typeof data.developmentEnabled !== 'boolean') throw new Error('Invalid development activation flag')
  if (data.productionEnabled !== undefined && typeof data.productionEnabled !== 'boolean') throw new Error('Invalid production activation flag')
  // Development activation must not enable a future production PM2 process
  // reading this same checkout. The community launch policy is also selected
  // independently for each environment; untouched runtimes keep their policy.
  const communal = require('../community-leveling/config').selectConfig(environment)
  const sanity = require('../sanity').selected(environment)
  return validateEvent({ ...data, fate: sanity.spendingEnabled ? { ...data.fate, paymentResource: 'sanity' } : communal.enabled ? { ...data.fate, paymentResource: 'normal-fate-only' } : data.fate,
    enabled: data.enabled || (environment === 'development' && data.developmentEnabled === true) ||
    (environment === 'production' && data.productionEnabled === true) })
}
const config = deepFreeze(selectEvent(eventData, process.env.NODE_ENV))
const pieces = deepFreeze(createPieces(manifestData))

function getEventState(now, event = config) {
  const timestamp = now instanceof Date ? now.getTime() : now
  if (!Number.isFinite(timestamp)) throw new Error('A valid event timestamp is required')
  if (timestamp < Date.parse(event.startsAt)) return 'UPCOMING'
  if (timestamp < Date.parse(event.endsAt)) return 'ACTIVE'
  if (timestamp < Date.parse(event.redemptionEndsAt)) return 'REDEMPTION'
  return 'CLOSED'
}
// Production acquisition must not accidentally use unapproved simulation odds.
function requireApprovedRarity(event = config) {
  if (event.ordinaryRarity.status !== 'approved') throw new Error('Ordinary rarity weights are provisional; approval is required before acquisition')
}

module.exports = { config, pieces, validateEvent, createPieces, getEventState, requireApprovedRarity, selectEvent }
