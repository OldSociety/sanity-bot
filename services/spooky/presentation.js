const { pieces } = require('./config')
const { tokenImage } = require('./token-art')
const noMentions = { parse: [], users: [], roles: [], repliedUser: false }
const pieceNumber = (position) => ['tl', 'tr', 'bl', 'br'].indexOf(position) + 1
function balanceFooter(
  receipt,
  now = new Date(),
  event = require('./config').config,
) {
  const values = [`🍬 ${receipt.candy ?? '—'}`, `🧿 ${receipt.eyes ?? '—'}`]
  if (
    receipt.candy === 0 &&
    event.enabled &&
    require('./config').getEventState(new Date(now), event) === 'ACTIVE'
  ) {
    const interval = event.candy.refillIntervalMs,
      origin = Date.parse(event.startsAt)
    const remaining = interval - ((new Date(now).getTime() - origin) % interval)
    values.push(`Candy refill in: ${Math.ceil(remaining / 60000)} minutes`)
  }
  return { text: `Available: ${values.join(' • ')}` }
}
function withBalances(payload, receipt, now, event) {
  return {
    ...payload,
    embeds: payload.embeds?.map((embed) => {
      const { timestamp, ...rest } = embed
      return { ...rest, footer: balanceFooter(receipt, now, event) }
    }),
  }
}
const { safeName } = require('../display-name')
function fateBalanceFields(result) {
  const valid = (value) => Number.isSafeInteger(value) && value >= 0
  if (!valid(result.bank)) return []
  const before = valid(result.bankBefore) ? result.bankBefore : null
  const bank = {
    name: 'Bank',
    value: before === null ? `${result.bank}` : `${before} → ${result.bank}`,
    inline: true,
  }
  if (!valid(result.fatePoints)) return [bank] // Older receipts lack the Fate snapshot.
  const fateBefore = valid(result.fateBefore)
    ? result.fateBefore
    : result.fatePoints
  const total = result.fatePoints + result.bank,
    oldTotal = fateBefore + before
  if (
    !Number.isSafeInteger(total) ||
    (before !== null && !Number.isSafeInteger(oldTotal))
  )
    return [bank]
  return [
    {
      name: 'Fate',
      value: valid(result.fateBefore)
        ? `${result.fateBefore} → ${result.fatePoints}`
        : `${result.fatePoints}`,
      inline: true,
    },
    bank,
    {
      name: 'Total',
      value: before === null ? `${total}` : `${oldTotal} → ${total}`,
      inline: true,
    },
  ]
}
function targetIds(result, actorId) {
  return [
    ...new Set(
      [
        ...(result.victims || []).map((target) => target.userId),
        ...(result.gifts || []).map((target) => target.userId),
        ...(result.shielded || []),
        result.cursedUserId,
        result.freedUserId,
        result.reversedUserId,
        result.awardedUserId,
        result.crownStolenFrom,
        result.crownProtectedUserId,
        result.holeTargetUserId,
        result.bagRepairedUserId,
        result.swapTargetUserId,
        result.robberyTargetUserId,
        result.explosionTargetUserId,
        ...(result.blockedShields || []).map(row => row.userId),
        ...(result.candyMovements || []).flatMap(row => [row.fromUserId, row.toUserId]),
      ].filter((id) => id && id !== actorId),
    ),
  ]
}
function actionMessages(
  receipt,
  { actorId, members, registeredIds, mentionIds, variantKey, avatarURL, timestamp },
) {
  const result = receipt.result || receipt
  const ids = targetIds(result, actorId),
    allowed = ids.filter((id) => (mentionIds || registeredIds).has(id))
  const label = (id) =>
    allowed.includes(id)
      ? `<@${id}>`
      : safeName(members.find((member) => member.userId === id)?.displayName)
  const actor = `**${safeName(
    members.find((member) => member.userId === actorId)?.displayName,
  )}**`
  const flavor = require('./flavor').outcomeFlavor(receipt, {
    actorId,
    actor,
    label,
    targets: ids.map(label),
    variantKey,
  })
  const details = []
  for (const shield of result.blockedShields || []) details.push(shield.popped
    ? `💥 ${label(shield.userId)}'s shield burst into sparks! It stopped the attack, but the magic is gone.`
    : `✨ ${label(shield.userId)}'s shield caught the attack and flickered.`)
  if (
    result.fateBonus &&
    !(receipt.outcome === 'sweet_tooth' && result.noEffect)
  )
    details.push(`**Banked fate bonus:** +${result.fateBonus}.`)
  if (result.candyReward)
    details.push(`**Candy reward:** +${result.candyReward}.`)
  if (result.goodwillFreedUserId)
    details.push(`**${actor}'s good will broke the curse!**`)
  const text = require('./flavor').currencyWords(
    [flavor.description, ...details].join('\n'),
  )
  const decoration = {
    ...(avatarURL ? { thumbnail: { url: avatarURL } } : {}),
    footer: balanceFooter(receipt, timestamp),
  }
  // Discoveries and earned wins belong in the channel, including personal finds.
  // No actor ping is needed; the root transaction supplies capped recipients.
  const rewardWin =
    (receipt.outcome === 'find_eye' && !result.noEffect) ||
    result.found > 0 ||
    result.fateBonus > 0 ||
    result.candyReward > 0 ||
    Boolean(result.awardedUserId) ||
    Boolean(result.goodwillFreedUserId) ||
    result.awards?.length > 0 ||
    result.newlyCompletedCharacters?.length > 0
  const revealOnly =
    !receipt.action &&
    (result.awards?.length > 0 || result.newlyCompletedCharacters?.length > 0)
  const messages = !revealOnly
    ? [
        {
          public: ids.length > 0 || Boolean(rewardWin),
          payload: {
            // Recipient references belong inside the embed only. Discord does
            // not notify embed mentions; explicitly block all notification pings.
            allowedMentions: noMentions,
            embeds: [
              {
                title: flavor.title,
                description: text,
                color: flavor.color,
                ...decoration,
                ...(fateBalanceFields(result).length
                  ? { fields: fateBalanceFields(result) }
                  : {}),
              },
            ],
          },
        },
      ]
    : []
  // Public reveals use committed ownership snapshots, never current inventory.
  for (const award of result.awards || []) {
    // The completion reveal includes the finishing quarter: do not announce
    // the same character twice for its fourth piece in this root operation.
    if ((result.newlyCompletedCharacters || []).includes(award.characterId))
      continue
    // Old saved receipts predate ownership snapshots; show their acquired piece
    // rather than querying current inventory and changing a historical reveal.
    const image = tokenImage(
      award.characterId,
      award.ownedPositions || [award.position],
    )
    messages.push({
      public: true,
      payload: {
        allowedMentions: noMentions,
        ...(image ? { files: [{ tokenAsset: image, name: image }] } : {}),
        embeds: [
          {
            title: award.duplicate
              ? '**DUPLICATE PIECE FOUND!**'
              : '**NEW PIECE COLLECTED!**',
            color: parseInt(award.color.slice(1), 16),
            ...decoration,
            ...(revealOnly &&
            messages.length === 0 &&
            fateBalanceFields(result).length
              ? { fields: fateBalanceFields(result) }
              : {}),
            ...(image
              ? {
                  [award.duplicate ? 'thumbnail' : 'image']: {
                    url: `attachment://${image}`,
                  },
                }
              : {}),
            description: `${safeName(
              members.find((member) => member.userId === actorId)?.displayName,
            )} collected **${safeName(award.characterName)} #${pieceNumber(
              award.position,
            )}**!\nThis is a **${award.rarity.toUpperCase()} **piece.\n${
              award.duplicate
                ? `Every 5 duplicates will grant you a new unowned piece!\n**Current Duplicates: ${
                    award.duplicates ?? '—'
                  }/5**`
                : `**Total Found: ${
                    (award.ownedPositions || [award.position]).length
                  }/4**`
            }${
              award.source === 'duplicate_exchange'
                ? '\nFive extras exchanged for a missing piece.'
                : ''
            }`,
          },
        ],
      },
    })
  }
  for (const characterId of result.newlyCompletedCharacters || []) {
    const name =
      pieces.find((piece) => piece.characterId === characterId)
        ?.characterName || characterId
    const image = tokenImage(characterId, ['tl', 'tr', 'bl', 'br'])
    const badge = require('../badges').badges.find(
      (item) => item.characterId === characterId,
    )
    const files = [
      { tokenAsset: image, name: image },
      ...(badge?.imageAsset
        ? [{ badgeAsset: badge.imageAsset, name: badge.imageAsset }]
        : []),
    ]
    const finishing = (result.awards || []).find(
      (award) =>
        award.characterId === characterId &&
        !award.duplicate &&
        award.ownedPositions?.length === 4,
    )
    const { thumbnail: avatar, ...completionDecoration } = decoration
    messages.push({
      public: true,
      payload: {
        allowedMentions: noMentions,
        files,
        embeds: [
          {
            title: `**🎉 ${safeName(name)} Complete!**`,
            color: 0xffd700,
            ...completionDecoration,
            ...(badge?.imageAsset
              ? { image: { url: `attachment://${badge.imageAsset}` } }
              : {}),
            ...(revealOnly &&
            messages.length === 0 &&
            fateBalanceFields(result).length
              ? { fields: fateBalanceFields(result) }
              : {}),
            thumbnail: { url: `attachment://${image}` },
            description: `**${safeName(
              members.find((member) => member.userId === actorId)?.displayName,
            )} — Congratulations! You have collected all four pieces of ${safeName(
              name,
            )}!**${
              finishing
                ? `\nFinishing piece: **#${pieceNumber(
                    finishing.position,
                  )} • ${finishing.rarity.toUpperCase()}**`
                : ''
            }\n${
              (result.newlyAwardedBadges || []).includes(
                `spooky-2026:${characterId}`,
              )
                ? `**You have unlocked the SPOOKY ${safeName(
                    name,
                  ).toUpperCase()} BADGE!**`
                : (result.alreadyOwnedBadges || []).includes(
                    `spooky-2026:${characterId}`,
                  )
                ? '**Permanent badge already unlocked.**'
                : 'Permanent badge ownership is unavailable in this saved result.'
            }\nSee your full collection with **/spooky collection**.`,
          },
        ],
      },
    })
  }
  return messages
}
function privateScreen(title, description, fields = []) {
  const decorate = require('./flavor').currencyWords
  // Preserve private JSON inspection evidence byte-for-byte inside its fence.
  return {
    allowedMentions: noMentions,
    embeds: [
      {
        title: decorate(title),
        description: description.startsWith('```')
          ? description
          : decorate(description),
        fields,
        color: 0x9b59b6,
      },
    ],
  }
}
function registrationScreen(receipt, user) {
  const payload = privateScreen(
    receipt.newlyRegistered
      ? '🎃 Welcome to Spooky Season!'
      : '🎃 Welcome Back to Spooky Season!',
    [
      receipt.newlyRegistered
        ? 'You have joined the fun!'
        : 'You are already registered. Your collection and balances are kept.',
      '**Play:** `/spooky treat` or `/spooky trick` — each costs **1 🍬 candy**.',
      '**Collect:** Every **5 🧿 Evil Eyes** automatically earns a random quarter. Complete a character to unlock its permanent badge!',
      '**Check in:** `/spooky collection` for quarters, badges and balances.',
      '**More:** `/spooky spend-fate` buys a quarter for **10 Fate Points (Bank first, then Fate)**. `/spooky help` explains the full rules.',
      'Candy refills **+1 every 18 minutes**. Keep spending so your bucket has room for more!',
    ].join('\n\n'),
  )
  const embed = payload.embeds[0]
  embed.color = 0x00ff00
  // Display committed registration balances. Old receipts did not capture Eyes;
  // show an unknown value rather than claiming a fabricated zero on replay.
  embed.footer = {
    text: `Available: 🍬 ${receipt.candy} • 🧿 ${receipt.eyes ?? '—'}`,
  }
  if (typeof user?.displayAvatarURL === 'function')
    embed.thumbnail = { url: user.displayAvatarURL() }
  return payload
}
function helpScreen() {
  return privateScreen(
    '🎃 Spooky — Help',
    [
      '**Play:** `/spooky register`, `/spooky trick`, `/spooky treat`.',
      '**View:** `/spooky collection`, `/spooky leaderboard`, `/spooky help`. Balances appear in the footer.',
      '**Extra quarter:** `/spooky spend-fate` lets you confirm spending **10 Fate Points**, using **Bank first, then Fate**; no daily limit.',
      'Start with **10 candy**. Gain **1 every 18 minutes**. Every action costs **1 candy**.',
      'Five 🧿 Evil Eyes automatically award a quarter. Five extra copies automatically become a missing piece. First copies stay safe.',
      'Tricks steal candy/Eyes or cause curses and reversed nicknames. Treats gift candy, grant protection and break curses.',
      'Curse and protection spells offer up to three eligible people to choose from privately. After 20 seconds, Halloween magic picks one of them. Backfiring curses still affect the giver.',
      'Curse-breaking offers the same choice when at least two people are cursed; a single cursed person is freed automatically.',
      'A shield usually protects the recipient and sometimes the giver too. Each attack weakens it until it bursts, or its magic fades. Shields protect candy, Eyes, names and even the Sweet Tooth Crown. Protection cast on a cursed player breaks their curse instead; it can also repair a hole in their bag. Existing spells cannot be renewed. Curses show ☠ Name ☠; shields show ✨( Name )✨ when the bot can edit the nickname. Original names return when their effects end.',
      'Effects involving another player are public; occasional recipient links appear inside the embed without notification pings. `/spooky leaderboard` shows public rankings.',
      'Backwards-name spells last 12 hours, then restore the original name. Only one player wears the Sweet Tooth Crown: Treats can find it while unclaimed, and a rare Trick can steal it from its holder.',
      'Quarter reveals are public. Personal screens are private. Play throughout October in Pacific time; no post-October redemption.',
      'Complete a character to earn a permanent badge. See your badges in `/spooky collection`. Tricks and treats both build your Scream Supreme standing; scoring details stay hidden.',
    ].join('\n'),
  )
}

module.exports = {
  actionMessages,
  targetIds,
  privateScreen,
  helpScreen,
  registrationScreen,
  balanceFooter,
  withBalances,
  fateBalanceFields,
}
