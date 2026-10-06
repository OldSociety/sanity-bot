const { actionMessages } = require('./presentation')
const { config } = require('./config')
function wordingPages() {
  const pages = [], samples = {
    lost_candy: {}, sweet_tooth: { awardedUserId: 'actor', crownWon: true, fateBonus: 5, candyReward: 5, bankBefore: 71, bank: 76, fatePoints: 100 },
    double_gift: { gifts: [{ userId: 'recipient' }], deliveredCandy: 2 },
    temporary_immunity: { shielded: ['actor', 'recipient'] }, break_curse: { freedUserId: 'recipient' },
    standard_gift: { gifts: [{ userId: 'recipient' }], deliveredCandy: 1 }, find_eye: {},
    eye_candy: { eyeRecipientId: 'recipient', giftedEyes: 1, candyReward: 6 },
    steal_candy: { stolen: 1, victims: [{ userId: 'recipient' }] },
    great_heist: { stolen: 3, victims: [{ userId: 'recipient' }, { userId: 'other' }] },
    reverse_nickname: { reversedUserId: 'recipient' }, curse_target: { cursedUserId: 'recipient' },
    curse_backfire: { cursedUserId: 'actor' }, caught_stealing: {},
    steal_or_find_eye: { stolen: 1, victims: [{ userId: 'recipient' }] },
    steal_crown: { awardedUserId: 'actor', crownWon: true, crownStolenFrom: 'recipient', crownFirstWin: true,
      fateBonus: 5, candyReward: 5, bankBefore: 71, bank: 76, fatePoints: 100 },
    candy_raid: { stolen: 8, victims: [{ userId: 'recipient' }], candyMovements: [{ fromUserId: 'recipient', toUserId: 'actor', candy: 8 }] },
    bag_swap: { swapTargetUserId: 'recipient', swapped: true, redistributed: 5 },
    bag_explosion: { explosionTargetUserId: 'recipient', scattered: 2, candyMovements: [{ fromUserId: 'recipient', toUserId: 'other', candy: 2 }] },
    sticky_fingers: { stolen: 4, victims: [{ userId: 'recipient' }, { userId: 'other' }] },
    reverse_robbery: { lost: 3, robberyTargetUserId: 'recipient', failure: 'reverse_robbery' },
    candy_ransom: { stolen: 3, ransomTaken: 5, ransomReturned: 2, victims: [{ userId: 'recipient' }] },
    boo: { explosionTargetUserId: 'recipient', scattered: 3 },
    candy_shakedown: { stolen: 6, victims: [{ userId: 'recipient' }] },
    trick_chain: { stolen: 4, victims: [{ userId: 'recipient' }, { userId: 'other' }] },
    marked_for_mischief: { holeTargetUserId: 'recipient' },
  }
  const add = (receipt, variantKey) => {
    const payload = actionMessages({ candy: 50, eyes: 2, ...receipt }, { actorId: 'actor',
      members: [{ userId: 'actor', displayName: 'Example Player' }, { userId: 'recipient', displayName: 'Example Friend' }, { userId: 'other', displayName: 'Another Friend' }],
      registeredIds: new Set(), variantKey })[0].payload
    if (pages.some(page => JSON.stringify(page.payload.embeds) === JSON.stringify(payload.embeds))) return
    pages.push({ label: `${receipt.action} • ${receipt.outcome}${receipt.overridden ? ' • curse replacement' : ''}${receipt.result?.goodwillFreedUserId ? ' • goodwill' : ''}`, payload })
  }
  for (const action of ['treat', 'trick']) for (const outcome of config[`${action}Outcomes`]) {
    for (let i = 0; i < (['standard_gift', 'caught_stealing', 'lost_candy'].includes(outcome.id) ? 100 : 1); i++) add({ action, outcome: outcome.id, result: samples[outcome.id] }, String(i))
  }
  add({ action: 'trick', outcome: 'steal_or_find_eye', result: { found: 1 } })
  add({ action: 'trick', outcome: 'steal_or_find_eye', result: { watchedUserId: 'recipient', candyReward: 8 } })
  add({ action: 'treat', outcome: 'eye_candy', result: { eyeGiftUnavailable: true, candyReward: 6 } })
  add({ action: 'trick', outcome: 'bag_swap', result: { swapTargetUserId: 'recipient', swapped: false, redistributed: 5 } })
  add({ action: 'trick', outcome: 'bag_swap', result: { swapTargetUserId: 'recipient', noEffect: 'equal_bags' } })
  add({ action: 'trick', outcome: 'candy_raid', result: { stolen: 2, candyMovements: [{ fromUserId: 'recipient', toUserId: 'actor', candy: 2, holeBonus: 1 }] } })
  add({ action: 'trick', outcome: 'bag_explosion', result: { scattered: 1, explosionTargetUserId: 'recipient', candyMovements: [{ fromUserId: 'recipient', toUserId: 'other', candy: 1 }] } })
  add({ action: 'trick', outcome: 'candy_ransom', result: { stolen: 1, victims: [{ userId: 'recipient' }], fallback: 'ordinary_theft', fallbackFrom: 'candy_ransom' } })
  add({ action: 'treat', outcome: 'temporary_immunity', result: { freedUserId: 'recipient', bagRepairedUserId: 'recipient' } })
  add({ action: 'trick', outcome: 'steal_crown', result: { crownProtectedUserId: 'recipient', noEffect: 'shield_blocks_attack', blockedShields: [{ userId: 'recipient', popped: true }] } })
  add({ action: 'trick', outcome: 'steal_candy', result: { noEffect: 'shield_blocks_attack', blockedShields: [{ userId: 'recipient', popped: false }] } })
  add({ action: 'treat', outcome: 'break_curse', result: { bagRepairedUserId: 'recipient' } })
  add({ action: 'treat', outcome: 'temporary_immunity', result: { shielded: ['recipient'] } })
  add({ action: 'trick', outcome: 'curse_backfire', result: { noEffect: 'already_cursed' } })
  add({ action: 'trick', outcome: 'steal_crown', result: { awardedUserId: 'actor', crownWon: true, crownStolenFrom: 'recipient', crownFirstWin: false } })
  for (const action of ['trick', 'treat']) add({ action, outcome: 'curse_distribution', overridden: true, result: { gifts: [{ userId: 'recipient' }], deliveredCandy: action === 'treat' ? 3 : 2 } })
  add({ action: 'treat', outcome: 'curse_spread', overridden: true, result: { cursedUserId: 'recipient' } })
  add({ action: 'treat', outcome: 'standard_gift', result: { gifts: [{ userId: 'recipient' }], deliveredCandy: 1, goodwillFreedUserId: 'actor' } })
  add({ action: 'treat', outcome: 'sweet_tooth', result: { noEffect: 'no_role_recipient', fateBonus: 1, bankBefore: 5, bank: 6, fatePoints: 100 } })
  add({ action: 'treat', outcome: 'standard_gift', result: { gifts: [{ userId: 'recipient' }], deliveredCandy: 0 } })
  for (const noEffect of ['no_recipient', 'no_manageable_target', 'role_permission', 'no_role_recipient', 'nickname_length', 'candy_capacity', 'no_funded_candy_target']) add({ action: 'trick', outcome: `fallback:${noEffect}`, result: { noEffect } })
  add({ action: 'trick', outcome: 'fallback:restoration_pending', result: { noEffect: 'restoration_pending' } })
  const piece = require('./config').pieces.find(piece => piece.id === 'sel_br')
  const completion = actionMessages({ candy: 50, eyes: 2, result: { awards: [{ ...piece, ownedPositions: ['tl','tr','bl','br'] }],
    newlyCompletedCharacters: ['sel'], newlyAwardedBadges: ['spooky-2026:sel'] } },
  { actorId: 'actor', members: [{ userId: 'actor', displayName: 'Example Player' }], registeredIds: new Set() })[0].payload
  pages.push({ label: 'collection • Selene badge unlocked', payload: completion })
  const duplicate = actionMessages({ candy: 50, eyes: 2, awards: [{ ...piece, duplicate: true, duplicates: 1, ownedPositions: ['tl', 'tr'] }] },
    { actorId: 'actor', members: [{ userId: 'actor', displayName: 'Example Player' }], registeredIds: new Set() })[0].payload
  if (config.duplicates.allowDuplicates !== false) pages.push({ label: 'collection • duplicate piece', payload: duplicate })
  return pages
}
function previewPayload(pages, index) {
  return { ...pages[index].payload, allowedMentions: { parse: [], users: [], roles: [] },
    content: `**Wording preview ${index + 1}/${pages.length}** • ${pages[index].label}\nExample balances and names; no game action is performed.`,
    components: [{ type: 1, components: [
      { type: 2, style: 2, custom_id: 'spooky-wording:previous', label: 'Previous', disabled: index === 0 },
      { type: 2, style: 2, custom_id: 'spooky-wording:next', label: 'Next', disabled: index === pages.length - 1 },
    ] }] }
}
async function showPreview(interaction, authorize) {
  const pages = wordingPages(); let index = 0
  const preview = () => require('./token-art').preparePayload({ ...previewPayload(pages, index), attachments: [] })
  await interaction.editReply(preview())
  const message = await interaction.fetchReply()
  const collector = message.createMessageComponentCollector({ time: 10 * 60 * 1000,
    filter: button => button.user.id === interaction.user.id && button.customId.startsWith('spooky-wording:') })
  collector.on('collect', async button => {
    try {
      await button.deferUpdate()
      await authorize()
      index = Math.max(0, Math.min(pages.length - 1, index + (button.customId.endsWith(':next') ? 1 : -1)))
      await interaction.editReply(preview())
    } catch { collector.stop(); await interaction.editReply({ content: 'This private preview session is no longer available.', components: [], embeds: [] }).catch(() => {}) }
  })
  collector.on('end', () => { void interaction.editReply({ components: [] }).catch(() => {}) })
}
module.exports = { wordingPages, previewPayload, showPreview }
