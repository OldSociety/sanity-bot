// Cosmetic choices never consume the gameplay RNG. The root operation stores
// the rendered messages, so a replay keeps its original joke and recipients.
function variant(items, key) {
  let hash = 0
  for (const character of String(key || 'spooky'))
    hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0
  return items[hash % items.length]
}
function currencyWords(text) {
  return text
    .replace(
      /(?:🧿\s*)?\bEvil Eyes?\b/g,
      (match) => `🧿 ${match.replace(/^🧿\s*/, '')}`,
    )
    .replace(
      /(?:🍬\s*)?\b(?:candy|candies)\b/gi,
      (match) => `🍬 ${match.replace(/^🍬\s*/, '')}`,
    )
}
function outcomeFlavor(
  receipt,
  {
    actor,
    actorId,
    targets,
    variantKey,
    label = () => targets.join(', ') || actor,
  },
) {
  const result = receipt.result || receipt,
    target = targets.join(', ') || actor
  const say = (
    title,
    description,
    color = receipt.action === 'treat' ? 0x00ff00 : 0xff6347,
  ) => ({
    title: currencyWords(title),
    description: currencyWords(description),
    color,
  })
  if (receipt.outcome === 'plot_point')
    return say('📖 The Plot Thickens',
      `No candies this time, but ${actor}'s story added to the ${result.plotEmoji || '📖'} plot.` +
      (result.unlockedLevels?.length ? `\nThe community reached level ${result.communityLevel}!` : '') +
      (result.unlockedLevels?.includes(2) ? '\nEveryone unlocked Chapter Two (placeholder)!' : ''), 0x527f91)
  if (result.crownProtectedUserId)
    return say(
      '🛡️ What a Failure',
      `${actor} tried to take ${label(
        result.crownProtectedUserId,
      )}'s crown. What a failure! Their shield stopped the theft.`,
      0xffa500,
    )
  if (result.watchedUserId)
    return say('👁 Nothing Gets Past It!',
      `${actor} went looking for an Evil Eye, but ${label(result.watchedUserId)}'s remaining Evil Eyes were watching back.\nInstead, ${actor} made off with **${result.candyReward} Candy**.`)
  if (receipt.outcome === 'eye_candy')
    return { ...say('Eye Candy!', result.eyeRecipientId
      ? `${actor} found something sweet—and someone else caught its attention.\n${label(result.eyeRecipientId)} received **1 Evil Eye!**\n${actor} received **${result.candyReward} Candy**.`
      : `${actor} found something sweet, but there was nobody else to catch its attention.\n${actor} received **${result.candyReward} Candy**.`, 0x00ff00), title: '🍬 Eye Candy!' }
  if (result.bagRepairedUserId)
    return say(
      '🪡 Bag Repaired',
      `${actor} patched ${label(
        result.bagRepairedUserId,
      )}'s candy bag! Its sweets are safe from that sneaky hole again.${
        result.freedUserId
          ? ' Their curse broke too. They are free at last!'
          : ''
      }`,
    )
  if (result.noEffect === 'shield_blocks_attack')
    return say(
      '✨ The Shield Holds',
      `${actor}'s mischief failed.`,
      0xffa500,
    )
  if (result.fallback === 'ordinary_theft')
    return say(
      '🍬 A Smaller Mischief',
      `${actor}'s grand plan became a quick pocket pick: **${result.stolen} candy** from ${target}!`,
    )
  if (result.holeTargetUserId)
    return say(
      '🕳️ A Hole in the Bag',
      `${actor} put a hole in ${label(
        result.holeTargetUserId,
      )}'s candy bag. Who knows what might fall out?`,
    )
  const titles = {
    candy_raid: '🏴‍☠️ Candy Raid',
    bag_explosion: '💥 Bag Explosion',
    sticky_fingers: '🖐️ Sticky Fingers',
    candy_ransom: '📜 Candy Ransom',
    boo: '👻 BOO!',
    candy_shakedown: '🍬 Candy Shakedown',
    trick_chain: '⚡ Trick Chain',
  }
  if (titles[receipt.outcome]) {
    const movement = (result.candyMovements || [])
      .map(
        (row) =>
          `${label(row.fromUserId)} → ${
            row.toUserId === actorId ? actor : label(row.toUserId)
          }: **${row.candy} candy**${
            row.holeBonus ? ' slipped through the hole!' : ''
          }`,
      )
      .join('\n')
    const intro =
      receipt.outcome === 'candy_ransom'
        ? `${actor} demanded **${result.ransomTaken} candy**, returned **${result.ransomReturned}**, and kept **${result.stolen}**!`
        : receipt.outcome === 'bag_explosion'
        ? `${actor} made ${label(
            result.explosionTargetUserId,
          )}'s bag explode! The crowd scrambled for **${
            result.scattered
          } candy**.`
        : receipt.outcome === 'boo'
        ? `${actor} startled ${label(result.explosionTargetUserId)}! **${
            result.scattered
          } candy** scattered into waiting hands.`
        : `${actor} pulled off ${
            receipt.outcome === 'trick_chain'
              ? 'a chain of candy mischief'
              : 'a deliciously sneaky theft'
          }: **${result.stolen} candy**!`
    return say(
      titles[receipt.outcome],
      `${intro}${movement ? `\n${movement}` : ''}`,
    )
  }
  if (receipt.outcome === 'bag_swap' && !result.noEffect)
    return say(
      result.swapped ? '🛍️ Bag Swap' : '⚖️ Bags Rebalanced!',
      `${actor} tangled candy bags with ${label(result.swapTargetUserId)}! ${
        result.swapped
          ? 'Their balances traded places.'
          : `**${result.redistributed} candy** slid from the fuller bag to the lighter one.`
      }`,
    )
  if (receipt.outcome === 'reverse_robbery' && result.lost)
    return say(
      '🙃 Reverse Robbery',
      `${actor}'s robbery went backwards! ${label(
        result.robberyTargetUserId,
      )} walked away with **${result.lost} candy** from their bag.`,
    )
  if (receipt.outcome === 'lost_candy')
    return variant(
      [
        say(
          '🎃 Oops! Candy Down',
          `${actor} dropped the **1 candy used for this treat**, and it vanished into the shadows. No treat this time.`,
          0xff6347,
        ),
        say(
          '👻 A Ghost Ate It',
          `A hungry ghost gulped down the **1 candy used for ${actor}'s treat**. It burped politely and drifted away.`,
          0xff6347,
        ),
        say(
          '🕸️ Tangled Treat',
          `${actor}'s **1 candy used for this treat** stuck to a haunted web. The spider is having a very sweet Halloween!`,
          0xff6347,
        ),
      ],
      variantKey,
    )
  if (receipt.outcome === 'caught_stealing')
    return variant(
      [
        say(
          '🚨 Caught Red-Handed',
          `${actor} tried to sneak a candy away, but got caught! Their trick candy is gone, and the loot stays put.`,
          0xff6347,
        ),
        say(
          '🎃 The Pumpkin Saw Everything',
          `${actor} tried a sneaky theft, but a jack-o'-lantern sounded the alarm! Only their **1 trick candy** was spent.`,
          0xff6347,
        ),
        say(
          '🦇 Bat Patrol',
          `${actor} crept toward the sweets, then the bat patrol swooped in! Their **1 trick candy** is gone; everyone else's bags are safe.`,
          0xff6347,
        ),
      ],
      variantKey,
    )
  if (receipt.outcome === 'sweet_tooth' && result.noEffect) {
    const consolation =
      result.fateBonus > 0
        ? ` Instead, they gained **+${result.fateBonus} FATE POINT${
            result.fateBonus === 1 ? '' : 'S'
          }** as a consolation prize!`
        : result.fateEligible && result.bank >= 100
        ? ' Their fate bank is already full, but the Halloween cheer is theirs to keep!'
        : ' The Halloween cheer is theirs to keep!'
    return say(
      '🦷 A Crown That Didn’t Fit!',
      `${actor} tried on the **Sweet Tooth** crown, but it didn't fit.${consolation}`,
      0x00ff00,
    )
  }
  if (result.noEffect) {
    const reasons = {
      no_recipient: 'There was nobody to share the sweets with this time.',
      equal_bags:
        'The bags were already evenly matched. The magic had nothing to shuffle!',
      no_manageable_target:
        'The spell fizzled before it found someone it could haunt.',
      role_permission: `${actor}'s spooky spell fluttered into a jack-o'-lantern instead. It gave a cheeky grin and vanished!`,
      no_role_recipient: 'No one could wear the Sweet Tooth crown this time.',
      nickname_length:
        'That name was too much of a mouthful for the backwards spell!',
      candy_capacity: 'Your candy bag is already full!',
      no_funded_candy_target:
        'Every candy stash was empty or safely protected.',
      restoration_pending:
        'The last spell is still fading away. Give the Halloween magic a moment to settle!',
      already_cursed: `${actor} is already haunted! The second curse fizzled without making it worse.`,
      shield_blocks_curse: `${actor}'s sparkling shield turned the curse away! Their protection is still shining.`,
    }
    return say(
      '🎃 Mischief Gone Sideways',
      reasons[result.noEffect] || 'The Halloween magic fizzled this time.',
      0xe67e22,
    )
  }
  if (result.freedUserId)
    return say(
      '💫 Curse Broken',
      `${actor} broke the curse on ${target}! They are free at last!`,
      0x00ff00,
    )
  if (result.gifts && !receipt.overridden && result.deliveredCandy > 0) {
    if (receipt.outcome === 'double_gift')
      return say(
        '🎁 Double the Delight',
        `${actor} gifted **${result.deliveredCandy} candies** to ${target} for the price of one!`,
        0x00ff00,
      )
    return variant(
      [
        say(
          '🍬 Treat Gifted',
          `${actor} gifted a treat to ${target}. Their generosity knows no bounds! 🍬`,
          0x00ff00,
        ),
        say(
          '🎁 Tasty Surprise',
          `${actor} surprised ${target} with a sweet treat! 🎁`,
          0x00ff00,
        ),
        say(
          '🍭 Treat Exchange',
          `${actor} offered a sweet treat to ${target}. 🍭`,
          0x00ff00,
        ),
        say(
          '🍫 Chocolate Delight',
          `${actor} shared a delicious chocolate with ${target}. 🍫`,
          0x00ff00,
        ),
        say(
          '🍪 Cookie Craze',
          `${actor} gave a warm cookie treat to ${target}. 🍪`,
          0x00ff00,
        ),
        say(
          '🍩 Donut Delivery',
          `${actor} surprised ${target} with a sugary donut! 🍩`,
          0x00ff00,
        ),
        say(
          '🍰 Cake of Kindness',
          `${actor} gave ${target} a slice of their favorite cake. 🎂`,
          0x00ff00,
        ),
        say(
          '🧁 Cupcake Cheers',
          `${actor} offered ${target} a delightful cupcake! 🧁`,
          0x00ff00,
        ),
      ],
      variantKey,
    )
  }
  if (result.gifts && !result.deliveredCandy)
    return say(
      '🍬 Sweet!',
      `${actor} brought sweets for ${target}.`,
      0x00ff00,
    )
  if (receipt.overridden && result.gifts)
    return say(
      '🎃 Your Curse Takes Over',
      `${actor}'s curse turned their ${receipt.action} into a candy giveaway! **${result.deliveredCandy} candies** went to ${target}.`,
      0xff6347,
    )
  if (result.shielded)
    return say(
      '✨ A Sweet Shield',
      `${actor} wrapped ${
        result.shielded.includes(actorId) ? `themself and ${target}` : target
      } in Halloween magic. Their shimmering shield will stand between them and Halloween mischief!`,
      0x00ff00,
    )
  if (result.cursedUserId && receipt.overridden)
    return say(
      '🎃 Your Curse Spreads',
      `${actor}'s curse spread to ${target}. Stop it before it gets worse!`,
      0xff0000,
    )
  if (result.cursedUserId)
    return say(
      receipt.outcome === 'curse_backfire'
        ? '🔮 The Curse Backfires'
        : '🦇 A Wicked Curse',
      `${actor}'s spell ${
        receipt.outcome === 'curse_backfire'
          ? 'bounced straight back! They are cursed'
          : `settled on ${target}! Watch out for their scrambled words`
      }. The curse lasts until broken or October ends.`,
      0xff0000,
    )
  if (result.reversedUserId)
    return say(
      '🙃 Spelling Backwards',
      `${actor} put a backwards spell on ${target}'s name! ${
        result.alreadyReversed
          ? `It was already tangled, so just laughed at ${target} instead.`
          : ''
      }`,
    )
  if (result.crownStolenFrom)
    return say(
      '👑 THE CROWN CHANGES HANDS!',
      `${actor} stole the **Sweet Tooth Crown** from ${target}! The **Sweet Tooth** role now belongs to ${actor}. But can they keep it?`,
      0xffd700,
    )
  if (result.awardedUserId)
    return say(
      '🦷 SWEET TOOTH!',
      `${actor} found the exceptionally rare **Sweet Tooth Crown**! The **Sweet Tooth** role is theirs to wear. 🍬`,
      0xffd700,
    )
  if (result.stolen)
    return say(
      receipt.outcome === 'great_heist'
        ? '💰 The Great Candy Heist!'
        : receipt.outcome === 'steal_or_find_eye'
        ? '🧿 An Eye for Mischief!'
        : '🍬 Pocket Picked!',
      `${actor} sneaked away with **${result.stolen} ${
        receipt.outcome === 'steal_or_find_eye' ? '🧿 Evil Eye' : '🍬 candy'
      }** from ${target}!`,
    )
  if (receipt.outcome === 'find_eye' || result.found)
    return say(
      '🧿 Something in the Shadows',
      `${actor} spotted a glimmer in the Halloween gloom and found **1 Evil Eye**!`,
      0x00ff00,
    )
  return say(
    'A Token for Your Collection',
    `${actor} opened a mysterious Halloween parcel. See which quarter was inside!`,
    0xffd700,
  )
}
module.exports = { outcomeFlavor, variant, currencyWords }
