const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
} = require('discord.js')
const { Achievement, User, UserAchievement } = require('../../Models/model')
const checkPermissions  = require('../../utils/checkPermissions')

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
    )

    // Subcommand to view achievements
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
    console.log(`Subcommand triggered: ${subcommand}`)

    // Check permissions for all subcommands (except view)
    if (subcommand !== 'view') {
      const permissionGranted = await checkPermissions(
        interaction,
        process.env.ADMINROLEID
      )
      if (!permissionGranted) return
    }

    // Subcommand: Create achievement
    if (subcommand === 'create') {
      try {
        const name = interaction.options.getString('name')
        const description = interaction.options.getString('description')
        const secret = interaction.options.getBoolean('secret')

        // Check for duplicates
        const existingAchievement = await Achievement.findOne({
          where: { name },
        })
        const existingDescription = await Achievement.findOne({
          where: { description },
        })

        if (existingAchievement) {
          return interaction.reply({
            content: `An achievement with the name **${name}** already exists.`,
            ephemeral: true,
          })
        }

        if (existingDescription) {
          return interaction.reply({
            content: `An achievement with the description **${description}** already exists.`,
            ephemeral: true,
          })
        }

        // Create the achievement
        const achievement = await Achievement.create({
          name,
          description,
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
    }

    // Subcommand: Delete achievement
    else if (subcommand === 'delete') {
      try {
        const achievements = await Achievement.findAll()

        if (!achievements || achievements.length === 0) {
          return interaction.reply('No achievements have been created yet.')
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
            return i.reply('Achievement not found.')
          }

          await achievement.destroy()
          await i.reply(
            `Achievement **${achievement.name}** has been deleted from the list.`
          )
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
        return interaction.reply('There was an error deleting the achievement.')
      }
    }

    // Subcommand: Award or Remove achievement
    else if (subcommand === 'award' || subcommand === 'remove') {
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

    // Subcommand: View achievements
    else if (subcommand === 'view') {
      const permissionGranted = await checkPermissions(interaction);
      if (!permissionGranted) return;
    
      const user = interaction.options.getUser('user');
      const embed = new EmbedBuilder()
        .setTitle('Achievements')
        .setColor(0x00ff00)
        .setTimestamp();
    
      if (user) {
        const userData = await User.findOne({
          where: { user_id: user.id },
          include: [{ model: Achievement, through: { attributes: [] } }],
        });
    
        if (!userData || userData.Achievements.length === 0) {
          embed.setDescription(`${user.username} has no achievements.`);
          return interaction.reply({ embeds: [embed] });
        }
    
        const earnedAchievements = userData.Achievements.map((ach) => ({
          name: ach.name,
          description: ach.secret ? `(Secret) ${ach.description}` : ach.description,
        }));
    
        earnedAchievements.forEach((ach) => {
          embed.addFields({ name: ach.name, value: ach.description });
        });
    
        return interaction.reply({ embeds: [embed] });
      } else {
        // Get all non-secret achievements
        const nonSecretAchievements = await Achievement.findAll({
          where: { secret: false },
        });
    
        if (nonSecretAchievements.length === 0) {
          embed.setDescription('No achievements have been created yet.');
          return interaction.reply({ embeds: [embed] });
        }
    
        // Display non-secret achievements
        nonSecretAchievements.forEach((ach) => {
          embed.addFields({ name: ach.name, value: ach.description });
        });
    
        // Check if user is admin to display secret achievements
        const isAdmin = interaction.member.roles.cache.has(process.env.ADMINROLEID);
        if (isAdmin) {
          const secretAchievements = await Achievement.findAll({
            where: { secret: true },
          });
    
          if (secretAchievements.length > 0) {
            embed.addFields({ name: '\u200B', value: '**Achievements (Secret)**' });
            secretAchievements.forEach((ach) => {
              embed.addFields({ name: ach.name, value: `(Secret) ${ach.description}` });
            });
          }
        }
    
        return interaction.reply({ embeds: [embed] });
      }
    }
    
    
  },
}
