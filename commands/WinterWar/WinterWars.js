// ./commands/WinterWars.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js')
const { WinterWar } = require('../../Models/model')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('winterwars')
    .setDescription('Join the Winter Wars game!')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('register')
        .setDescription('Register to join Winter Wars.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('status').setDescription('Check your game stats.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('attack')
        .setDescription('Throw a snowball at another player.')
        .addUserOption((option) =>
          option
            .setName('target')
            .setDescription('The player to attack.')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('position')
            .setDescription('The position to aim for (left, center, right).')
            .setRequired(true)
            .addChoices(
              { name: 'Left', value: 'Left' },
              { name: 'Center', value: 'Center' },
              { name: 'Right', value: 'Right' }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('snow')
        .setDescription('Check how much snow you have accumulated.')
    ),

  async execute(interaction) {
    const allowedChannelIds = [
      process.env.WINTERWARCHANNELID,
      process.env.BOTTESTCHANNELID,
    ]

    // Check if the command was used in the correct channel
    if (!allowedChannelIds.includes(interaction.channel.id)) {
      await interaction.reply({
        content: `This command can only be used in <#${allowedChannelIds[0]}>.`,
        ephemeral: true,
      })
      return
    }

    const { user, options } = interaction
    const subcommand = options.getSubcommand()

    try {
      // Handle the "register" subcommand
      if (subcommand === 'register') {
        const existingPlayer = await WinterWar.findOne({
          where: { discordId: user.id },
        })
        if (existingPlayer) {
          return interaction.reply({
            content: '✅ You are already registered for Winter Wars!',
            ephemeral: true,
          })
        }

        // Register the player
        await WinterWar.create({
          discordId: user.id,
          team: Math.random() < 0.5 ? 'Frost' : 'Blizzard', // Randomly assign a team
        })

        return interaction.reply({
          content:
            '🎉 You have been registered for Winter Wars! Let the snowball fights begin!',
          ephemeral: true,
        })
      }

      // Handle the "status" subcommand
      if (subcommand === 'status') {
        const player = await WinterWar.findOne({
          where: { discordId: user.id },
        })
        if (!player) {
          return interaction.reply({
            content:
              '❌ You are not registered for Winter Wars. Use `/winterwars register` to join!',
            ephemeral: true,
          })
        }

        const embed = new EmbedBuilder()
          .setTitle(`${user.username}'s Winter Wars Stats`)
          .setDescription(
            `**Team:** ${player.team}\n` +
              `**Snow:** ${player.snow}\n` +
              `**Stamina:** ${player.stamina}\n` +
              `**War Points:** ${player.warPoints}\n` +
              `**Position:** ${player.position}`
          )
          .setColor(0x00aaff)
          .setTimestamp()

        return interaction.reply({ embeds: [embed] })
      }

      // Handle the "snow" subcommand
      if (subcommand === 'snow') {
        const player = await WinterWar.findOne({
          where: { discordId: user.id },
        })
        if (!player) {
          return interaction.reply({
            content:
              '❌ You are not registered for Winter Wars. Use `/winterwars register` to join!',
            ephemeral: true,
          })
        }

        return interaction.reply({
          content: `❄️ You currently have **${player.snow} snow** available.`,
          ephemeral: true,
        })
      }

      // Handle the "attack" subcommand
      if (subcommand === 'attack') {
        const target = options.getUser('target')
        const position = options.getString('position')

        if (target.id === user.id) {
          return interaction.reply({
            content: '❌ You cannot attack yourself!',
            ephemeral: true,
          })
        }

        const attacker = await WinterWar.findOne({
          where: { discordId: user.id },
        })
        const defender = await WinterWar.findOne({
          where: { discordId: target.id },
        })

        if (!attacker) {
          return interaction.reply({
            content:
              '❌ You are not registered for Winter Wars. Use `/winterwars register` to join!',
            ephemeral: true,
          })
        }

        if (!defender) {
          return interaction.reply({
            content: '❌ The target player is not registered for Winter Wars.',
            ephemeral: true,
          })
        }

        // Logic for calculating the attack goes here (e.g., damage, snowball cost, etc.)

        return interaction.reply({
          content: `❄️ You threw a snowball at ${target.username}, aiming for ${position}!`,
          ephemeral: false,
        })
      }
    } catch (error) {
      console.error('❌ Error handling Winter Wars command:', error)
      return interaction.reply({
        content: '❌ An error occurred while executing this command.',
        ephemeral: true,
      })
    }
  },
}
