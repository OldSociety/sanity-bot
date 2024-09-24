const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require('discord.js')
const { Achievement, User, UserAchievement } = require('../../Models/model')

module.exports = {
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
    const allowedChannelIds = [
        process.env.HELLBOUNDCHANNELID,
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
      const userId = interaction.user.id
      const member = interaction.member
  
      const isAdmin = member.roles.cache.has(process.env.ADMINROLEID)
      const hasUnwantedRole = member.roles.cache.has(process.env.UNWANTEDROLEID)
  
      // Check if the user has the Unwanted role
      if (!hasUnwantedRole && !isAdmin) {
        await interaction.reply({
          content: 'You do not have permission to use this command.',
          ephemeral: true,
        })
        return
      }
    const subcommand = interaction.options.getSubcommand()

    if (subcommand === 'create') {
      // Handle the creation of a new achievement
      try {
        const isAdmin = member.roles.cache.has(process.env.ADMINROLEID)
    
        // Check if the user has the Unwanted role
        if (!hasUnwantedRole && !isAdmin) {
          await interaction.reply({
            content: 'You do not have permission to use this command.',
            ephemeral: true,
          })
          return
        }
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
    } else if (subcommand === 'award' || subcommand === 'remove') {
      // Handle awarding or removing an achievement
      try {
        const isAdmin = member.roles.cache.has(process.env.ADMINROLEID)
    
        // Check if the user has the Unwanted role
        if (!hasUnwantedRole && !isAdmin) {
          await interaction.reply({
            content: 'You do not have permission to use this command.',
            ephemeral: true,
          })
          return
        }
        const user = interaction.options.getUser('user')

        // Fetch all available achievements for drop-down
        const achievements = await Achievement.findAll()

        if (!achievements || achievements.length === 0) {
          return interaction.reply('No achievements have been created yet.')
        }

        // Create drop-down menu with available achievements
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

        // Handle the select menu interaction
        const filter = (i) =>
          i.customId === 'select-achievement' &&
          i.user.id === interaction.user.id

        const collector = interaction.channel.createMessageComponentCollector({
          filter,
          time: 15000, // 15 seconds to select
        })

        collector.on('collect', async (i) => {
          const achievementId = i.values[0] // Get selected achievement ID
          const achievement = await Achievement.findByPk(achievementId)
          const userData = await User.findOne({ where: { user_id: user.id } })

          if (!userData || !achievement) {
            return i.reply('User or achievement not found.')
          }

          if (subcommand === 'award') {
            // Award the achievement to the user
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
            // Remove the achievement from the user
            const isAdmin = member.roles.cache.has(process.env.ADMINROLEID)
           
        
            // Check if the user has the Unwanted role
            if (!hasUnwantedRole && !isAdmin) {
              await interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true,
              })
              return
            }
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
    } else if (subcommand === 'view') {
      // Handle viewing achievements (all achievements or user-specific)
      try {
        const user = interaction.options.getUser('user')

        if (user) {
          const userData = await User.findOne({
            where: { user_id: user.id },
            include: [
              {
                model: Achievement,
                through: { attributes: [] },
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
