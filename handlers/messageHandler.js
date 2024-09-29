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

        if (newXP >= xpForNextLevel) {
          newLevel += 1
          newXP -= xpForNextLevel

          const member = message.member
          const isBooster = member.roles.cache.has(process.env.BOOSTERROLEID)
          const hasUnwantedRole = member.roles.cache.has(
            process.env.UNWANTEDROLEID
          )

          let fatePointsGained = 0
          let fatePoints = userData.fate_points
          let bank = userData.bank || 0
          let overflow = 0

          if (hasUnwantedRole) {
            const additionalFatePoints = 5
            fatePoints += additionalFatePoints
            fatePointsGained = additionalFatePoints

            if (fatePoints > 100) {
              overflow = fatePoints - 100
              fatePoints = 100

              if (isBooster) {
                bank += overflow
                if (bank > 100) {
                  bank = 100
                }
              } else {
                fatePointsGained = additionalFatePoints - overflow
              }
            }
          }

          await User.update(
            {
              chat_level: newLevel,
              chat_exp: newXP,
              last_chat_message: now,
              ...(hasUnwantedRole && { fate_points: fatePoints, bank: bank }),
            },
            { where: { user_id: userID } }
          )

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

          await message.channel.send({ embeds: [levelUpEmbed] })
        } else {
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
