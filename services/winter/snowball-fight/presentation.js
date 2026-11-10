const path = require('node:path')
const { EmbedBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js')
const { progressBar } = require('../../achievement-progress')
const R = require('./rules')
const button = (id, label, style = ButtonStyle.Primary) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style)
const accuracy = s => s.throws ? `${(100 * s.hits / s.throws).toFixed(1)}%` : '0.0%'
function render(receipt, userId, emojis = {}) {
  const { player: p, action } = receipt, s = p.state, c = R.config
  const embed = new EmbedBuilder().setColor(0x9dd6ee).setTitle('❄️ Snowball Fight')
    .setAuthor({ name: 'Winter Wars • Snowball Fight' })
    .setFooter({ text: `Snowballs ${p.snowballs}/${c.collection.capacity} • Buttons ${p.buttons} • Development` })
  const payload = { embeds: [embed], components: [], allowedMentions: { parse: [] } }
  let description = receipt.message || ''
  const progress = (value, target) => `\`${Math.min(value, target)}/${target}\` ${progressBar(value, target, emojis)} ${Math.min(100, Math.round(100 * value / target))}%`
  const control = value => `sf:${userId}:${value}`
  if (action === 'stats' || action === 'start') {
    embed.addFields(
      { name: 'Throws', value: `${s.throws} total • ${s.hits} hits • ${s.throws - s.hits} misses\nAccuracy ${accuracy(s)} • Times hit ${s.timesHit} • Server hit rank #${receipt.rank}` },
      { name: 'Progress', value: `Hit streak ${s.streak} • Best ${s.bestStreak}\nCollected ${s.collected} lifetime • PvP Buttons earned ${s.pvpRewards}\nCharacter victories ${s.wins} • Badges ${s.badges}/10\nAchievements ${s.achievements.length}/${R.achievements.length}` },
      { name: 'Profile', value: `Badge: ${c.characters.find(ch => ch.id === s.equipped)?.name || 'None equipped'}${s.snowflake ? ' • ❄️ Snowflake decoration' : ''}` })
    const equipped = c.characters.find(ch => ch.id === s.equipped)
    if (equipped?.asset) {
      payload.files = [new AttachmentBuilder(path.join(__dirname, '../../../assets/badges/Classic', equipped.asset), { name: equipped.asset })]
      embed.setThumbnail(`attachment://${equipped.asset}`)
    }
  }
  if (['quests', 'claim'].includes(action)) {
    embed.setTitle('❄️ Daily Quests')
    for (const q of s.daily.quests) {
      const value = s.daily.counters[q.counter] || 0, claimed = receipt.claimed.includes(q.id)
      embed.addFields({ name: `${q.label} • ${q.reward} Buttons`, value: `${progress(value, q.target)}\n${claimed ? 'Claimed' : value >= q.target ? 'Ready to claim' : 'In progress'}` })
    }
    payload.components.push(new ActionRowBuilder().addComponents(button(control('claim'), 'Claim rewards')))
    description += `\nResets <t:${Math.floor(receipt.resetAt / 1000)}:R>.`
  }
  if (action === 'achievements') {
    embed.setTitle('🏅 Achievements')
    for (const a of R.achievements) embed.addFields({ name: `${s.achievements.includes(a.id) ? '✅' : s[a.counter] ? '🔹' : '🔒'} ${a.name}`,
      value: `${a.counter}: ${progress(s[a.counter] || 0, a.target)} • ${c.achievementReward} Buttons once` })
  }
  if (action === 'collection') {
    embed.setTitle('🏅 Classic Collection')
    for (const ch of c.characters) {
      const marks = receipt.marks.find(m => m.characterId === ch.id)?.marks || 0
      const owned = receipt.owned.includes(R.badgeId(ch.id))
      embed.addFields({ name: `${owned ? '🏅' : '🔒'} Classic ${ch.name}${s.equipped === ch.id ? ' • Equipped' : ''}`,
        value: `${progress(marks, c.combat.badgeVictories)}${!ch.enabled ? '\nEncounter awaiting testing.' : ''}` })
    }
    description = `${s.badges}/10 collected. Earn one mark per character per UTC day. Three marks unlock a badge.\nUse /snowball-fight choose to equip an unlocked badge.`
  }
  if (action === 'shop') {
    embed.setTitle('🧵 Winter Shop')
    for (const item of c.items) embed.addFields({ name: `${item.name} • ${item.price} Buttons`, value: item.description })
    payload.components.push(new ActionRowBuilder().addComponents(...c.items.map(item => button(control(`buy:${item.id}`), `Buy ${item.name}`))))
    description = 'Buttons are event currency. Badges are earned through encounters and give no combat bonus.'
  }
  if (action === 'item-info') {
    const item = c.items.find(item => item.id === receipt.itemId)
    embed.setTitle(item.name)
    description = `${item.description}\nCategory: ${item.category}\nPrice: ${item.price} Buttons\nOwned: ${item.id === 'snowballs' ? p.snowballs : s[item.id] || 0}\n${item.tradable ? 'Giftable to participating members, subject to inventory space.' : 'Cannot be gifted.'}`
  }
  if (action === 'leaderboard') {
    embed.setTitle(`🏆 ${receipt.metric} • Page ${receipt.page}`)
    description = receipt.leaders.map((row, i) => `${(receipt.page - 1) * 10 + i + 1}. <@${row.userId}> — ${receipt.metric === 'accuracy' ? `${Number(row.score).toFixed(1)}%` : row.score}`).join('\n') || 'No qualifying players yet.'
    if (receipt.metric === 'accuracy') description += `\nMinimum ${c.pvp.accuracyMinimum} throws.`
    const controls = []
    if (receipt.page > 1) controls.push(button(control(`leaders:${receipt.metric}:${receipt.page - 1}`), 'Previous'))
    if (receipt.leaders.length === 10 && receipt.page < 10000) controls.push(button(control(`leaders:${receipt.metric}:${receipt.page + 1}`), 'Next'))
    if (controls.length) payload.components.push(new ActionRowBuilder().addComponents(...controls))
  }
  if (receipt.battle) {
    const b = receipt.battle
    embed.setTitle(`❄️ Classic ${b.character.name}${b.outcome ? ` • ${b.outcome}` : ''}`)
    embed.addFields({ name: 'Encounter', value: `You: ${b.hp}/${b.rules.playerHp} HP • ${b.character.name}: ${b.enemyHp}/${b.character.hp} HP\nTurns: ${b.rounds}/${b.rules.maxRounds} • Snowballs used: ${b.spent}\nCocoa: ${s.cocoa} owned • ${b.heals}/${b.rules.maxHeals} used` })
    if (!b.outcome) {
      const key = `battle:${b.id}:${b.revision}`
      payload.components.push(new ActionRowBuilder().addComponents(
        button(control(`${key}:attack`), 'Throw snowball').setDisabled(p.snowballs < 1),
        button(control(`${key}:heal`), 'Drink cocoa', ButtonStyle.Secondary).setDisabled(s.cocoa < 1 || b.hp >= b.rules.playerHp || b.heals >= b.rules.maxHeals),
        button(control(`${key}:retreat`), 'Cancel', ButtonStyle.Danger)))
      description += `\nExpires <t:${Math.floor(b.expiresAt / 1000)}:R>. Reopen /snowball-fight fight to resume.`
    }
    const filename = b.character.asset
    if (filename) {
      payload.files = [new AttachmentBuilder(path.join(__dirname, '../../../assets/badges/Classic', filename), { name: filename })]
      embed.setThumbnail(`attachment://${filename}`)
    }
  }
  if (action === 'news') description = 'Snowball Fight development preview: collect, throw, complete quests, and earn Classic badges. Hendrix, Kylax and Azulis are available. Seven further Classics await encounter testing. No idle production or unattended combat. Special ammunition is deferred.'
  if (action === 'help') description = '**Start:** /snowball-fight start\n**Supplies:** collect (2 every 60 seconds), daily (10 snowballs + 20 Buttons each UTC day), shop\n**Play:** throw at an enrolled member, or fight Hendrix, Kylax or Azulis using buttons. No other player needs to be online.\n**Progress:** quests → claim; achievements award automatically. Three victories on separate UTC days unlock each character badge; collection → choose equips it.\n**More:** stats, leaderboard, gift, item-info, news\nPvP hits always count. Buttons: at most 30/day, no repeated-target reward within an hour or reciprocal reward within ten minutes. Snowballs cap at 50. Fights expire after 30 minutes and give no automatic rewards.'
  if (action === 'daily') description += `\nNext reset <t:${Math.floor(receipt.resetAt / 1000)}:F>.`
  if (description) embed.setDescription(description.trim())
  if (receipt.notices.length) embed.addFields({ name: 'Milestones', value: receipt.notices.join('\n') })
  if (receipt.unlocked) {
    const ch = c.characters.find(ch => ch.id === receipt.unlocked)
    payload.embeds.push(new EmbedBuilder().setColor(0x57f287).setTitle(`🏅 Classic ${ch.name} Badge Unlocked!`)
      .setDescription('Added to your permanent collection. Equip it with /snowball-fight choose.').setThumbnail(`attachment://${ch.asset}`))
  }
  return payload
}
module.exports = { render, accuracy }
