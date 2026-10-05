const { EmbedBuilder } = require('discord.js')
const { applyChatMessage } = require('../services/fate-wallet')

module.exports = (client, User, dependencies = {}) => {
  const detectHaiku =
    dependencies.detectHaiku || require('./haikuDetector').detectHaiku
  const handleSpooky =
    dependencies.handleSpooky ||
    ((message) => require('../services/spooky/runtime').handleMessage(message))
  const badgeField =
    dependencies.badgeField || require('../services/badges').badgeField
  const handleCommunity = dependencies.handleCommunity || (message => require('../services/community-leveling/runtime').handleMessage(message, User))
  const profileNotification = dependencies.profileNotification || require('../services/profile-notification').createProfileNotification({ User })
  const clock = dependencies.clock || (() => new Date()),
    random = dependencies.random || Math.random
  const qualifiesPersonalXp = dependencies.qualifiesPersonalXp || require('../services/personal-xp-channels').qualifiesPersonalXp
  client.on('messageCreate', async (message) => {
    // Guild/member presence works with Discord's numeric DM channel types.
    if (
      message.author.bot ||
      !message.guild ||
      !message.member ||
      message.content.trimStart().startsWith('/') ||
      message.webhookId || message.interactionMetadata || message.interaction ||
      [20, 23].includes(message.type) ||
      message.mentions.has(client.user)
    )
      return
    if (message.reference?.messageId) {
      try {
        if (
          (await message.channel.messages.fetch(message.reference.messageId))
            .author?.id === client.user.id
        )
          return
      } catch (error) {
        console.error('Error fetching referenced message:', error.message)
      }
    }
    let sanityActivity = null
    try { sanityActivity = await require('../services/sanity').handleMessage(message, User) }
    catch (error) { console.error('Sanity activity unavailable:', error.message) }
    try {
      const community = await handleCommunity(message)
      if (community?.levelUp && !community.replayed) {
        const banking = community.rewards?.some(reward => reward.bankCredited > 0)
        await message.channel.send({ allowedMentions: { parse: [] }, embeds: [{ title: 'Community Level Up!', color: 0x497f91,
          description: `The community reached **level ${community.level}**! Every current eligible campaign player receives **+5 Fate**, subject to balance caps.${banking ? '\n\nLaunch protection: for the first two months, earned Fate above 100 goes into Bank, up to its 100-point cap.' : ''}` }] })
      }
    } catch (error) {
      console.error('Error updating community progression:', error.message)
    }
    // Independent pipelines: a haiku, XP, badge or level-up send failure cannot
    // prevent seasonal message effects from handling this eligible message.
    try {
      const haiku = await detectHaiku(message.content)
      if (haiku)
        await message.reply({
          content: [
            'You wrote a haiku:',
            ...haiku.map((line) => `*${line}*`),
          ].join('\n'),
          allowedMentions: { repliedUser: false },
        })
    } catch (error) {
      console.error('Error handling haiku:', error.message)
    }
    // Spooky chat still reaches seasonal effects, but never the XP/Fate wallet.
    const spookyChannel = process.env.GUILDID && process.env.SPOOKYCHANNELID &&
      message.guild.id === process.env.GUILDID &&
      (message.channelId === process.env.SPOOKYCHANNELID || message.channel.parentId === process.env.SPOOKYCHANNELID)
    if (!spookyChannel && qualifiesPersonalXp(message) && !require('../services/member-policy').excludedMember(message.member)) try {
      const unwanted = message.member.roles.cache.has(
        process.env.UNWANTEDROLEID,
      )
      // Preserve the legacy 10–13 XP range and one-minute cooldown.
      const result = await applyChatMessage(User, {
        userId: message.author.id,
        userName: message.author.username,
        now: clock(),
        xp: Math.floor(random() * 4) + 10,
        unwanted,
        rewardFate: true,
      })
      if (result.levelUp) {
        const user = result.user
        const embed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('Level Up!')
          .setDescription(
            `🎉 Congratulations, ${
              message.author.username
            }! You've reached **level ${user.chat_level}**${
              unwanted ? ` and gained **${Math.max(0, user.fate_points - result.before.fate_points) + (result.bankedOverflow || 0)} fate points**!` : '!'
            }`,
          )
          .setTimestamp()
          .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        if (unwanted)
          embed.addFields(
            { name: 'Fate', value: `${user.fate_points}`, inline: true },
            { name: 'Bank', value: `${user.bank}`, inline: true },
            {
              name: 'Total',
              value: `${user.fate_points + user.bank}`,
              inline: true,
            },
          )
        const launchNote = require('../services/fate-overflow-grace').graceNotice(result.bankedOverflow, result.discardedOverflow)
        if (launchNote) embed.addFields({ name: 'Launch Protection', value: launchNote })
        else if (result.overflow)
          embed.addFields({
            name: 'Note',
            value: 'Fate is capped at 100; excess points were lost.',
          })
        try {
          embed.addFields(
            await badgeField(message.guild, message.author.id, User.sequelize),
          )
        } catch (error) {
          console.error('Level-up badges unavailable:', error.message)
        }
        let card = null
        try { card = await profileNotification({ message, user: user.get({ plain: true }), before: result.before, occasion: 'level-up',
          ...(sanityActivity ? { sanity: { balance: sanityActivity.after, beforeBalance: sanityActivity.before, maximum: require('../config/sanity.json').capacity } } : {}) }) }
        catch (error) { console.error('Level-up card unavailable:', error.message) }
        await message.channel.send(card ? { ...card, ...(launchNote ? { content: launchNote } : {}) } : { embeds: [embed] })
      }
    } catch (error) {
      console.error('Error updating chat progression:', error.message)
    }
    try {
      await handleSpooky(message)
    } catch (error) {
      console.error('Error handling cursed message:', error.message)
    }
  })
}
