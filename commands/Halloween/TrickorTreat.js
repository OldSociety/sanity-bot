// ./commands/Spooky.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js')
const { User, SpookyStat } = require('../../Models/model')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('spooky')
    .setDescription('Participate in the spooky event!')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('trick')
        .setDescription('Use a treat to perform a trick.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('treat')
        .setDescription('Give a treat to a random user.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('register')
        .setDescription('Register for the spooky event.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('status').setDescription('Check your treats and rank.')
    ),

  async execute(interaction) {
    const { user, guild } = interaction
    const subcommand = interaction.options.getSubcommand()
    const now = new Date()
    const targetChannelId = process.env.HELLBOUNDCHANNELID
    const botRoleId = process.env.BOTROLEID

    const targetChannel = guild.channels.cache.get(targetChannelId)
    if (!targetChannel || targetChannel.type !== 0) {
      return interaction.reply({
        content: '❌ Spooky channel not configured correctly.',
        ephemeral: true,
      })
    }

    let spookyStat
    try {
      spookyStat = await SpookyStat.findOne({ where: { userId: user.id } })
      if (!spookyStat && subcommand !== 'register') {
        return interaction.reply({
          content: '❌ You are not registered. Use `/spooky register` to join!',
          ephemeral: true,
        })
      }
    } catch (error) {
      console.error('❌ Error fetching SpookyStat:', error)
      return interaction.reply({
        content: '❌ An error occurred accessing your spooky stats.',
        ephemeral: true,
      })
    }
    if (subcommand === 'register') {
      try {
        let [userRecord] = await User.findOrCreate({
          where: { user_id: user.id },
          defaults: { user_name: user.username },
        })

        let [newSpookyStat, created] = await SpookyStat.findOrCreate({
          where: { userId: user.id },
        })

        if (!created) {
          return interaction.reply({
            content: '✅ You are already registered!',
            ephemeral: true,
          })
        }

        const embed = new EmbedBuilder()
          .setTitle('🎃 Welcome to the Roll For Sanity Halloween Event!')
          .setDescription(
            `The event runs from **October 15th - 31st**.\n\n` +
              `You start with 3 treats to gift or use for random tricks.\n` +
              `Winner: The user with the most treats!\n` +
              `Check your progress anytime with \`/spooky status\`.`
          )
          .setColor(0xff8c00)
          .setTimestamp()

        return interaction.reply({ embeds: [embed], ephemeral: true })
      } catch (error) {
        console.error('❌ Registration error:', error)
        return interaction.reply({
          content: '❌ An error occurred during registration.',
          ephemeral: true,
        })
      }
    }
    if (subcommand === 'status') {
      try {
        const participants = await SpookyStat.findAll({
          order: [['treats', 'DESC']],
        })

        const rank =
          participants.findIndex((stat) => stat.userId === user.id) + 1

        const embed = new EmbedBuilder()
          .setTitle(`${user.username}'s Spooky Status`)
          .setDescription(
            `**Treats 🍭:** ${spookyStat.treats}\n` +
              `**Rank:** #${rank} of ${participants.length} participants`
          )
          .setColor(0x00ff00)
          .setTimestamp()

        return interaction.reply({ embeds: [embed], ephemeral: false })
      } catch (error) {
        console.error('❌ Error fetching status:', error)
        return interaction.reply({
          content: '❌ An error occurred fetching your status.',
          ephemeral: true,
        })
      }
    }

    if (subcommand === 'treat') {
      if (spookyStat.treats <= 0) {
        return interaction.reply({
          content: '❌ You have no treats left to give!',
          ephemeral: true,
        })
      }

      // Deduct 1 treat from the giver, even if it’s lost
      spookyStat.treats = Math.max(0, spookyStat.treats - 1)
      await spookyStat.save()

      if (Math.random() < 0.1) {
        // 10% chance the treat is lost
        return interaction.reply({
          content: '🎃 Oops! You dropped the treat, and it was lost! 🎃',
          ephemeral: true,
        })
      }

      const eligibleMembers = targetChannel.members.filter(
        (member) =>
          member.user.id !== user.id &&
          member.presence?.status !== 'offline' &&
          !member.user.bot
      )

      if (eligibleMembers.size === 0) {
        return interaction.reply({
          content: '❌ No eligible users available to receive a treat.',
          ephemeral: true,
        })
      }

      const randomMember = eligibleMembers.random()
      let recipientStat = await SpookyStat.findOne({
        where: { userId: randomMember.id },
      })

      if (!recipientStat) {
        recipientStat = await SpookyStat.create({ userId: randomMember.id })
      }

      // Determine which effect occurs when giving the treat
      const treatRoll = Math.random()

      if (treatRoll < 0.02) {
        // Sweet Tooth Role: Add the role to the recipient
        await randomMember.roles.add(process.env.SWEETTOOTHROLEID)
        await recipientStat.save()

        return interaction.reply({
          content: `🎉 ${randomMember} earned the **Sweet Tooth** title! 🍬`,
          ephemeral: false,
        })
      } else if (treatRoll < 0.12) {
        // Multi-Gift: Give two treats to the recipient
        recipientStat.treats += 2
        await recipientStat.save()

        return interaction.reply({
          content: `🎁 ${user} gifted **2 treats** to ${randomMember}!`,
          ephemeral: false,
        })
      } else if (treatRoll < 0.22) {
        // Temporary Immunity: Mark the giver as immune for 1 hour
        const now = new Date()

        spookyStat.hasBeenTricked = true // Immunity flag for giver
        spookyStat.lastSpookyUse = now // Track immunity start time
        await spookyStat.save()

        console.log(`✨ ${user.username} granted 1 hour immunity.`)

        return interaction.reply({
          content: `✨ ${user} gave a treat to ${randomMember}. Because of their generosity, they received **1 hour of immunity** from tricks!`,
          ephemeral: false,
        })
      } else {
        // Standard Treat: One treat given with a random message
        recipientStat.treats += 1
        await recipientStat.save()

        const treatMessages = [
          {
            title: '🍬 Treat Gifted!',
            description: `${user} gifted a treat to ${randomMember}. Their generosity knows no bounds! 🍬`,
            color: 0x00ff00,
          },
          {
            title: '🎁 Sweet Surprise!',
            description: `${user} surprised ${randomMember} with a treat! 🎁`,
            color: 0x32cd32,
          },
          {
            title: '🍭 Treat Exchange!',
            description: `${user} exchanged a sweet treat with ${randomMember}. 🍭`,
            color: 0x7cfc00,
          },
          {
            title: '🍫 Chocolate Delight!',
            description: `${user} shared a delicious chocolate with ${randomMember}. 🍫`,
            color: 0xffd700,
          },
          {
            title: '🍪 Cookie Craze!',
            description: `${user} gave a warm cookie treat to ${randomMember}. 🍪`,
            color: 0xff6347,
          },
          {
            title: '🍩 Donut Delivery!',
            description: `${user} surprised ${randomMember} with a sugary donut! 🍩`,
            color: 0xf4a460,
          },
          {
            title: '🍰 Cake of Kindness!',
            description: `${user} gave ${randomMember} a slice of their favorite cake. 🎂`,
            color: 0xff69b4,
          },
          {
            title: '🧁 Cupcake Cheers!',
            description: `${user} offered ${randomMember} a delightful cupcake! 🧁`,
            color: 0xba55d3,
          },
        ]

        const selectedMessage =
          treatMessages[Math.floor(Math.random() * treatMessages.length)]

        const treatEmbed = new EmbedBuilder()
          .setTitle(selectedMessage.title)
          .setDescription(selectedMessage.description)
          .setColor(selectedMessage.color)
          .setTimestamp()

        console.log(
          `📤 Sending embed for Treat from ${user.username} to ${randomMember.user.username}`
        )

        return interaction.reply({ embeds: [treatEmbed] })
      }
    }

    if (subcommand === 'trick') {
      let spookyStat = await SpookyStat.findOne({ where: { userId: user.id } })

      if (!spookyStat) {
        return interaction.reply({
          content:
            '❌ You are not registered for the event. Use `/spooky register` to participate!',
          ephemeral: true,
        })
      }

      if (spookyStat.treats <= 0) {
        return interaction.reply({
          content: '❌ You have no treats left to perform a trick!',
          ephemeral: true,
        })
      }

      // Deduct 1 treat from the giver, even if the trick fails
      spookyStat.treats = Math.max(0, spookyStat.treats - 1)
      await spookyStat.save()

      console.log(`🕵️ ${user.username} spent a treat to perform a trick.`)

      if (Math.random() < 0.15) {
        // 30% chance of getting caught
        console.log(`❌ ${user.username} was caught playing a trick.`)
        return interaction.reply({
          content:
            '❌ You were caught trying to play a trick! No effect, but the treat is spent.',
          ephemeral: true,
        })
      }

      const now = new Date()

      // Filter members to include only valid targets (online, non-bot, and not immune)
      const eligibleMembers = targetChannel.members.filter((member) => {
        const isOnlineOrIdle = member.presence?.status !== 'offline'
        const isNotUser = member.user.id !== user.id
        const isNotBot = !member.user.bot
        return isOnlineOrIdle && isNotUser && isNotBot
      })

      const validTargets = await Promise.all(
        eligibleMembers.map(async (member) => {
          let memberStat = await SpookyStat.findOne({
            where: { userId: member.id },
          })

          if (!memberStat) {
            console.log(`Creating SpookyStat for ${member.user.username}.`)
            memberStat = await SpookyStat.create({ userId: member.id })
          }

          const isImmune =
            memberStat.hasBeenTricked &&
            now - new Date(memberStat.lastSpookyUse) <= 60 * 60 * 1000

          return !isImmune ? { member, memberStat } : null
        })
      )

      const filteredTargets = validTargets.filter((target) => target)

      if (filteredTargets.length === 0) {
        spookyStat.treats = Math.max(0, spookyStat.treats + 1)
        console.log(`❌ No valid targets for trick found.`)
        return interaction.reply({
          content: '❌ No eligible users available for tricks.',
          ephemeral: true,
        })
      }

      const { member: randomMember, memberStat } =
        filteredTargets[Math.floor(Math.random() * filteredTargets.length)]

      // Mark the target as tricked and set the lastSpookyUse timestamp
      memberStat.hasBeenTricked = true
      memberStat.lastSpookyUse = now
      await memberStat.save()

      const trickChance = Math.random()

      if (trickChance < 0.33) {
        // Steal 1 treat
        if (memberStat.treats > 0) {
          memberStat.treats = Math.max(0, memberStat.treats - 1)
          await memberStat.save()

          // Add 1 treat to the user executing the trick
          spookyStat.treats += 2
          await spookyStat.save()

          console.log(
            `👹 ${user.username} stole a treat from ${randomMember.user.username}.`
          )

          return interaction.reply({
            content: `👹 ${user} stole a treat from ${randomMember.user.username}!`,
            ephemeral: false,
          })
        } else {
          return interaction.reply({
            content: `❌ ${randomMember.user.username} has no treats to steal!`,
            ephemeral: true,
          })
        }
      } else if (trickChance < 0.35) {
        // Great Heist: Steal from 3 random members (2% chance)
        const heistMembers = filteredTargets.slice(0, 3)
        const affectedUsers = []
        let totalStolen = 0

        for (const member of heistMembers) {
          const heistStat = await SpookyStat.findOne({
            where: { userId: member.id },
          })

          if (heistStat && heistStat.treats > 0) {
            heistStat.treats = Math.max(0, heistStat.treats - 1)
            await heistStat.save()
            totalStolen += 1
            affectedUsers.push(member.user.username)
          }
        }

        if (totalStolen === 0) {
          spookyStat.treats = Math.max(0, spookyStat.treats + 2)
          return interaction.reply({
            content: '❌ No valid targets with treats for the Great Heist!',
            ephemeral: true,
          })
        }

        // Add the total number of stolen treats to the user executing the trick
        spookyStat.treats += totalStolen
        await spookyStat.save()

        console.log(
          `💰 ${user.username} performed a Great Heist on: ${affectedUsers.join(
            ', '
          )}.`
        )

        return interaction.reply({
          content: `💰 ${user} stole ${totalStolen} treat(s) from: ${affectedUsers.join(
            ', '
          )}!`,
          ephemeral: false,
        })
      } else if (trickChance < 0.45) {
        // Reverse Nickname (10% chance)
        const currentNickname =
          randomMember.nickname || randomMember.user.username
        const reversedName = currentNickname.split('').reverse().join('')

        try {
          await randomMember.setNickname(reversedName)
          console.log(
            `🔄 ${user.username} reversed ${randomMember.user.username}'s nickname.`
          )

          return interaction.reply({
            content: `🔄 ${user} reversed the nickname of ${randomMember.user.username}!`,
            ephemeral: false,
          })
        } catch (error) {
          console.error('❌ Error setting nickname:', error)

          return interaction.reply({
            content: `❌ Couldn't change ${randomMember.user.username}'s nickname.`,
            ephemeral: true,
          })
        }
      } else if (trickChance < 0.5) {
        // Text Swap (5% chance): Alternates text styles for 1 hour
        const originalSend = randomMember.send
        let swapState = false

        randomMember.send = function (content, options) {
          swapState = !swapState
          const formattedContent = swapState ? `*${content}*` : `**${content}**`
          return originalSend.call(this, formattedContent, options)
        }

        console.log(
          `🔄 ${user.username} applied the Text Swap effect on ${randomMember.user.username}.`
        )

        return interaction.reply({
          content: `🔄 ${user} applied the Text Swap effect on ${randomMember.user.username} for 1 hour!`,
          ephemeral: false,
        })
      }
    }
  },
}
