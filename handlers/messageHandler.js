// handlers/messageHandler.js

const { EmbedBuilder } = require('discord.js')

module.exports = (client, User) => {
  client.on('messageCreate', async (message) => {
    if (message.author.bot) {
      // Ignore messages from bots
      return
    }

    if (message.channel.type === 'DM') {
      // Ignore direct messages to the bot
      return
    }

    const commandPrefix = '/' // Replace with your actual command prefix

    if (message.content.startsWith(commandPrefix)) {
      // Ignore messages that are commands
      return
    }

    if (message.reference) {
      // If the message is a reply, check if it's replying to the bot
      const repliedTo = await message.channel.messages.fetch(
        message.reference.messageId
      )
      if (repliedTo.author.id === client.user.id) {
        // Ignore messages replying to the bot
        return
      }
    }

    if (message.mentions.has(client.user)) {
      // Ignore messages that mention the bot
      return
    }

    // Check and update user XP and level
    const now = new Date()
    const userID = message.author.id
    const userName = message.author.username

    try {
      let user = await User.findOne({ where: { user_id: userID } })

      // Automatically create an account if one doesn't exist
      if (!user) {
        user = await User.create({
          user_id: userID,
          user_name: userName,
          chat_exp: 4,
          chat_level: 1,
          bank: 0,
          fate_points: 0,
          last_chat_message: now,
          // Include any other default fields required by your User model
        })
      }

      const lastMessageTime = new Date(user.last_chat_message)
      const minutesSinceLastMessage = (now - lastMessageTime) / (1000 * 60)

      if (minutesSinceLastMessage >= 1) {
        const xpToAdd = Math.floor(Math.random() * (15 - 12 + 1)) + 10
        let newXP = user.chat_exp + xpToAdd
        console.log(newXP)
        let newLevel = user.chat_level
        const xpForNextLevel = 5 * newLevel ** 2 + 50 * newLevel + 100

        if (newXP >= xpForNextLevel) {
          newLevel += 1
          newXP -= xpForNextLevel // Adjust XP for the next level

          // Fetch the member object to check roles
          const member = message.member
          const isBooster = member.roles.cache.has(process.env.BOOSTERROLEID)
          const hasUnwantedRole = member.roles.cache.has(
            process.env.UNWANTEDROLEID
          )

          let fatePointsGained = 0
          let fatePoints = user.fate_points
          let bank = user.bank || 0 // Ensure bank is defined
          let overflow = 0

          if (hasUnwantedRole) {
            // Level-up logic for Unwanted members
            const additionalFatePoints = 5
            fatePoints += additionalFatePoints
            fatePointsGained = additionalFatePoints

            if (fatePoints > 100) {
              overflow = fatePoints - 100
              fatePoints = 100

              if (isBooster) {
                bank += overflow
                if (bank > 100) {
                  bank = 100 // Cap the bank at 100
                }
              } else {
                fatePointsGained = additionalFatePoints - overflow
              }
            }
          }

          // Update the user data
          await User.update(
            {
              chat_level: newLevel,
              chat_exp: newXP,
              last_chat_message: now,
              // Only update fate points and bank if the user has the Unwanted role
              ...(hasUnwantedRole && { fate_points: fatePoints, bank: bank }),
            },
            { where: { user_id: userID } }
          )

          // Send level-up notification
          const levelUpEmbed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('Level Up!')
            .setDescription(
              `🎉 Congratulations, ${
                message.author.username
              }! You've reached **level ${newLevel}**${
                hasUnwantedRole
                  ? ` and gained **${fatePointsGained} fate points**!`
                  : '!'
              }`
            ).addFields(
              { name: 'Fate', value: `${userData.fate_points}`, inline: true },
              { name: 'Bank', value: `${userData.bank}`, inline: true },
              {
                name: 'Total',
                value: `${userData.fate_points + userData.bank}`,
                inline: true,
              }
            )
    
            .setTimestamp()
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))

          if (hasUnwantedRole) {
            if (overflow > 0 && !isBooster) {
              levelUpEmbed.addFields({
                name: 'Note',
                value: `You have reached the cap of 100 fate points and lost ${overflow} fate points. Consider boosting the server to gain access to an increased fate point bank.`,
              })
            } else if (overflow > 0 && isBooster) {
              levelUpEmbed.addFields({
                name: 'Bank Update',
                value: `Excess fate points (${overflow}) have been added to your bank.`,
              })
            }
          }

          // Send the embed to the user
          await message.channel.send({ embeds: [levelUpEmbed] })
        } else {
          // Update the XP and last message time if no level up
          await User.update(
            {
              chat_exp: newXP,
              last_chat_message: now,
            },
            { where: { user_id: userID } }
          )
        }
      }
    } catch (error) {
      console.error('Error updating user XP, level, and fate points:', error)
    }
  })
}
