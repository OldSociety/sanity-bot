const { SlashCommandBuilder, EmbedBuilder } = require('discord.js')
const { Achievement } = require('../../Models/model')

module.exports = {
  cooldown: 5,
  data: new SlashCommandBuilder()
    .setName('achievement')
    .setDescription('Manage achievements')
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
    ),

  async execute(interaction) {
    try {
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

      const member = interaction.member

      const isAdmin = member.roles.cache.has(process.env.ADMINROLEID)

      // Check if the user has the Unwanted role
      if (!hasUnwantedRole && !isAdmin) {
        await interaction.reply({
          content: 'You do not have permission to use this command.',
          ephemeral: true,
        })
        return
      }

      const subcommand = interaction.options.getSubcommand()
      // Extract options from the interaction
      const name = interaction.options.getString('name')
      const description = interaction.options.getString('description')
      const secret = interaction.options.getBoolean('secret')

      // Automatically assign fate points: 20 for secret achievements, 10 for non-secret
      const points = secret ? 20 : 10

      // Create the new achievement in the database
      const achievement = await Achievement.create({
        name,
        description,
        points,
        secret,
      })

      // Create an embed to display the achievement creation success
      const embed = new EmbedBuilder()
        .setTitle(`${name} Achievement Created`)
        .addFields(
          { name: 'Name', value: name },
          { name: 'Description', value: description },
          { name: 'Secret', value: secret ? 'Yes' : 'No' }
        )
        .setTimestamp()

      // Send the confirmation embed
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
  },
}
