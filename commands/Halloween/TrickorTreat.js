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
      subcommand
        .setName('status')
        .setDescription('Check your candies and rank.')
    ),

  async execute(interaction) {
    const allowedChannelIds = [
      process.env.SPOOKYCHANNELID,
      process.env.BOTTESTCHANNELID,
    ]

    // Check if the command was used in one of the allowed channels
    if (!allowedChannelIds.includes(interaction.channel.id)) {
      await interaction.reply({
        content: `This command can only be used in  <#${allowedChannelIds[0]}>.`,
        ephemeral: true,
      })
      return
    }

    const { user, guild } = interaction
    const subcommand = interaction.options.getSubcommand()
    const now = new Date()
    const targetChannelId = process.env.HELLBOUNDCHANNELID
    const isAdmin = interaction.member.roles.cache.has(process.env.ADMINROLEID)

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

      // Update lastActive when the user performs a command
      spookyStat.lastActive = new Date()
      await spookyStat.save()
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
              `You start with 3 candies to gift or use for random tricks.\n` +
              `Winner: The user with the most candies!\n` +
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
      // Check if the user is an admin
      const isAdmin = interaction.member.roles.cache.has(
        process.env.ADMINROLEID
      )

      // Only log all members' statuses if the command user is an admin
      if (isAdmin) {
        const allMembers = await guild.members.fetch() // Fetch all members in the guild

        // Filter out bots
        const nonBotMembers = allMembers.filter((member) => !member.user.bot)

        // Sort members alphabetically by their status (idle before offline, etc.)
        const sortedMembers = nonBotMembers.sort((a, b) => {
          const statusA = a.presence?.status || 'offline'
          const statusB = b.presence?.status || 'offline'
          return statusA.localeCompare(statusB) // Sort alphabetically by status
        })

        // Log the sorted list of members and their statuses
        sortedMembers.forEach((member) => {
          const status = member.presence?.status || 'offline' // Check online status or default to 'offline'
          console.log(`Member: ${member.user.username}, Status: ${status}`)
        })
      }

      // Continue with the existing status command logic
      try {
        const participants = await SpookyStat.findAll({
          order: [['treats', 'DESC']],
        })

        // Filter out admins from ranking
        const filteredParticipants = participants.filter(
          (stat) =>
            !guild.members.cache
              .get(stat.userId)
              ?.roles.cache.has(process.env.ADMINROLEID)
        )

        const rank =
          filteredParticipants.findIndex((stat) => stat.userId === user.id) + 1

        const embed = new EmbedBuilder()
          .setTitle(`${user.username}'s Spooky Status`)
          .setDescription(
            `**Candies 🍭:** ${spookyStat.treats}\n` +
              `**Rank:** #${rank} of ${filteredParticipants.length} participants`
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
          content: '❌ You have no candies left to give!',
          ephemeral: true,
        })
      }

      // Deduct 1 treat from the giver, even if it’s lost
      spookyStat.treats = Math.max(0, spookyStat.treats - 1)
      await spookyStat.save()

      if (Math.random() < 0.1) {
        // 10% chance the treat is lost
        return interaction.reply({
          content: '🎃 Oops! You dropped the candy, and it was lost! 🎃',
          ephemeral: true,
        })
      }

      const eligibleMembers = targetChannel.members.filter(
        (member) =>
          member.user.id !== user.id &&
          member.presence?.status !== 'offline' &&
          !member.user.bot &&
          !member.roles.cache.has(process.env.ADMINROLEID) // Exclude admins
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
          content: `🎁 ${user} gifted **2 candies** to ${randomMember}!`,
          ephemeral: false,
        })
      } else if (treatRoll < 0.22) {
        // Temporary Immunity: Mark the giver as immune for 1 hour
        const now = new Date()

        spookyStat.hasBeenTricked = true // Immunity flag for giver
        spookyStat.lastSpookyUse = now // Track immunity start time
        await spookyStat.save()

        console.log(`✨ ${user.username} granted temporary immunity.`)

        return interaction.reply({
          content: `✨ ${user} gave a treat to ${randomMember}. Because of their generosity, they received **temporary immunity** from tricks!`,
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
            description: `${user} offered a sweet treat to ${randomMember}. 🍭`,
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
          content: '❌ You have no candies left to perform a trick!',
          ephemeral: true,
        })
      }

      // Deduct 1 treat from the giver, even if the trick fails
      spookyStat.treats = Math.max(0, spookyStat.treats - 1)
      await spookyStat.save()

      console.log(`🕵️ ${user.username} spent a candy to perform a trick.`)

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
        const isNotAdmin = !member.roles.cache.has(process.env.ADMINROLEID) // Exclude admins
        return isOnlineOrIdle && isNotUser && isNotBot && isNotAdmin
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
        await spookyStat.save()
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

          // Add 2 treat to the user executing the trick
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
            content: `❌ ${randomMember.user.username} has no candies to steal!`,
            ephemeral: true,
          })
        }
      } else if (trickChance < 0.35) {
        // Check if there are any valid targets
        if (filteredTargets.length === 0) {
          // Refund the user 1 treat since no valid targets are available
          spookyStat.treats = Math.max(0, spookyStat.treats + 1)
          await spookyStat.save()
      
          console.log(`❌ No valid targets found for ${user.username}. Retrying...`)
      
          // Re-run the trick command
          return module.exports.execute(interaction)
        }
      
        // Great Heist: Attempt to steal from up to 3 random members (35% chance)
        const targetCount = Math.min(3, filteredTargets.length) // Only attempt up to the number of available targets
        const heistMembers = filteredTargets.slice(0, targetCount) // Select available targets, even if less than 3
        const affectedUsers = []
        let totalStolen = 0
      
        for (const { member, memberStat } of heistMembers) {
          if (memberStat.treats > 0) {
            const stolenTreats = Math.min(1, memberStat.treats) // Ensure we only steal 1 per member
            memberStat.treats = Math.max(0, memberStat.treats - stolenTreats)
            await memberStat.save()
            totalStolen += stolenTreats
            affectedUsers.push(member.user.username)
          }
        }
      
        if (totalStolen === 0) {
          spookyStat.treats = Math.max(0, spookyStat.treats + 2)
          return interaction.reply({
            content: '❌ No valid targets with candies for the Great Heist!',
            ephemeral: true,
          })
        }
      
        // Add the total number of stolen treats to the user executing the trick
        spookyStat.treats += totalStolen
        await spookyStat.save()
      
        console.log(
          `💰 ${user.username} performed a Great Heist on: ${affectedUsers.join(', ')} and stole ${totalStolen} treat(s).`
        )
      
        return interaction.reply({
          content: `💰 ${user} stole ${totalStolen} candie(s) from: ${affectedUsers.join(', ')}!`,
          ephemeral: false,
        })
      }
      else if (trickChance < 0.5) {
        // Reverse Nickname and apply text swap for 1 hour (5% chance)
        const currentNickname = randomMember.nickname || randomMember.user.username;
        const reversedName = currentNickname.split('').reverse().join('');
        
        // Add cursed role
        await randomMember.roles.add(process.env.CURSEDROLEID);
        await recipientStat.save();
    
        try {
            await randomMember.setNickname(reversedName);
            console.log(`🔄 ${user.username} reversed ${randomMember.user.username}'s nickname and applied the cursed text effect.`);
    
            return interaction.reply({
                content: `🔄 ${user} cursed ${randomMember.user.username}! Their nickname was reversed and worse!`,
                ephemeral: false,
            });
        } catch (error) {
            console.error('❌ Error setting nickname or applying the curse:', error);
    
            return interaction.reply({
                content: `❌ Couldn't reverse ${randomMember.user.username}'s nickname or apply the curse.`,
                ephemeral: true,
            });
        }
    }
    
    }
  },
}
