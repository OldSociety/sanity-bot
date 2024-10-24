const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  EmbedBuilder,
  ButtonStyle,
} = require('discord.js')
const fetch = 'node-fetch'.default
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
    // Subcommand for viewing achievements
    .addSubcommand((subcommand) =>
      subcommand
        .setName('view')
        .setDescription('ADMIN: Delete an achievement from the list')
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
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('upload')
        .setDescription('ADMIN: Upload achievements from a CSV file')
        .addAttachmentOption((option) =>
          option
            .setName('file')
            .setDescription('The CSV file containing achievements')
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
        const embedColor = 0x00ff00

        // Define helper function to create embeds
        const createEmbed = (title, fields, page, totalPages) => {
          const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor(embedColor)
            .setTimestamp()
            .addFields(fields)

          if (totalPages > 1) {
            embed.setFooter({ text: `Page ${page + 1} of ${totalPages}` })
          }
          return embed
        }

        // Check if user is null and set default title
        let achievementsData = []
        let title = ''
        if (user) {
          title = `**${user.username}**'s Achievements`

          // Retrieve user's achievements
          const userData = await User.findOne({
            where: { user_id: user.id },
            include: [{ model: Achievement, through: { attributes: [] } }],
          })

          if (!userData || userData.Achievements.length === 0) {
            const embed = new EmbedBuilder()
              .setTitle(title)
              .setColor(embedColor)
              .setDescription(`${user.username} has no achievements.`)
              .setTimestamp()
            return interaction.reply({ embeds: [embed], ephemeral: true })
          }

          // Prepare achievements data
          achievementsData = userData.Achievements.map((ach) => ({
            name: ach.name,
            value: ach.secret ? `(Secret) ${ach.description}` : ach.description,
          }))
        } else {
          // If no user provided, set a default title
          title = 'All Achievements'

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

          // Prepare achievements data
          achievementsData = [
            ...nonSecretAchievements.map((ach) => ({
              name: ach.name,
              value: ach.description,
            })),
            ...secretAchievements.map((ach) => ({
              name: ach.name,
              value: `(Secret) ${ach.description}`,
            })),
          ]

          if (achievementsData.length === 0) {
            const embed = new EmbedBuilder()
              .setTitle(title)
              .setColor(embedColor)
              .setDescription('No achievements have been created yet.')
              .setTimestamp()
            return interaction.reply({ embeds: [embed], ephemeral: true })
          }
        }

        // Split achievements into groups of 10 for the embed
        const pageSize = 10
        const totalPages = Math.ceil(achievementsData.length / pageSize)
        const embeds = []

        for (let i = 0; i < totalPages; i++) {
          const fields = achievementsData.slice(
            i * pageSize,
            (i + 1) * pageSize
          )
          const embed = createEmbed(title, fields, i, totalPages)
          embeds.push(embed)
        }

        // Handling pagination with buttons
        let currentPage = 0

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('previous')
            .setLabel('Previous')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage === 0),
          new ButtonBuilder()
            .setCustomId('next')
            .setLabel('Next')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage >= totalPages - 1)
        )

        await interaction.reply({
          embeds: [embeds[currentPage]],
          components: [row],
          ephemeral: true,
        })

        const collector = interaction.channel.createMessageComponentCollector({
          filter: (i) => i.user.id === interaction.user.id,
          time: 60000, // 1-minute timeout
        })

        collector.on('collect', async (i) => {
          if (i.customId === 'previous' && currentPage > 0) {
            currentPage--
          } else if (i.customId === 'next' && currentPage < totalPages - 1) {
            currentPage++
          }

          // Update embed and buttons
          row.components[0].setDisabled(currentPage === 0)
          row.components[1].setDisabled(currentPage >= totalPages - 1)

          await i.update({ embeds: [embeds[currentPage]], components: [row] })
        })

        collector.on('end', () => {
          row.components.forEach((button) => button.setDisabled(true))
          interaction.editReply({ components: [row] })
        })
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

                // Add fate points based on the achievement
                let fatePointsGained = achievement.secret ? 20 : 10

                if (userData.fate_points >= 100) {
                  // Handle fate points overflow
                  overflow = userData.fate_points - 100
                  userData.fate_points = 100

                  if (isBooster) {
                    bank += overflow
                    if (bank > 100) {
                      bank = 100 // Cap the bank to 100 if overflowing
                    }
                  } else {
                    fatePointsGained = additionalFatePoints - overflow // Adjust points if not a booster
                  }
                } else {
                  // Add the gained fate points
                  userData.fate_points += fatePointsGained

                  // Cap the fate points to 100 if it exceeds the maximum
                  if (userData.fate_points > 100) {
                    overflow = userData.fate_points - 100
                    userData.fate_points = 100

                    if (isBooster) {
                      bank += overflow
                      if (bank > 100) {
                        bank = 100
                      }
                    }
                  }
                }

                // Save updated user data (fate points and bank)
                userData.bank = bank // Save updated bank value
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
                  content: `Achievement **${achievement.name}** removed from ${user.username}, and ${pointsToDeduct} fate points have been subtracted (first from the bank if available).`,
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
    } else if (subcommand === 'upload') {
      console.log('Upload command triggered.')

      const file = interaction.options.getAttachment('file')

      // Defer reply to prevent interaction timeout
      try {
        await interaction.deferReply({ ephemeral: true })
      } catch (error) {
        console.error('Error deferring reply:', error)
        return
      }

      if (!file.name.endsWith('.csv')) {
        return interaction.editReply({
          content: 'Please upload a valid CSV file (must end in .csv).',
        })
      }

      try {
        // Dynamically import `node-fetch` to avoid module issues
        const fetch = (await import('node-fetch')).default

        // Fetch the file from the provided URL
        const response = await fetch(file.url)

        if (!response.ok) {
          return interaction.editReply({
            content:
              'There was an error retrieving the file. Please try again.',
          })
        }

        // Convert the response to text (since CSV is text-based)
        const csvData = await response.text()

        // Parse the CSV data using PapaParse
        const Papa = require('papaparse')
        const parsedData = Papa.parse(csvData, {
          header: true,
          skipEmptyLines: true,
        })

        if (parsedData.errors.length > 0) {
          console.error('Errors while parsing CSV:', parsedData.errors)
          return interaction.editReply({
            content:
              'There was an error processing the CSV file. Please check the format.',
          })
        }

        console.log('Parsed data from CSV:', parsedData.data)

        // Process data for achievements
        let createdCount = 0

        for (const row of parsedData.data) {
          // Adjust the column names to match the format of your CSV files
          const { name, description, secret } = row

          if (name && description && secret !== undefined) {
            const existingAchievement = await Achievement.findOne({
              where: { name: name.trim() },
            })

            if (!existingAchievement) {
              await Achievement.create({
                name: name.trim(),
                description: description.trim(),
                secret: secret.trim().toLowerCase() === 'true',
              })
              createdCount++
            }
          }
        }

        // Clean up after processing
        return interaction.editReply({
          content: `Successfully created ${createdCount} new achievements from the uploaded CSV file!`,
        })
      } catch (error) {
        console.error('Error uploading achievements:', error)
        return interaction.editReply({
          content:
            'There was an error uploading the achievements. Please try again.',
        })
      }
    }
  },
}
