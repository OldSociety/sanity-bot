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
  if (!config.eventId || !Number.isSafeInteger(config.version) || config.version < 1) throw new Error('Invalid event identity/version')
  if (typeof config.enabled !== 'boolean' || config.timezone !== 'America/Los_Angeles') throw new Error('Invalid event enabled flag or timezone')
  const start = Date.parse(config.startsAt), end = Date.parse(config.endsAt), redemptionEnd = Date.parse(config.redemptionEndsAt)
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(redemptionEnd) || start >= end || end !== redemptionEnd) {
    throw new Error('Invalid event boundaries; post-October redemption is disabled')
  }
  for (const key of ['starting', 'capacity', 'refillAmount', 'refillIntervalMs', 'actionCost']) requirePositiveInteger(config.candy[key], `candy.${key}`)
  if (config.candy.starting > config.candy.capacity || config.candy.refillAmount > config.candy.capacity) throw new Error('Candy exceeds capacity')
  if (config.candy.actionCost !== 1) throw new Error('Every action costs exactly one candy')
  if (config.eyes.dailyDrawLimit !== null || config.fate.dailyDrawLimit !== null) throw new Error('Hard daily draw limits are disabled')
  if (!config.eyes.automaticConversion || !config.duplicates.automaticConversion || config.duplicates.selection !== 'uniform-missing-piece') throw new Error('Invalid automatic conversion policy')
  for (const [value, label] of [[config.eyes.quarterCost, 'Eye quarter cost'], [config.fate.quarterCost, 'fate quarter cost'], [config.duplicates.exchangeCost, 'duplicate cost'], [config.protection.theftDurationMs, 'protection duration']]) requirePositiveInteger(value, label)
  if (config.fate.paymentResource !== 'bank') throw new Error('Fate purchases must use bank only')
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
  const expected = { tl: 'common', tr: 'common', bl: 'rare', br: 'legendary' }
  for (const position of manifest.positions) {
    if (expected[position.id] !== position.rarity || !/^#[0-9A-F]{6}$/i.test(position.color)) throw new Error('Invalid position rarity or color')
  }
  for (const character of manifest.characters) {
    if (!/^[a-z]{3}$/.test(character.id) || typeof character.name !== 'string' || !character.name) throw new Error('Invalid character identity')
  }
  return manifest.characters.flatMap(character => manifest.positions.map(position => ({
    id: `${character.id}_${position.id}`, characterId: character.id, characterName: character.name,
    position: position.id, rarity: position.rarity, color: position.color,
  })))
}
function deepFreeze(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') deepFreeze(child)
  return Object.freeze(value)
}
function selectEvent(data, environment) {
  if (data.developmentEnabled !== undefined && typeof data.developmentEnabled !== 'boolean') throw new Error('Invalid development activation flag')
  // Development activation must not enable a future production PM2 process
  // reading this same checkout. Economy rules/version stay identical.
  return validateEvent({ ...data, enabled: data.enabled || (environment === 'development' && data.developmentEnabled === true) })
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
