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

    // Subcommand for deleting achievements
    .addSubcommand((subcommand) =>
      subcommand
        .setName('delete')
        .setDescription('Delete an achievement from the list')
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
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand()
    console.log(`Subcommand triggered: ${subcommand}`)

    // Check permissions for all subcommands (except view)
    if (subcommand === 'view') {
      // View logic goes here (omitted for brevity)
    }

    // Subcommand: Award or Remove achievement
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

                userData.fate_points += achievement.secret ? 20 : 10
                await userData.save()

                await buttonInteraction.update({
                  content: `Achievement **${achievement.name}** awarded to **${
                    user.username
                  }**, along with ${achievement.secret ? 20 : 10} fate points!`,
                  components: [],
                })
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

                await UserAchievement.destroy({
                  where: {
                    userId: userData.user_id,
                    achievementId: achievement.id,
                  },
                })

                await buttonInteraction.update({
                  content: `Achievement **${achievement.name}** removed from ${user.username}.`,
                  components: [],
                })
              }
            } else {
              await buttonInteraction.update({
                content: 'Action cancelled.',
                components: [],
              })
            }

            // Remove dropdown and confirmation buttons
            await interaction.editReply({
              content: 'Action completed successfully.',
              components: [],
            })
          })

          buttonCollector.on('end', (collected) => {
            if (collected.size === 0) {
              interaction.editReply({
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
