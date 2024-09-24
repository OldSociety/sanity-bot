const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
} = require('discord.js')
const { Achievement } = require('../../Models/model')
const { checkPermissions } = require('../../utils/checkPermissions')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('achievement')
    .setDescription('Create or delete achievements')

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
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand()
    const isAdmin = await checkPermissions(interaction, process.env.ADMINROLEID)
    if (!isAdmin) return

    // Subcommand: Create achievement
    if (subcommand === 'create') {
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
  },
}
