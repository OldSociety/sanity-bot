const { EmbedBuilder } = require('discord.js')
const { WinterWars } = require('../../models/WinterWars')
const cooldowns = new Map()

module.exports = {
  async execute(interaction) {
    const userId = interaction.user.id
    const now = Date.now()
    const cooldownAmount = 60000 // 60 seconds

    if (cooldowns.has(userId)) {
      const expirationTime = cooldowns.get(userId) + cooldownAmount
      if (now < expirationTime) {
        const timeLeft = ((expirationTime - now) / 1000).toFixed(1)
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Slow It Down Bud')
              .setDescription(
                `You can run this command in **${timeLeft} seconds**`
              )
              .setFooter({ text: 'The default cooldown is 60s' })
              .setColor('RED'),
          ],
          ephemeral: true,
        })
      }
    }

    cooldowns.set(userId, now)
    setTimeout(() => cooldowns.delete(userId), cooldownAmount)

    await WinterWars.findOrCreate({ where: { userId }, defaults: { hp: 5 } })

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('Collecting Snowballs')
          .setDescription('You received **2 × ❄️ snowballs**')
          .setFooter({ text: 'Use /throw <user> to throw snowballs' })
          .setColor('BLUE'),
      ],
    })
  },
}
