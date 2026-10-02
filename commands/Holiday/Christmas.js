// ./commands/snowballfight.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js')
const { User, HolidayStat } = require('../../Models/model')
const { Op } = require('sequelize')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('throw')
    .setDescription('Throw a snowball at a random player!'),

  async execute(interaction) {
    const allowedChannelIds = [
      process.env.WINTERCHANNELID,
      process.env.BOTTESTCHANNELID,
    ]
    if (!allowedChannelIds.includes(interaction.channel.id)) {
      return interaction.reply({
        content: `This command can only be used in <#${allowedChannelIds[0]}>.`,
        ephemeral: true,
      })
    }

    const userId = interaction.user.id
    const username = interaction.user.username
    const guild = interaction.guild

    // Fetch or create player record
    let player = await HolidayStat.findOne({ where: { userId } })
    if (!player) {
      player = await HolidayStat.create({
        userId,
        snowballs: 10,
        candycanes: 0,
        hits: 0,
        crits: 0,
        throws: 0,
      })

      const embed = new EmbedBuilder()
        .setTitle('❄️ Welcome to the Snowball Fight! ❄️')
        .setDescription(
          `You just picked up your first ⚪snowball.  
Use **/throw** anytime to toss one at another player.\nEach throw can **miss, graze, hit, or crit**, earning 🍬 candy canes for the shop.`
        )
        .setColor(0x00bfff)

      return interaction.reply({ embeds: [embed] })
    }

    if (player.snowballs <= 0) {
      return interaction.reply({
        content: `You’re out of ⚪snowballs! They regenerate hourly up to 10.`,
        ephemeral: true,
      })
    }

    // Fetch guild members and filter out bots, bot-role users, and self
    const completeMembers = await require('../../services/guild-members').memberDirectory(guild).get(guild)
    const potentialTargets = new Map([...completeMembers].filter(([_id, member]) => member.id !== userId))
    // const potentialTargets = guild.members.cache.filter(
    //   (m) =>
    //     !m.user.bot &&
    //     m.id !== userId &&
    //     !m.roles.cache.has(process.env.BOTROLEID)
    // )

    // Pick random target
    let targetMember = null
    if (potentialTargets.size > 0) {
      const randomIndex = Math.floor(Math.random() * potentialTargets.size)
      targetMember = Array.from(potentialTargets.values())[randomIndex]

      // Ensure target has a database record
      let targetRecord = await HolidayStat.findOne({
        where: { userId: targetMember.id },
      })
      if (!targetRecord) {
        await HolidayStat.create({
          userId: targetMember.id,
          snowballs: 10,
          candycanes: 0,
          hits: 0,
          crits: 0,
          throws: 0,
        })
      }
    }

    // Throw resolution
    const roll = Math.random()
    let result = 'miss'
    let reward = 0

    const targetName = targetMember
      ? targetMember.user.username
      : 'the snow drifts'

    if (roll < 0.1) {
      result = 'miss'
      description = `Oh no, you missed **${targetName}.**`
      reward = 0
      gifUrl = 'https://c.tenor.com/nDxCGQUnuDEAAAAd/tenor.gif'
    } else if (roll < 0.4) {
      result = 'graze'
      description = `You barely touched **${targetName}. Try again.**`
      reward = 1
      gifUrl = 'https://c.tenor.com/tMODJ8pFK-AAAAAd/tenor.gif'
    } else if (roll < 0.9) {
      result = 'hit'
      description = `Splash. The snowball hit **${targetName}!**`
      reward = 3
      player.hits++
      gifUrl = 'https://media.tenor.com/Lm9Y_v448XoAAAAj/snow-snowball.gif'
    } else {
      result = 'crit'
      description = `Right in the face!!!!! You left **${targetName}** dazed and confused!`
      reward = 5
      player.crits++
      gifUrl = 'https://c.tenor.com/QlHc3eGPoy0AAAAd/tenor.gif'
    }

    player.snowballs -= 1
    player.candycanes += reward
    player.throws++
    await player.save()

    const footerText = `Available: ⚪${player.snowballs} 🍬${player.candycanes}`

    const embed = new EmbedBuilder()
      .setTitle(`**${result.toUpperCase()}**`)
      .setDescription(`${description} and earned **${reward} 🍬 candy canes.**`)
      .setImage(`${gifUrl}`)
      .setColor(0xffffff)
      .setFooter({ text: footerText })

    return interaction.reply({ embeds: [embed] })
  },
}
