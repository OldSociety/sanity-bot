const { EmbedBuilder } = require('discord.js')
const { WinterWars } = require('../../models/WinterWars')

module.exports = {
  async execute(interaction) {
    const userId = interaction.user.id
    const target = interaction.options.getUser('target')

    if (!target || target.id === userId) {
      return interaction.reply({
        content: 'You must select a valid user to throw a snowball at!',
        ephemeral: true,
      })
    }

    const attacker = await WinterWars.findOne({ where: { userId } })
    const defender = await WinterWars.findOne({ where: { userId: target.id } })

    if (!attacker || attacker.hp < 1) {
      return interaction.reply({
        content: 'You have no snowballs left to throw!',
        ephemeral: true,
      })
    }

    if (!defender) {
      await WinterWars.create({ userId: target.id, snowballs: 0 })
    }

    await attacker.decrement('hp', { by: 1 })

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('Snowball Thrown!')
          .setDescription(
            `❄️ ${interaction.user.username} threw a snowball at ${target.username}!`
          )
          .setFooter({ text: 'Use /collect to gather more snowballs!' })
          .setColor('WHITE'),
      ],
    })
  },
}
