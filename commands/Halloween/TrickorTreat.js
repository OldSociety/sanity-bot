const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
  } = require('discord.js')
  
  module.exports = {
    data: new SlashCommandBuilder()
      .setName('spooky')
      .setDescription('Choose between a Trick or a Treat!')
      .addSubcommand(subcommand =>
        subcommand
          .setName('trick')
          .setDescription('Receive a spooky trick!')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('treat')
          .setDescription('Receive a sweet treat!')
      ),
  
    async execute(interaction) {
      const subcommand = interaction.options.getSubcommand()
      console.log(`Spooky command triggered: ${subcommand}`)
  
      await interaction.deferReply()
  
      if (subcommand === 'trick') {
        const trickEmbed = new EmbedBuilder()
          .setTitle('👻 Trick!')
          .setDescription('You have chosen a trick! Prepare for some spooky surprises...')
          .setColor(0xFF0000)
          .setTimestamp()
  
        await interaction.editReply({ embeds: [trickEmbed] })
      } else if (subcommand === 'treat') {
        const treatEmbed = new EmbedBuilder()
          .setTitle('🍬 Treat!')
          .setDescription('You have chosen a treat! Enjoy your sweet rewards...')
          .setColor(0x00FF00)
          .setTimestamp()
  
        await interaction.editReply({ embeds: [treatEmbed] })
      } else {
        await interaction.editReply('Something went wrong with your selection.')
      }
    },
  }
  