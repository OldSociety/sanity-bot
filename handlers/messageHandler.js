// handlers/messageHandler.js

const { EmbedBuilder } = require('discord.js')

module.exports = (client, User) => {
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return
    if (message.channel.type === 'DM') return
    const commandPrefix = '/'
    if (message.content.startsWith(commandPrefix)) return
    if (message.reference) {
      const repliedTo = await message.channel.messages.fetch(
        message.reference.messageId
      )
      if (repliedTo.author.id === client.user.id) return
    }
    if (message.mentions.has(client.user)) return

    const now = new Date()
    const userID = message.author.id
    const userName = message.author.username

    try {
      let userData = await User.findOne({ where: { user_id: userID } })

      if (!userData) {
        userData = await User.create({
          user_id: userID,
          user_name: userName,
          chat_exp: 4,
          chat_level: 1,
          bank: 0,
          fate_points: 0,
          last_chat_message: now,
        })
      }

      const lastMessageTime = new Date(userData.last_chat_message)
      const minutesSinceLastMessage = (now - lastMessageTime) / (1000 * 60)

      if (minutesSinceLastMessage >= 1) {
        const xpToAdd = Math.floor(Math.random() * (15 - 12 + 1)) + 10
        let newXP = userData.chat_exp + xpToAdd
        let newLevel = userData.chat_level
        const xpForNextLevel = 5 * newLevel ** 2 + 50 * newLevel + 100

        // Add XP and check if a level up occurs
        if (newXP >= xpForNextLevel) {
          newLevel += 1
          newXP -= xpForNextLevel

          const member = message.member
          const isBooster = member.roles.cache.has(process.env.BOOSTERROLEID)
          const hasUnwantedRole = member.roles.cache.has(
            process.env.UNWANTEDROLEID
          )

          let fatePointsGained = 0
          let fatePoints = userData.fate_points || 0 // Ensure fate_points is defined
          let bank = userData.bank || 0
          let overflow = 0

          // Award 5 fate points if the user has the unwanted role
          if (hasUnwantedRole) {
            fatePointsGained = 5 // Fixed 5 fate points for unwanted role
            fatePoints += fatePointsGained

            // Handle overflow if fate points exceed 100
            if (fatePoints > 100) {
              overflow = fatePoints - 100 // Calculate overflow amount
              fatePoints = 100 // Cap fate points at 100

              // Check for booster role to handle overflow
              if (isBooster) {
                // If the user is a booster, add overflow to the bank
                bank += overflow
                // Cap the bank at 100 if it exceeds
                if (bank > 100) {
                  bank = 100
                }
                overflow = 0 // Reset overflow as it is added to the bank
              } else {
                // If not a booster, overflow fate points are lost
                overflow = 0 // Reset overflow since points are lost
              }
            }
          }

          // Update user data (level, XP, fate points, and bank)
          await User.update(
            {
              chat_level: newLevel,
              chat_exp: newXP,
              last_chat_message: now,
              ...(hasUnwantedRole && { fate_points: fatePoints, bank: bank }),
            },
            { where: { user_id: userID } }
          )

          // Prepare and send the level-up embed message
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
            )
            .setTimestamp()
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))

          // Add additional embed fields if the user has the unwanted role
          if (hasUnwantedRole) {
            levelUpEmbed.addFields(
              { name: 'Fate', value: `${fatePoints}`, inline: true },
              { name: 'Bank', value: `${bank}`, inline: true },
              {
                name: 'Total',
                value: `${fatePoints + bank}`,
                inline: true,
              }
            )

            // Note if overflow was added to bank or lost
            if (overflow > 0 && isBooster) {
              levelUpEmbed.addFields({
                name: 'Bank Update',
                value: `Excess fate points have been added to your bank.`,
              })
            } else if (overflow > 0 && !isBooster) {
              levelUpEmbed.addFields({
                name: 'Note',
                value: `You have reached the cap of 100 fate points. Any excess fate points were lost.`,
              })
            }
          }

          await message.channel.send({ embeds: [levelUpEmbed] })
        } else {
          // Update only XP and last chat message if no level up
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
