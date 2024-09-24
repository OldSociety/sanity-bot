const { SlashCommandBuilder, EmbedBuilder } = require('discord.js')
const { Achievement, User, UserAchievement } = require('../../Models/model')

module.exports = {
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName('achievement')
    .setDescription('Manage achievements')
    // Subcommand for creating achievements
    .addSubcommand((subcommand) =>
      subcommand
        .setName('create')
        .setDescription('Create a new achievement')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('The name of the achievement')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('description')
            .setDescription('The description of the achievement')
            .setRequired(true)
        )
        .addBooleanOption((option) =>
          option
            .setName('secret')
            .setDescription('Is this achievement secret?')
            .setRequired(true)
        )
    )
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
        .addStringOption((option) =>
          option
            .setName('achievement')
            .setDescription('The achievement to award')
            .setRequired(true)
        )
    )
    // Subcommand to view achievements (all achievements or user's earned achievements)
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
    const subcommand = interaction.options.getSubcommand()

    if (subcommand === 'create') {
      // Handle the creation of a new achievement
      try {
        const name = interaction.options.getString('name')
        const description = interaction.options.getString('description')
        const secret = interaction.options.getBoolean('secret')

        const points = secret ? 20 : 10

        const achievement = await Achievement.create({
          name,
          description,
          points,
          secret,
        })

        const embed = new EmbedBuilder()
          .setTitle(`${name} Achievement Created`)
          .addFields(
            { name: 'Name', value: name },
            { name: 'Description', value: description },
            { name: 'Secret', value: secret ? 'Yes' : 'No' }
          )
          .setTimestamp()

        await interaction.reply({
          embeds: [embed],
          ephemeral: true,
        })
      } catch (error) {
        console.error('Error creating achievement:', error)
        await interaction.reply({
          content: 'Something went wrong while creating the achievement.',
          ephemeral: true,
        })
      }
    } else if (subcommand === 'award') {
      // Handle awarding an achievement to a user
      try {
        const user = interaction.options.getUser('user')
        const achievementName = interaction.options.getString('achievement')

        const userData = await User.findOne({ where: { user_id: user.id } })
        const achievement = await Achievement.findOne({
          where: { name: achievementName },
        })

        if (!userData || !achievement) {
          return interaction.reply('User or achievement not found.')
        }

        // Check if the user already has the achievement
        const existingAward = await UserAchievement.findOne({
          where: {
            userId: userData.user_id,
            achievementId: achievement.id,
          },
        })

        if (existingAward) {
          return interaction.reply('User already has this achievement.')
        }

        // Award the achievement
        await UserAchievement.create({
          userId: userData.user_id,
          achievementId: achievement.id,
        })

        // Award fate points
        userData.fate_points += achievement.secret ? 20 : 10
        await userData.save()

        return interaction.reply(
          `Achievement **${achievement.name}** awarded to ${
            user.username
          }, along with ${achievement.secret ? 20 : 10} fate points!`
        )
      } catch (error) {
        console.error('Error awarding achievement:', error)
        return interaction.reply('There was an error awarding the achievement.')
      }
    } else if (subcommand === 'view') {
      // Handle viewing achievements (all achievements or user-specific)
      try {
        const user = interaction.options.getUser('user')

        if (user) {
          // If a user is provided, show their earned achievements
          const userData = await User.findOne({
            where: { user_id: user.id },
            include: [
              {
                model: Achievement,
                through: { attributes: [] }, // Exclude UserAchievement details
              },
            ],
          })

          if (!userData || userData.Achievements.length === 0) {
            return interaction.reply(`${user.username} has no achievements.`)
          }

          const achievementsList = userData.Achievements.map(
            (ach) => ach.name
          ).join(', ')

          return interaction.reply(
            `${user.username} has earned the following achievements: ${achievementsList}`
          )
        } else {
          // If no user is provided, show all available achievements
          const achievements = await Achievement.findAll()

          if (achievements.length === 0) {
            return interaction.reply('No achievements have been created yet.')
          }

          const achievementsList = achievements
            .map((ach) => ach.name)
            .join(', ')

          return interaction.reply(
            `All available achievements: ${achievementsList}`
          )
        }
      } catch (error) {
        console.error('Error viewing achievements:', error)
        return interaction.reply('There was an error viewing the achievements.')
      }
    }
  },
}
