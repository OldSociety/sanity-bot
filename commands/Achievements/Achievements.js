const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  EmbedBuilder,
  ButtonStyle,
} = require('discord.js')
const { Achievement, User, UserAchievement } = require('../../Models/model')
const checkPermissions = require('../../utils/checkPermissions')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('achievement')
    .setDescription('Manage achievements')

    // Subcommand for creating achievements
    .addSubcommand((subcommand) =>
      subcommand
        .setName('create')
        .setDescription('ADMIN: Create a new achievement')
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

    // Subcommand for deleting achievements
    .addSubcommand((subcommand) =>
      subcommand
        .setName('delete')
        .setDescription('ADMIN: Delete an achievement from the list')
    )

    // Subcommand for awarding achievements to users
    .addSubcommand((subcommand) =>
      subcommand
        .setName('award')
        .setDescription('ADMIN: Award an achievement to a user')
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
        .setDescription('ADMIN: Remove an achievement from a user')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The user to remove the achievement from')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand()
    console.log(`Subcommand triggered: ${subcommand}`)
    // Check permissions for all subcommands except 'view'
    if (subcommand !== 'view') {
      const permissionGranted = await checkPermissions(
        interaction,
        process.env.ADMINROLEID // Admin role ID for permission checking
      )
      if (!permissionGranted) return
    }
    // View achievements command
    if (subcommand === 'view') {
      try {
        const user = interaction.options.getUser('user') // Retrieve the user option
        const embed = new EmbedBuilder().setColor(0x00ff00).setTimestamp()

        // Check if user is null and set default title
        if (user) {
          embed.setTitle(`**${user.username}**'s Achievements`)

          // Retrieve user's achievements
          const userData = await User.findOne({
            where: { user_id: user.id },
            include: [{ model: Achievement, through: { attributes: [] } }],
          })

          if (!userData || userData.Achievements.length === 0) {
            embed.setDescription(`${user.username} has no achievements.`)
            return interaction.reply({ embeds: [embed], ephemeral: true })
          }

          // Show all achievements earned by the user, including secret ones
          userData.Achievements.forEach((ach) => {
            embed.addFields({
              name: ach.name,
              value: ach.secret
                ? `(Secret) ${ach.description}`
                : ach.description,
            })
          })
        } else {
          // If no user provided, set a default title
          embed.setTitle('All Achievements')

          // Get all non-secret achievements
          const nonSecretAchievements = await Achievement.findAll({
            where: { secret: false },
          })

          // Get all secret achievements if the user is an admin
          const isAdmin = interaction.member.roles.cache.has(
            process.env.ADMINROLEID
          )
          let secretAchievements = []

          if (isAdmin) {
            secretAchievements = await Achievement.findAll({
              where: { secret: true },
            })
          }

          // Check if there are any achievements at all
          if (
            nonSecretAchievements.length === 0 &&
            secretAchievements.length === 0
          ) {
            embed.setDescription('No achievements have been created yet.')
            return interaction.reply({ embeds: [embed], ephemeral: true })
          }

          // Add non-secret achievements to the embed
          nonSecretAchievements.forEach((ach) => {
            embed.addFields({ name: ach.name, value: ach.description })
          })

          // Add secret achievements to the embed if the user is an admin
          if (secretAchievements.length > 0) {
            embed.addFields({
              name: '\u200B',
              value: '**Secret Achievements**',
            })
            secretAchievements.forEach((ach) => {
              embed.addFields({
                name: ach.name,
                value: `(Secret) ${ach.description}`,
              })
            })
          }
        }

        // Return the embed to the user
        return interaction.reply({ embeds: [embed], ephemeral: true })
      } catch (error) {
        console.error('Error viewing achievements:', error)
        return interaction.reply({
          content: 'Error retrieving achievements.',
          ephemeral: true,
        })
      }
    }

    // Subcommand: Create achievement
    else if (subcommand === 'create') {
      try {
        const name = interaction.options.getString('name')
        const description = interaction.options.getString('description')
        const secret = interaction.options.getBoolean('secret')

        // Check for duplicates
        const existingAchievement = await Achievement.findOne({
          where: { name },
        })

        if (existingAchievement) {
          return interaction.reply({
            content: `An achievement with the name **${name}** already exists.`,
            ephemeral: true,
          })
        }

        // Create the achievement
        await Achievement.create({
          name,
          description,
          secret,
        })

        await interaction.reply({
          content: `Achievement **${name}** has been created successfully!`,
          ephemeral: true,
        })
      } catch (error) {
        console.error('Error creating achievement:', error)
        await interaction.reply({
          content: 'Something went wrong while creating the achievement.',
          ephemeral: true,
        })
      }
    }

    // Subcommand: Delete achievement
    else if (subcommand === 'delete') {
      try {
        const achievements = await Achievement.findAll()

        if (!achievements || achievements.length === 0) {
          return interaction.reply({
            content: 'No achievements have been created yet.',
            ephemeral: true,
          })
        }

        // Create a dropdown menu with available achievements for deletion
        const achievementOptions = achievements.map((achievement) => ({
          label: achievement.name,
          description: achievement.description,
          value: achievement.id.toString(),
        }))

        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('select-delete-achievement')
            .setPlaceholder('Select an achievement to delete')
            .addOptions(achievementOptions)
        )

        await interaction.reply({
          content: 'Please select an achievement to delete:',
          components: [row],
          ephemeral: true,
        })

        const filter = (i) =>
          i.customId === 'select-delete-achievement' &&
          i.user.id === interaction.user.id
        const collector = interaction.channel.createMessageComponentCollector({
          filter,
          time: 15000,
        })

        collector.on('collect', async (i) => {
          const achievementId = i.values[0]
          const achievement = await Achievement.findByPk(achievementId)

          if (!achievement) {
            return i.update({
              content: 'Achievement not found.',
              components: [],
            })
          }

          // Confirmation before deletion
          const confirmationRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('confirm-delete')
              .setLabel('Confirm')
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId('cancel-delete')
              .setLabel('Cancel')
              .setStyle(ButtonStyle.Secondary)
          )

          await i.update({
            content: `Are you sure you want to delete the achievement **${achievement.name}**?`,
            components: [confirmationRow],
            ephemeral: true,
          })

          const buttonFilter = (buttonInteraction) =>
            ['confirm-delete', 'cancel-delete'].includes(
              buttonInteraction.customId
            ) && buttonInteraction.user.id === interaction.user.id

          const buttonCollector = i.channel.createMessageComponentCollector({
            filter: buttonFilter,
            time: 10000, // Timeout after 10 seconds
          })

          buttonCollector.on('collect', async (buttonInteraction) => {
            if (buttonInteraction.customId === 'confirm-delete') {
              await achievement.destroy()
              await buttonInteraction.update({
                content: `Achievement **${achievement.name}** has been deleted.`,
                components: [],
              })
            } else {
              await buttonInteraction.update({
                content: 'Deletion cancelled.',
                components: [],
              })
            }

            // Stop the collectors
            collector.stop()
            buttonCollector.stop()
          })

          buttonCollector.on('end', (collected) => {
            if (collected.size === 0) {
              i.update({
                content: 'No action taken.',
                components: [],
              })
            }
          })
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
        console.error('Error deleting achievement:', error)
        return interaction.reply({
          content: 'There was an error deleting the achievement.',
          ephemeral: true,
        })
      }
    }

    // Award or Remove achievement command
    else if (subcommand === 'award' || subcommand === 'remove') {
      try {
        const user = interaction.options.getUser('user')
        const userData = await User.findOne({
          where: { user_id: user.id },
          include: [{ model: Achievement, through: { attributes: [] } }],
        })

        if (!userData) {
          return interaction.reply({
            content: 'User not found.',
            ephemeral: true,
          })
        }

        // Filter achievements for the "remove" subcommand
        let achievements = []
        if (subcommand === 'remove') {
          achievements = userData.Achievements
          if (achievements.length === 0) {
            return interaction.reply({
              content: `${user.username} has no achievements to remove.`,
              ephemeral: true,
            })
          }
        } else {
          achievements = await Achievement.findAll()
        }

        if (!achievements || achievements.length === 0) {
          return interaction.reply({
            content: `No achievements available for ${
              subcommand === 'remove' ? 'removal' : 'award'
            }.`,
            ephemeral: true,
          })
        }

        // Create a dropdown menu with filtered achievements
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

          if (!achievement) {
            return i.update({
              content: 'Achievement not found.',
              components: [],
            })
          }

          const confirmationRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('confirm-achievement')
              .setLabel('Confirm')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId('cancel-achievement')
              .setLabel('Cancel')
              .setStyle(ButtonStyle.Secondary)
          )

          await i.update({
            content: `Are you sure you want to ${
              subcommand === 'award' ? 'award' : 'remove'
            } the achievement **${achievement.name}** ${
              subcommand === 'award' ? 'to' : 'from'
            } ${user.username}?`,
            components: [confirmationRow],
            ephemeral: true,
          })

          const buttonFilter = (buttonInteraction) =>
            ['confirm-achievement', 'cancel-achievement'].includes(
              buttonInteraction.customId
            ) && buttonInteraction.user.id === interaction.user.id

          const buttonCollector = i.channel.createMessageComponentCollector({
            filter: buttonFilter,
            time: 10000, // Timeout after 10 seconds
          })

          buttonCollector.on('collect', async (buttonInteraction) => {
            if (buttonInteraction.customId === 'confirm-achievement') {
              if (subcommand === 'award') {
                // Award the achievement
                const member = interaction.member
                const isBooster = member.roles.cache.has(
                  process.env.BOOSTERROLEID
                )
                let overflow = 0

                let bank = userData.bank || 0 // Ensure bank is defined

                const alreadyHasAchievement = userData.Achievements.some(
                  (ach) => ach.id === achievement.id
                )

                if (alreadyHasAchievement) {
                  return buttonInteraction.update({
                    content: `User **${user.username}** already has the achievement **${achievement.name}**.`,
                    components: [],
                  })
                }

                await UserAchievement.create({
                  userId: userData.user_id,
                  achievementId: achievement.id,
                })

                let fatePointsGained = achievement.secret ? 20 : 10
                if (userData.fate_points > 100) {
                  overflow = userData.fate_points - 100
                  userData.fate_points = 100

                  if (isBooster) {
                    bank += overflow
                    if (bank > 100) {
                      bank = 100
                    }
                  } else {
                    fatePointsGained = additionalFatePoints - overflow
                  }
                }
                await userData.save()

                await buttonInteraction.update({
                  content: `Achievement **${achievement.name}** awarded to **${
                    user.username
                  }**, along with ${achievement.secret ? 20 : 10} fate points!`,
                  components: [],
                })
                // Announce the achievement publicly
                const publicEmbed = new EmbedBuilder()
                  .setTitle('🎉 Achievement Unlocked! 🎉')
                  .setDescription(
                    `**${user.username}** has earned **${
                      achievement.name
                    }** worth ${achievement.secret ? 20 : 10} fate points!`
                  )
                  .setColor(0xffd700)
                  .setTimestamp()

                await buttonInteraction.channel.send({ embeds: [publicEmbed] })
                buttonCollector.stop()
              } else if (subcommand === 'remove') {
                // Remove the achievement from the user
                const awardToRemove = await UserAchievement.findOne({
                  where: {
                    userId: userData.user_id,
                    achievementId: achievement.id,
                  },
                })
              
                if (!awardToRemove) {
                  return buttonInteraction.update({
                    content: 'User does not have this achievement.',
                    components: [],
                  })
                }
              
                // Calculate points to deduct
                const pointsToDeduct = achievement.secret ? 20 : 10
              
                // Deduct points from the bank first, then from fate_points
                if (userData.bank >= pointsToDeduct) {
                  userData.bank -= pointsToDeduct
                } else {
                  const remainder = pointsToDeduct - userData.bank
                  userData.bank = 0
                  userData.fate_points -= remainder
              
                  // Prevent negative fate points
                  if (userData.fate_points < 0) {
                    userData.fate_points = 0
                  }
                }
              
                await userData.save()
              
                // Remove the user achievement record
                await UserAchievement.destroy({
                  where: {
                    userId: userData.user_id,
                    achievementId: achievement.id,
                  },
                })
              
                await buttonInteraction.update({
                  content: `Achievement **${achievement.name}** removed from ${
                    user.username
                  }, and ${pointsToDeduct} fate points have been subtracted (first from the bank if available).`,
                  components: [],
                })
              }
              
            } else {
              await buttonInteraction.update({
                content: 'Action cancelled.',
                components: [],
              })
            }

            // Stop the collectors
            collector.stop()
            buttonCollector.stop()
          })

          buttonCollector.on('end', (collected) => {
            if (collected.size === 0) {
              i.update({
                content: 'No action taken.',
                components: [],
              })
            }
          })
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
        return interaction.reply({
          content: 'There was an error managing the achievement.',
          ephemeral: true,
        })
      }
    }
  },
}
