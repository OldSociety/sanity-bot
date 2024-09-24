const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require('discord.js')
const { Achievement, User, UserAchievement } = require('../../Models/model')
const { checkPermissions } = require('../../utils/checkPermissions')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('achievement')
    .setDescription('Award or remove achievements from users')

    // Subcommand for awarding achievements to users
    .addSubcommand((subcommand) =>
      subcommand
        .setName('award')
        .setDescription('Award an achievement to a user')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The user to award the achievement to')
            .setRequired(true)
        )
    )

    // Subcommand to remove an achievement from a user
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Remove an achievement from a user')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The user to remove the achievement from')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand()
    const isAdmin = await checkPermissions(interaction, process.env.ADMINROLEID)
    if (!isAdmin) return

    if (subcommand === 'award' || subcommand === 'remove') {
      try {
        const user = interaction.options.getUser('user')
        const achievements = await Achievement.findAll()

        if (!achievements || achievements.length === 0) {
          return interaction.reply('No achievements have been created yet.')
        }

        // Create a dropdown menu with available achievements
        const achievementOptions = achievements.map((achievement) => ({
          label: achievement.name,
          description: achievement.description,
          value: achievement.id.toString(),
        }))

        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('select-achievement')
            .setPlaceholder('Select an achievement')
            .addOptions(achievementOptions)
        )

        await interaction.reply({
          content:
            subcommand === 'award'
              ? 'Please select an achievement to award:'
              : 'Please select an achievement to remove:',
          components: [row],
          ephemeral: true,
        })

        const filter = (i) =>
          i.customId === 'select-achievement' &&
          i.user.id === interaction.user.id
        const collector = interaction.channel.createMessageComponentCollector({
          filter,
          time: 15000,
        })

        collector.on('collect', async (i) => {
          const achievementId = i.values[0]
          const achievement = await Achievement.findByPk(achievementId)
          const userData = await User.findOne({ where: { user_id: user.id } })

          if (!userData || !achievement) {
            return i.reply('User or achievement not found.')
          }

          if (subcommand === 'award') {
            const existingAward = await UserAchievement.findOne({
              where: {
                userId: userData.user_id,
                achievementId: achievement.id,
              },
            })

            if (existingAward) {
              return i.reply('User already has this achievement.')
            }

            await UserAchievement.create({
              userId: userData.user_id,
              achievementId: achievement.id,
            })

            userData.fate_points += achievement.secret ? 20 : 10
            await userData.save()

            await i.reply(
              `Achievement **${achievement.name}** awarded to ${
                user.username
              }, along with ${achievement.secret ? 20 : 10} fate points!`
            )
          } else if (subcommand === 'remove') {
            const awardToRemove = await UserAchievement.findOne({
              where: {
                userId: userData.user_id,
                achievementId: achievement.id,
              },
            })

            if (!awardToRemove) {
              return i.reply('User does not have this achievement.')
            }

            await UserAchievement.destroy({
              where: {
                userId: userData.user_id,
                achievementId: achievement.id,
              },
            })

            await i.reply(
              `Achievement **${achievement.name}** removed from ${user.username}.`
            )
          }
        })

        collector.on('end', (collected) => {
          if (collected.size === 0) {
            interaction.editReply({
              content: 'No achievement selected.',
              components: [],
            })
          }
        })
      } catch (error) {
        console.error('Error managing achievements:', error)
        return interaction.reply('There was an error managing the achievement.')
      }
    }
  },
}
