const { pieces } = require('./config')
const { tokenImage } = require('./token-art')
const noMentions = { parse: [], users: [], roles: [], repliedUser: false }
function safeName(value) { return String(value || 'a player').replace(/[@<>`*\r\n]/g, '').slice(0, 80) }
function targetIds(result, actorId) {
  return [...new Set([
    ...(result.victims || []).map(target => target.userId), ...(result.gifts || []).map(target => target.userId),
    ...(result.shielded || []), result.cursedUserId, result.freedUserId, result.reversedUserId, result.awardedUserId,
  ].filter(id => id && id !== actorId))]
}
function actionMessages(receipt, { actorId, members, registeredIds }) {
  const result = receipt.result || receipt
  const ids = targetIds(result, actorId), allowed = ids.filter(id => registeredIds.has(id))
  const label = id => registeredIds.has(id) ? `<@${id}>` : safeName(members.find(member => member.userId === id)?.displayName)
  const details = []
  if (result.stolen) details.push(`**Stolen:** ${result.stolen} ${receipt.outcome === 'steal_or_find_eye' ? 'Evil Eye' : 'candy'}.`)
  if (result.found) details.push('Found **1 Evil Eye**.')
  if (result.deliveredCandy !== undefined) details.push(`**Candy gifted:** ${result.deliveredCandy}.`)
  if (result.shielded) details.push('**Theft protection:** one hour.')
  if (result.cursedUserId || result.freedUserId || result.reversedUserId || result.awardedUserId) details.push('Role/nickname update queued for delivery.')
  if (result.fateBonus) details.push(`**Banked fate bonus:** +${result.fateBonus}.`)
  if (result.candyReward) details.push(`**Candy reward:** +${result.candyReward}.`)
  if (receipt.candy !== undefined) details.push(`**Your candy:** ${receipt.candy}/80.`)
  if (receipt.bank !== undefined) details.push(`**Your bank:** ${receipt.bank}.`)
  const text = [...(result.noEffect ? [`Effect unavailable: ${safeName(result.noEffect.replace(/_/g, ' '))}.`] : []), ...details].join('\n') || 'Your result was recorded.'
  const messages = [{ public: ids.length > 0, payload: {
    ...(allowed.length ? { content: allowed.map(id => `<@${id}>`).join(' ') } : {}),
    allowedMentions: { ...noMentions, users: allowed },
    embeds: [{ title: `${safeName(members.find(member => member.userId === actorId)?.displayName)} — ${safeName((receipt.outcome || 'Quarter draw').replace(/_/g, ' '))}`,
      description: `${ids.length ? `**Targets:** ${ids.map(label).join(', ')}\n` : ''}${text}`, color: result.noEffect ? 0xe67e22 : 0x9b59b6 }],
  } }]
  // Public reveals use committed ownership snapshots, never current inventory.
  for (const award of result.awards || []) {
    // Old saved receipts predate ownership snapshots; show their acquired piece
    // rather than querying current inventory and changing a historical reveal.
    const image = tokenImage(award.characterId, award.ownedPositions || [award.position])
    messages.push({ public: true, payload: { allowedMentions: noMentions,
    ...(image ? { files: [{ tokenAsset: image, name: image }] } : {}),
    embeds: [{ title: '**🧩 QUARTER COLLECTED!**', color: parseInt(award.color.slice(1), 16),
      ...(image ? { image: { url: `attachment://${image}` } } : {}),
      description: `**${safeName(members.find(member => member.userId === actorId)?.displayName)} collected ${safeName(award.characterName)} — ${award.position.toUpperCase()}!**\n**${award.rarity.toUpperCase()}**${award.duplicate ? ' • Duplicate' : ''}\n**Character collection: ${(award.ownedPositions || [award.position]).length}/4**${award.source === 'duplicate_exchange' ? '\nFive extras exchanged for a missing piece.' : ''}` }] } })
  }
  for (const characterId of result.newlyCompletedCharacters || []) {
    const name = pieces.find(piece => piece.characterId === characterId)?.characterName || characterId
    const image = tokenImage(characterId, ['tl', 'tr', 'bl', 'br'])
    messages.push({ public: true, payload: { allowedMentions: noMentions,
      files: [{ tokenAsset: image, name: image }], embeds: [{ title: '**🎉 CHARACTER COMPLETE!**', color: 0xffd700,
      image: { url: `attachment://${image}` },
      description: `**${safeName(members.find(member => member.userId === actorId)?.displayName)} collected all four ${safeName(name)} quarters!**\n${(result.newlyAwardedBadges || []).includes(`spooky-2026:${characterId}`) ? '**Permanent badge unlocked!** Use /badges view.' : (result.alreadyOwnedBadges || []).includes(`spooky-2026:${characterId}`) ? '**Permanent badge already unlocked.** Use /badges view.' : 'Permanent badge ownership is unavailable in this saved result.'}` }] } })
  }
  return messages
}
function privateScreen(title, description, fields = []) {
  return { allowedMentions: noMentions, embeds: [{ title, description, fields, color: 0x9b59b6 }] }
}
function helpScreen() {
  return privateScreen('🎃 Spooky — Welcome & Help', [
    '**Play:** `/spooky register`, `/spooky trick`, `/spooky treat`.',
    '**View:** `/spooky status`, `/spooky collection`, `/spooky help`.',
    '**Extra quarter:** `/spooky fate` spends **10 banked fate**; no daily limit.',
    'Start with **10 candy**. Gain **10 every three hours**, capacity **80**. Every action costs **1 candy**.',
    'Five Evil Eyes automatically award a quarter. Five extra copies automatically become a missing piece. First copies stay safe.',
    'Tricks randomly steal candy/Eyes or cause curses and reversed nicknames. Treats gift candy, grant protection and break curses.',
    'One-hour protection covers giver and recipient. Effects involving another player are public; registered targets are tagged.',
    'Quarter reveals are public. Personal screens are private. Play throughout October in Pacific time; no post-October redemption.',
    'Complete a character to earn a permanent badge. Use `/badges view` or `/badges leaderboard` year-round. Treat and trick competitions are separate; scoring details stay hidden.',
  ].join('\n'))
}

module.exports = { actionMessages, targetIds, privateScreen, helpScreen }
