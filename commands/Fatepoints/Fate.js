const { SlashCommandBuilder, EmbedBuilder } = require('discord.js')
const { User } = require('../../Models/model.js') // Adjust according to your project structure

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fate')
    .setDescription('Interact with your fate points.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add-fate')
        .setDescription('Add fate points to yourself.')
        .addIntegerOption((option) =>
          option
            .setName('points')
            .setDescription('The number of fate points to add')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reroll')
        .setDescription('Automatically deduct 10 fate points if possible.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('balance')
        .setDescription('Check your fate points and bank balance.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('manage')
        .setDescription('Admins: Manage fate points and bank of any user.')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The user to manage')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('action')
            .setDescription('Choose an action')
            .setRequired(true)
            .addChoices(
              { name: 'set-fate', value: 'set-fate' },
              { name: 'set-bank', value: 'set-bank' }
            )
        )
        .addIntegerOption((option) =>
          option
            .setName('amount')
            .setDescription('Amount of points to set or add')
            .setRequired(true)
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
    const isBooster = member.roles.cache.has(process.env.BOOSTERROLEID)
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

    // Fetch or create user data
    let userData = await User.findOne({ where: { user_id: userId } })
    if (!userData) {
      userData = await User.create({
        user_id: userId,
        user_name: interaction.user.username,
        chat_exp: 0,
        chat_level: 1,
        bank: 0,
        fate_points: 0,
        last_chat_message: new Date(),
      })
    }


    if (subcommand === 'add-fate') {
      // Implement cooldown for regular users
      const pointsToAdd = interaction.options.getInteger('points')

      let fatePoints = userData.fate_points
      let bank = userData.bank

      // Calculate new fate points and bank
      let totalFatePoints = fatePoints + pointsToAdd
      let excessPoints = 0

      if (totalFatePoints > 100) {
        excessPoints = totalFatePoints - 100
        fatePoints = 100
      } else {
        fatePoints = totalFatePoints
      }

      if (totalFatePoints < 0 ) {
        const errorEmbed = new EmbedBuilder()
          .setColor('#FF0000') // Red for error messages
          .setTitle('Error')
          .setDescription('Fate points cannot drop below 0.')

        await interaction.reply({ embeds: [errorEmbed], ephemeral: true })
        return
      }

      if (excessPoints > 0 && (isBooster || isAdmin)) {
        bank += excessPoints
        if (bank > 100) {
          bank = 100
        }
      }

      userData.fate_points = fatePoints
      userData.bank = bank
      await userData.save()

      let description = `You have added ${pointsToAdd} fate points.`
      if (excessPoints > 0 && (isBooster || isAdmin)) {
        description += `\nExcess points added to your bank.`
      } else if (excessPoints > 0) {
        description += `\nYou have reached the cap of 100 fate points. Excess points were not added.`
      }

      const successEmbed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('Fate Points Awarded')
        .setDescription(description)
        .addFields(
          { name: 'Fate', value: `${userData.fate_points}`, inline: true },
          { name: 'Bank', value: `${userData.bank}`, inline: true },
          {
            name: 'Total',
            value: `${userData.fate_points + userData.bank}`,
            inline: true,
          }
        )

      await interaction.reply({ embeds: [successEmbed] })
    } else if (subcommand === 'roll') {
      let pointsDeducted = 0
      let source = ''

      if (userData.bank >= 10) {
        // Deduct from bank first if available
        userData.bank -= 10
        pointsDeducted = 10
        source = 'banked fate points'
      } else if (userData.fate_points >= 10) {
        // Deduct from fate points if bank is insufficient
        userData.fate_points -= 10
        pointsDeducted = 10
        source = 'fate points'
      } else {
        const errorEmbed = new EmbedBuilder()
          .setColor('#FF0000') // Red for error messages
          .setTitle('Error')
          .setDescription('Not enough fate points.')

        await interaction.reply({ embeds: [errorEmbed], ephemeral: true })
        return
      }

      await userData.save()

      const rollEmbed = new EmbedBuilder()
        .setColor('#FFFF00') // Yellow for neutral informative messages
        .setTitle('Fate Points Deducted')
        .setDescription(
          `${pointsDeducted} ${source} deducted for rolling fate.`
        )
        .addFields(
          { name: 'Fate', value: `${userData.fate_points}`, inline: true },
          { name: 'Bank', value: `${userData.bank}`, inline: true },
          {
            name: 'Total',
            value: `${userData.fate_points + userData.bank}`,
            inline: true,
          }
        )

      await interaction.reply({ embeds: [rollEmbed] })
    } else if (subcommand === 'balance') {
      // Existing balance logic remains unchanged
      const balanceEmbed = new EmbedBuilder()
        .setColor('#00FF00') // Green for balance
        .setTitle('Your Balance')
        .setDescription(`Your current fate point balances.`)
        .addFields(
          { name: 'Fate', value: `${userData.fate_points}`, inline: true },
          { name: 'Bank', value: `${userData.bank}`, inline: true },
          {
            name: 'Total',
            value: `${userData.fate_points + userData.bank}`,
            inline: true,
          }
        )

      await interaction.reply({ embeds: [balanceEmbed] })
    } else if (subcommand === 'manage') {
      // Existing manage logic remains unchanged
      if (!isAdmin) {
        await interaction.reply({
          content: 'You do not have permission to use this command.',
          ephemeral: true,
        })
        return
      }

      const targetUser = interaction.options.getUser('user')
      const action = interaction.options.getString('action')
      const amount = interaction.options.getInteger('amount')

      let targetData = await User.findOne({ where: { user_id: targetUser.id } })
      if (!targetData) {
        // Create user data for the target user if it doesn't exist
        targetData = await User.create({
          user_id: targetUser.id,
          user_name: targetUser.username,
          chat_exp: 0,
          chat_level: 1,
          bank: 0,
          fate_points: 0,
          last_chat_message: new Date(),
        })
      }

      if (['set-fate', 'set-bank'].includes(action)) {
        let description = ''
        let capped = false
        if (action === 'set-fate') {
          targetData.fate_points = amount
          if (targetData.fate_points > 100) {
            targetData.fate_points = 100
            capped = true
          }
          description = `Set ${targetUser.username}'s fate points to ${targetData.fate_points}.`
        } else if (action === 'set-bank') {
          targetData.bank = amount
          if (targetData.bank > 100) {
            targetData.bank = 100
            capped = true
          }
          description = `Set ${targetUser.username}'s bank to ${targetData.bank}.`
        }

        await targetData.save()

        if (capped) {
          description += `\nNote: The value was capped at 100.`
        }

        const manageEmbed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('User Updated')
          .setDescription(description)
          .addFields(
            {
              name: 'Fate',
              value: `${targetData.fate_points}`,
              inline: true,
            },
            { name: 'Bank', value: `${targetData.bank}`, inline: true },
            {
              name: 'Total',
              value: `${targetData.fate_points + targetData.bank}`,
              inline: true,
            }
          )

        await interaction.reply({ embeds: [manageEmbed], ephemeral: true })
      } else {
        const errorEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('Error')
          .setDescription('Invalid action.')

        await interaction.reply({ embeds: [errorEmbed], ephemeral: true })
      }
    }
  },
}
