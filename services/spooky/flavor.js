// Cosmetic choices never consume the gameplay RNG. The root operation stores
// the rendered messages, so a replay keeps its original joke and recipients.
function variant(items, key) {
  let hash = 0
  for (const character of String(key || 'spooky')) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0
  return items[hash % items.length]
}
function currencyWords(text) {
  return text.replace(/(?:🧿\s*)?\bEvil Eyes?\b/g, match => `🧿 ${match.replace(/^🧿\s*/, '')}`)
    .replace(/(?:🍬\s*)?\b(?:candy|candies)\b/gi, match => `🍬 ${match.replace(/^🍬\s*/, '')}`)
}
function outcomeFlavor(receipt, { actor, actorId, targets, variantKey }) {
  const result = receipt.result || receipt, target = targets.join(', ') || actor
  const say = (title, description, color = receipt.action === 'treat' ? 0x00ff00 : 0xff6347) => ({ title: currencyWords(title), description: currencyWords(description), color })
  if (receipt.outcome === 'lost_candy') return say('🎃 Oops! Candy Down!', `${actor} dropped the **1 candy used for this treat**, and it vanished into the shadows. No treat this time!`, 0xff6347)
  if (receipt.outcome === 'caught_stealing') return say('🚨 Caught Red-Handed!', `${actor} tried to sneak a candy away, but got caught! Their trick candy is gone, and the loot stays put.`, 0xff6347)
  if (receipt.outcome === 'sweet_tooth' && result.noEffect) {
    const consolation = result.fateBonus > 0
      ? ` Instead, they gained **+${result.fateBonus} FATE POINT${result.fateBonus === 1 ? '' : 'S'}** as a consolation prize!`
      : result.fateEligible && result.bank >= 100 ? ' Their fate bank is already full, but the Halloween cheer is theirs to keep!' : ' The Halloween cheer is theirs to keep!'
    return say('🦷 A Crown That Didn’t Fit!', `${actor} tried on the **Sweet Tooth** crown, but it didn't fit.${consolation}`, 0x00ff00)
  }
  if (result.noEffect) {
    const reasons = {
      no_recipient: 'There was nobody to share the sweets with this time.',
      no_manageable_target: 'The spell fizzled before it found someone it could haunt.',
      role_permission: `${actor}'s spooky spell fluttered into a jack-o'-lantern instead. It gave a cheeky grin and vanished!`,
      no_role_recipient: 'No one could wear the Sweet Tooth crown this time.',
      nickname_length: 'That name was too much of a mouthful for the backwards spell!',
      candy_capacity: 'Your candy bag is already full!',
      no_funded_candy_target: 'Every candy stash was empty or safely protected.',
      restoration_pending: 'The last spell is still fading away. Give the Halloween magic a moment to settle!',
      already_cursed: `${actor} is already haunted! The second curse fizzled without making it worse.`,
      shield_blocks_curse: `${actor}'s sparkling shield turned the curse away! Their protection is still shining.`,
    }
    return say('🎃 Mischief Gone Sideways!', reasons[result.noEffect] || 'The Halloween magic fizzled this time.', 0xe67e22)
  }
  if (result.freedUserId) return say('💫 Curse Broken!', `${actor} broke the curse on ${target}! They are free at last!`, 0x00ff00)
  if (result.gifts && !receipt.overridden && result.deliveredCandy > 0) {
    if (receipt.outcome === 'double_gift') return say('🎁 Double the Delight!', `${actor} gifted **${result.deliveredCandy} candies** to ${target} for the price of one!`, 0x00ff00)
    return variant([
      say('🍬 Treat Gifted!', `${actor} gifted a treat to ${target}. Their generosity knows no bounds! 🍬`, 0x00ff00),
      say('🎁 Sweet Surprise!', `${actor} surprised ${target} with a sweet treat! 🎁`, 0x00ff00),
      say('🍭 Treat Exchange!', `${actor} offered a sweet treat to ${target}. 🍭`, 0x00ff00),
      say('🍫 Chocolate Delight!', `${actor} shared a delicious chocolate with ${target}. 🍫`, 0x00ff00),
      say('🍪 Cookie Craze!', `${actor} gave a warm cookie treat to ${target}. 🍪`, 0x00ff00),
      say('🍩 Donut Delivery!', `${actor} surprised ${target} with a sugary donut! 🍩`, 0x00ff00),
      say('🍰 Cake of Kindness!', `${actor} gave ${target} a slice of their favorite cake. 🎂`, 0x00ff00),
      say('🧁 Cupcake Cheers!', `${actor} offered ${target} a delightful cupcake! 🧁`, 0x00ff00),
    ], variantKey)
  }
  if (result.gifts && !result.deliveredCandy) return say('🍬 Sweet Thoughts!', `${actor} brought sweets for ${target}, but their candy bags are already full.`, 0x00ff00)
  if (receipt.overridden && result.gifts) return say('🎃 Your Curse Takes Over!', `${actor}'s curse turned their ${receipt.action} into a candy giveaway! **${result.deliveredCandy} candies** went to ${target}.`, 0xff6347)
  if (result.shielded) return say('✨ A Sweet Shield!', `${actor} wrapped ${result.shielded.includes(actorId) ? `themself and ${target}` : target} in Halloween magic. Their candy and Evil Eyes are protected from theft for **one hour**!`, 0x00ff00)
  if (result.cursedUserId && receipt.overridden) return say('🎃 Your Curse Spreads!', `${actor}'s curse spread to ${target}. Stop it before it gets worse!`, 0xff0000)
  if (result.cursedUserId) return say(receipt.outcome === 'curse_backfire' ? '🔮 The Curse Backfires!' : '🦇 A Wicked Curse!', `${actor}'s spell ${receipt.outcome === 'curse_backfire' ? 'bounced straight back! They are cursed' : `settled on ${target}! Watch out for their scrambled words`}. The curse lasts until broken or October ends.`, 0xff0000)
  if (result.reversedUserId) return say('🙃 A Name Gone Backwards!', `${actor} put a backwards spell on ${target}'s name! Their original name returns in **12 hours**.${result.alreadyReversed ? `It was already tangled, so just laughed at ${target} instead.` : ''}`)
  if (result.crownStolenFrom) return say('👑 THE CROWN CHANGES HANDS!', `${actor} stole the **Sweet Tooth Crown** from ${target}! The **Sweet Tooth** role now belongs to ${actor}. Who will take it next?`, 0xffd700)
  if (result.awardedUserId) return say('🦷 SWEET TOOTH!', `${actor} found the exceptionally rare **Sweet Tooth Crown**! The **Sweet Tooth** role is theirs to wear. 🍬`, 0xffd700)
  if (result.stolen) return say(receipt.outcome === 'great_heist' ? '💰 The Great Candy Heist!' : receipt.outcome === 'steal_or_find_eye' ? '🧿 An Eye for Mischief!' : '🍬 Sticky Fingers!', `${actor} sneaked away with **${result.stolen} ${receipt.outcome === 'steal_or_find_eye' ? '🧿 Evil Eye' : '🍬 candy'}** from ${target}!`)
  if (receipt.outcome === 'find_eye' || result.found) return say('🧿 Something in the Shadows!', `${actor} spotted a glimmer in the Halloween gloom and found **1 Evil Eye**!`, 0x00ff00)
  return say('🧩 A Quarter for Your Collection!', `${actor} opened a mysterious Halloween parcel. See which quarter was inside!`, 0xffd700)
}
module.exports = { outcomeFlavor, variant, currencyWords }
