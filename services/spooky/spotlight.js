const { config: defaultEvent, pieces } = require('./config')
const { latestReminderSlot, validateReminders, createReminders } = require('./reminders')
const defaults = require('../../config/spooky-spotlight.json')
const catalog = require('../../config/badges.json').badges

function validateSpotlight(settings) {
  validateReminders({ ...settings, timezone: 'America/Los_Angeles', channelId: '100000000000000001', roleIds: ['200000000000000001'] })
  if (settings.everyDays !== 4 || settings.localTime !== '12:00' || !settings.anchorDate || settings.weightPercent !== 25 ||
    !Array.isArray(settings.characters) || !settings.characters.length || new Set(settings.characters).size !== settings.characters.length ||
    settings.characters.some(id => !pieces.some(piece => piece.characterId === id) || !catalog.find(badge => badge.characterId === id)?.imageAsset)) throw new Error('Invalid spotlight rotation or missing character artwork')
  return { ...settings, characters: [...settings.characters] }
}

// This companion receipt shares the caller's transaction and writer queue.
// Appending artwork never changes a selection already frozen for this guild.
async function ensureSpotlight(ctx, models, event = defaultEvent, settings = defaults) {
  const approved = validateSpotlight(settings)
  if (!event.enabled || ctx.scope.eventId !== event.eventId) return null
  const slot = latestReminderSlot(ctx.now, approved, event)
  if (!slot) return null
  const operationId = `worker:${ctx.scope.eventId}:${ctx.scope.guildId}:spotlight-plan:${slot}`
  const existing = await models.Operation.findByPk(operationId, { transaction: ctx.transaction })
  const valid = row => row.eventId === ctx.scope.eventId && row.guildId === ctx.scope.guildId && row.actorId === 'system' && row.operationType === 'spotlight_plan' && row.completedAt &&
    row.receipt?.slot && Array.isArray(row.receipt.order) && row.receipt.order.includes(row.receipt.characterId) && catalog.some(badge => badge.characterId === row.receipt.characterId && badge.imageAsset === row.receipt.imageAsset)
  if (existing) {
    if (!valid(existing) || existing.receipt.slot !== slot) throw new Error('Invalid saved spotlight')
    return existing.receipt
  }
  const history = await models.Operation.findAll({ where: { ...ctx.scope, operationType: 'spotlight_plan' }, transaction: ctx.transaction })
  if (history.some(row => !valid(row))) throw new Error('Invalid spotlight history')
  const previous = history.filter(row => row.receipt.slot < slot).sort((a, b) => b.receipt.slot.localeCompare(a.receipt.slot))[0]?.receipt
  if (previous && previous.order.some((id, index) => approved.characters[index] !== id)) throw new Error('Spotlight characters must be appended in artwork completion order')
  const days = (Date.parse(`${slot}T00:00:00Z`) - Date.parse(`${previous?.slot || approved.anchorDate}T00:00:00Z`)) / 86400000
  const index = (previous ? approved.characters.indexOf(previous.characterId) : 0) + days / approved.everyDays
  const characterId = approved.characters[index % approved.characters.length]
  const badge = catalog.find(item => item.characterId === characterId)
  if (!badge) throw new Error('Invalid spotlight slot progression')
  const receipt = { ...ctx.scope, slot, characterId, name: badge.name, imageAsset: badge.imageAsset,
    order: approved.characters, frozenAt: ctx.now.toISOString(), sourceOperationId: ctx.operationId }
  await models.Operation.create({ operationId, interactionId: null, ...ctx.scope, actorId: 'system', operationType: 'spotlight_plan',
    receipt, createdAt: ctx.now, completedAt: ctx.now }, { transaction: ctx.transaction })
  await ctx.record({ userId: 'system', resource: 'spotlight_selection', delta: 0, metadata: { slot, characterId, planOperationId: operationId } })
  return receipt
}

function pieceWeights(candidates, percent, characterId) {
  // Preserve the existing rarity-based baseline, then apply a relative 25%
  // multiplier to each missing featured quarter before normalizing the draw.
  return candidates.map(piece => ({ piece, weight: percent[piece.rarity] /
    candidates.filter(item => item.rarity === piece.rarity).length * (piece.characterId === characterId ? 1.25 : 1) }))
}

function spotlightPayload(settings, receipt) {
  const base = { content: settings.roleIds.map(id => `<@&${id}>`).join(' '),
    allowedMentions: { parse: [], roles: [...settings.roleIds], users: [], repliedUser: false },
    embeds: [{ title: 'Community Spotlight', color: 0x497F91 }] }
  if (!receipt) return base
  base.embeds[0].description = `**${receipt.name}** steps out of the shadows!\n\nFor the next four days, you’re more likely to find ${receipt.name}’s missing quarters. Collect all four to unlock ${receipt.name}’s badge.\n\nUse **/spooky collection** to see your progress.`
  base.embeds[0].thumbnail = { url: `attachment://${receipt.imageAsset}` }
  base.files = [{ name: receipt.imageAsset, badgeAsset: receipt.imageAsset }]
  return base
}

function createSpotlight({ models, event = defaultEvent, settings = defaults, channelId, roleId, ...adapters }) {
  const approved = validateSpotlight(settings)
  // The signature excludes the expandable order; the current receipt keeps
  // its original art/character even when the next design is added.
  const { characters, ...cadence } = approved
  return createReminders({ ...adapters, models, event, namespace: 'spotlight', operationType: 'community_spotlight',
    settings: { ...cadence, timezone: 'America/Los_Angeles', channelId, roleIds: [roleId] },
    payload: spotlightPayload, buildReceipt: async ctx => {
      const plan = await ensureSpotlight(ctx, models, event, approved)
      if (!plan) throw new Error('Spotlight is not due')
      return plan
    } })
}

module.exports = { validateSpotlight, ensureSpotlight, pieceWeights, spotlightPayload, createSpotlight }
