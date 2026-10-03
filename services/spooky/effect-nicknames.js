const { Op } = require('sequelize')
const { transformMessage } = require('./cursed-messages')
function truncate(value, limit) {
  let result = ''
  for (const character of value) {
    if (result.length + character.length > limit) break
    result += character
  }
  return result
}
function project(original, displayName, types) {
  const base = original || displayName
  let name = base
  // Effects can coexist mechanically, but their appearance never stacks.
  // Always project from the saved baseline: curse > protection > reversal.
  if (types.includes('curse')) return `☠ ${truncate(base, 28)} ☠`
  if (types.includes('theft_protection')) return `✨( ${truncate(base, 24)} )✨`
  if (types.includes('reversed_nickname')) name = transformMessage(name, 'reverse')
  return truncate(name, 32)
}
function createEffectNicknames({ models, delivery }) {
  async function rows(ctx, userId) {
    const player = await models.Participant.findOne({ where: { ...ctx.scope, userId }, transaction: ctx.transaction })
    return player ? models.Effect.findAll({ where: { participantId: player.id }, transaction: ctx.transaction }) : []
  }
  function validate(metadata) {
    if (!(metadata.originalNickname === null || typeof metadata.originalNickname === 'string') || typeof metadata.appliedNickname !== 'string' ||
      metadata.appliedNickname.length > 32 || (metadata.originalNickname?.length ?? 0) > 32) throw new Error('Nickname restoration metadata is invalid')
  }
  async function apply(ctx, member, type) {
    if (member.canManageNickname !== true) return {}
    const existing = await rows(ctx, member.userId)
    const owned = existing.filter(row => Object.hasOwn(row.metadata || {}, 'originalNickname'))
    owned.forEach(row => validate(row.metadata))
    // A pending projection/restoration or manual edit must finish before a new
    // cosmetic write can claim ownership of the nickname.
    if (await models.Delivery.findOne({ where: { ...ctx.scope, userId: member.userId, kind: 'nickname',
      status: { [Op.in]: ['pending', 'conflict'] } }, transaction: ctx.transaction })) return {}
    if (owned.length && member.nickname !== owned[0].metadata.appliedNickname) return {}
    if (!(member.nickname === null || typeof member.nickname === 'string')) throw new Error('Missing nickname snapshot')
    const originalNickname = owned.length ? owned[0].metadata.originalNickname : member.nickname
    const displayName = owned[0]?.metadata.nicknameDisplayName || member.displayName || member.userId
    const nicknameSeed = owned[0]?.metadata.nicknameSeed || `${ctx.scope.eventId}:${member.userId}`
    const appliedNickname = project(originalNickname, displayName, [...owned.map(row => row.effectType), type], nicknameSeed)
    for (const row of owned) await row.update({ metadata: { ...row.metadata, appliedNickname } }, { transaction: ctx.transaction })
    await delivery.enqueue(ctx, member.userId, 'nickname', { nickname: appliedNickname, expectedNickname: member.nickname })
    return { originalNickname, appliedNickname, nicknameDisplayName: displayName, nicknameSeed }
  }
  async function remove(ctx, userId, type) {
    const existing = await rows(ctx, userId), removed = existing.find(row => row.effectType === type)
    if (removed?.effectType === 'reversed_nickname' && !Object.hasOwn(removed.metadata || {}, 'originalNickname')) throw new Error('Nickname restoration metadata is invalid')
    if (!removed || !Object.hasOwn(removed.metadata || {}, 'originalNickname')) return
    validate(removed.metadata)
    const survivors = existing.filter(row => row.effectType !== type && Object.hasOwn(row.metadata || {}, 'originalNickname'))
    survivors.forEach(row => validate(row.metadata))
    const metadata = removed.metadata
    const desired = survivors.length ? project(metadata.originalNickname, metadata.nicknameDisplayName || metadata.originalNickname || userId,
      survivors.map(row => row.effectType), metadata.nicknameSeed || `${ctx.scope.eventId}:${userId}`) : metadata.originalNickname
    for (const row of survivors) await row.update({ metadata: { ...row.metadata, appliedNickname: desired } }, { transaction: ctx.transaction })
    // If an earlier projection never reached Discord, restore from its expected
    // base too. Otherwise normal delivery's compare-and-set protects manual edits.
    const prior = await models.Delivery.findOne({ where: { ...ctx.scope, userId, kind: 'nickname' }, transaction: ctx.transaction })
    await delivery.enqueue(ctx, userId, 'nickname', { nickname: desired, expectedNickname: metadata.appliedNickname,
      ...(prior?.status === 'pending' ? { alternateExpectedNickname: Object.hasOwn(prior.payload, 'alternateExpectedNickname') ? prior.payload.alternateExpectedNickname : prior.payload.expectedNickname } : {}) })
  }
  async function refresh(ctx, userId) {
    const owned = (await rows(ctx, userId)).filter(row => new Date(row.expiresAt) > ctx.now &&
      Object.hasOwn(row.metadata || {}, 'originalNickname'))
    if (!owned.length) return
    owned.forEach(row => validate(row.metadata))
    const metadata = owned[0].metadata
    if (!owned.some(row => ['curse', 'theft_protection'].includes(row.effectType))) return
    // Historical null baselines may lack a display-name snapshot. Never invent
    // a replacement from a numeric user ID; final restoration can still clear it.
    if (metadata.originalNickname === null && typeof metadata.nicknameDisplayName !== 'string') return
    if (owned.some(row => row.metadata.originalNickname !== metadata.originalNickname || row.metadata.appliedNickname !== metadata.appliedNickname)) {
      throw new Error('Inconsistent nickname ownership requires inspection')
    }
    if (await models.Delivery.findOne({ where: { ...ctx.scope, userId, kind: 'nickname',
      status: { [Op.in]: ['pending', 'conflict'] } }, transaction: ctx.transaction })) return
    const desired = project(metadata.originalNickname, metadata.nicknameDisplayName || metadata.originalNickname || userId,
      owned.map(row => row.effectType))
    if (desired === metadata.appliedNickname) return
    // Refresh old visual styles without taking a new baseline. Delivery's fresh
    // compare-and-set protects manual edits; failed writes retain their intent.
    for (const row of owned) await row.update({ metadata: { ...row.metadata, appliedNickname: desired } }, { transaction: ctx.transaction })
    await delivery.enqueue(ctx, userId, 'nickname', { nickname: desired, expectedNickname: metadata.appliedNickname })
  }
  return { apply, remove, refresh }
}
module.exports = { createEffectNicknames, project }
