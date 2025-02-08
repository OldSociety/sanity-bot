const { EmbedBuilder } = require('discord.js')
const { WinterWars } = require('../../models/WinterWars')

module.exports = {
  async execute(interaction) {
    const userId = interaction.user.id
    const player = await WinterWars.findOne({ where: { userId } })

    if (!player) {
      return interaction.reply({
        content:
          'You have not collected any snowballs yet. Use `/winterwars collect` first.',
        ephemeral: true,
      })
    }

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle(`❄️ ${interaction.user.username}'s Stats`)
          .setDescription(
            `
          **Snowballs left:** ${player.snowballs}
          **Snowballs thrown:** 1 (Placeholder)
          **Successful throws:** 1 (Placeholder)
          **Success ratio:** 100% (Placeholder)
          **Times hit:** 0 (Placeholder)
          `
          )
          .setColor('BLUE'),
      ],
    })
  },
}
