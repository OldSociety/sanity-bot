const { SlashCommandBuilder, EmbedBuilder } = require('discord.js')
const { Achievement, User } = require('../../Models/model')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('achievement')
    .setDescription('View achievements')

    // Subcommand to view achievements (all or user's earned achievements)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('view')
        .setDescription("View all achievements or a user's earned achievements")
        .addUserOption(
          (option) =>
            option
              .setName('user')
              .setDescription('The user to view achievements for')
              .setRequired(false) // Optional: View either user's achievements or all achievements
        )
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('user')
    const embed = new EmbedBuilder()
      .setTitle('Achievements')
      .setColor(0x00ff00)
      .setTimestamp()

    if (user) {
      // Viewing specific user's achievements
      const userData = await User.findOne({
        where: { user_id: user.id },
        include: [{ model: Achievement, through: { attributes: [] } }],
      })

      if (!userData || userData.Achievements.length === 0) {
        embed.setDescription(`${user.username} has no achievements.`)
        return interaction.reply({ embeds: [embed] })
      }

      // Show all achievements earned by the user, including secret ones
      const earnedAchievements = userData.Achievements.map((ach) => {
        return {
          name: ach.name,
          description: ach.secret
            ? `(Secret) ${ach.description}`
            : ach.description,
        }
      })

      earnedAchievements.forEach((ach) => {
        embed.addFields({ name: ach.name, value: ach.description })
      })

      return interaction.reply({ embeds: [embed] })
    } else {
      // Viewing all achievements (without showing secret ones)
      const achievements = await Achievement.findAll({
        where: { secret: false },
      })

      if (achievements.length === 0) {
        embed.setDescription('No achievements have been created yet.')
        return interaction.reply({ embeds: [embed] })
      }

      achievements.forEach((ach) => {
        embed.addFields({ name: ach.name, value: ach.description })
      })

      return interaction.reply({ embeds: [embed] })
    }
  },
}
