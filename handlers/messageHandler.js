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
  const communityConfig = dependencies.communityConfig || (() => require('../services/community-leveling/config').selectConfig())
  const handleCommunity = dependencies.handleCommunity || (message => require('../services/community-leveling/runtime').handleMessage(message, User))
  const clock = dependencies.clock || (() => new Date()),
    random = dependencies.random || Math.random
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
    const communal = communityConfig()
    const communalGuild = communal.enabled && message.guild.id === communal.guildId
    try {
      await handleCommunity(message)
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
    if (!spookyChannel) try {
      const unwanted = message.member.roles.cache.has(
        process.env.UNWANTEDROLEID,
      )
      const booster = message.member.roles.cache.has(process.env.BOOSTERROLEID)
      // Preserve the legacy 10–13 XP range and one-minute cooldown.
      const result = await applyChatMessage(User, {
        userId: message.author.id,
        userName: message.author.username,
        now: clock(),
        xp: Math.floor(random() * 4) + 10,
        unwanted,
        booster,
        rewardFate: !communalGuild,
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
              unwanted && !communalGuild ? ' and gained **5 fate points**!' : '!'
            }`,
          )
          .setTimestamp()
          .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        if (unwanted && !communalGuild)
          embed.addFields(
            { name: 'Fate', value: `${user.fate_points}`, inline: true },
            { name: 'Bank', value: `${user.bank}`, inline: true },
            {
              name: 'Total',
              value: `${user.fate_points + user.bank}`,
              inline: true,
            },
          )
        if (result.overflow)
          embed.addFields({
            name: booster ? 'Bank Update' : 'Note',
            value: booster
              ? 'Excess fate points were added to your bank, up to its cap of 100.'
              : 'Fate is capped at 100; excess points were lost.',
          })
        try {
          embed.addFields(
            await badgeField(message.guild, message.author.id, User.sequelize),
          )
        } catch (error) {
          console.error('Level-up badges unavailable:', error.message)
        }
        await message.channel.send({ embeds: [embed] })
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
