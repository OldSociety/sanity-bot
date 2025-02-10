const { SlashCommandBuilder, EmbedBuilder } = require('discord.js')
const { User, Inventory } = require('../../Models/model.js')
const { Op } = require('sequelize')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Manage and interact with the shop.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add-item')
        .setDescription('Admins: Add an item to the shop.')
        .addStringOption((option) =>
          option.setName('name').setDescription('Item name').setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('description')
            .setDescription('Item description')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('image')
            .setDescription('Item image URL')
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName('cost')
            .setDescription('Item cost in Fate Points')
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName('stock')
            .setDescription('Item stock (-1 for infinite)')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove-item')
        .setDescription('Admins: Remove an item from the shop.')
        .addIntegerOption((option) =>
          option
            .setName('id')
            .setDescription('Item ID to remove')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('restock')
        .setDescription('Admins: Restock an item in the shop.')
        .addIntegerOption((option) =>
          option
            .setName('id')
            .setDescription('Item ID to restock')
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName('amount')
            .setDescription('New stock count (-1 for infinite)')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('Displays all available shop items.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('buy')
        .setDescription('Purchase an item from the shop.')
        .addIntegerOption((option) =>
          option
            .setName('id')
            .setDescription('Item ID to buy')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const allowedChannelIds = [
      process.env.HELLBOUNDCHANNELID,
      process.env.BOTTESTCHANNELID,
    ]

    if (!allowedChannelIds.includes(interaction.channel.id)) {
      return interaction.reply({
        content: `This command can only be used in  <#${allowedChannelIds[0]}>.`,
        ephemeral: true,
      })
    }

    console.log(
      `Received /shop command: ${interaction.options.getSubcommand()}`
    )

    const member = interaction.member
    const isAdmin = member.roles.cache.has(process.env.ADMINROLEID)
    const subcommand = interaction.options.getSubcommand()
    const itemId = interaction.options.getInteger('id')

    console.log(`Subcommand: ${subcommand} | Item ID: ${itemId || 'N/A'}`)

    try {
      if (subcommand === 'add-item') {
        if (!isAdmin) {
          console.log(
            `Unauthorized add-item attempt by ${interaction.user.username}.`
          )
          return interaction.reply({
            content: 'Only admins can add items.',
            ephemeral: true,
          })
        }

        const itemName = interaction.options.getString('name')
        const description = interaction.options.getString('description')
        const image = interaction.options.getString('image')
        const cost = interaction.options.getInteger('cost')
        const stock = interaction.options.getInteger('stock')

        console.log(`Adding item: ${itemName}, Cost: ${cost}, Stock: ${stock}`)

        const newItem = await Inventory.create({
          name: itemName,
          description,
          image_url: image,
          cost,
          stock,
          is_active: stock !== 0,
        })

        console.log(`Item added successfully:`, newItem.toJSON())

        return interaction.reply({
          content: `Item **${itemName}** added to the shop.`,
          ephemeral: true,
        })
      }

      if (subcommand === 'remove-item') {
        if (!isAdmin)
          return interaction.reply({
            content: 'Only admins can remove items.',
            ephemeral: true,
          })

        console.log(`Attempting to remove item ID: ${itemId}`)
        const deleted = await Inventory.destroy({ where: { id: itemId } })
        if (!deleted) {
          console.log(`Item ID ${itemId} not found.`)
          return interaction.reply({
            content: 'Item not found.',
            ephemeral: true,
          })
        }

        console.log(`Item ID ${itemId} removed successfully.`)
        return interaction.reply({
          content: `Item ID **${itemId}** removed from the shop.`,
          ephemeral: true,
        })
      }

      if (subcommand === 'restock') {
        if (!isAdmin)
          return interaction.reply({
            content: 'Only admins can restock items.',
            ephemeral: true,
          })

        const newStock = interaction.options.getInteger('amount')
        console.log(`Restocking item ID ${itemId} to ${newStock} units.`)

        const updated = await Inventory.update(
          { stock: newStock }, // Directly updating stock
          { where: { id: itemId } }
        )

        if (!updated[0])
          return interaction.reply({
            content: 'Item not found.',
            ephemeral: true,
          })

        console.log(`Item ID ${itemId} restocked successfully.`)
        return interaction.reply({
          content: `Item ID **${itemId}** restocked to **${newStock}** units.`,
          ephemeral: true,
        })
      }

      if (subcommand === 'list') {
        console.log(`Fetching shop inventory.`)

        // Fetch items where stock > 0 or stock = -1 (infinite)
        const items = await Inventory.findAll({
          where: {
            stock: { [Op.or]: { [Op.gt]: 0, [Op.eq]: -1 } },
          },
        })

        if (items.length === 0) {
          console.log(`No items found in shop.`)
          return interaction.reply({
            content: 'The shop is empty.',
            ephemeral: true,
          })
        }
        let userData = await User.findOne({
          where: { user_id: interaction.user.id },
        })
        if (!userData) {
          console.log(
            `User ${interaction.user.id} not found. Creating new entry.`
          )
          userData = await User.create({
            user_id: interaction.user.id,
            user_name: interaction.user.username,
            fate_points: 0,
            bank: 0,
          })
        }
        const embed = new EmbedBuilder()
          .setTitle('🛒 Meridian Campaign Setting Shop')
          .setDescription('Use `/shop buy <item id>` to purchase an item.')
          .setColor('#FFD700')
          .setFooter({
            text: `Current Fate: ${userData.fate_points}`,
          })

        items.forEach((item) => {
          embed.addFields({
            name: `${item.id}. ${item.name} - **<:fatePoints:1338569506640887919>${item.cost}**`,
            value: `${item.description}\nStock: ${
              item.stock === -1 ? 'Infinite' : item.stock
            }`,
            inline: false,
          })
        })

        console.log(`Sending shop inventory embed.`)
        return interaction.reply({ embeds: [embed] })
      }

      if (subcommand === 'buy') {
        console.log(
          `User ${interaction.user.username} attempting to buy item ID: ${itemId}`
        )
        const item = await Inventory.findOne({
          where: {
            id: itemId,
            stock: { [Op.or]: { [Op.gt]: 0, [Op.eq]: -1 } }, // Only allow purchase if stock is >0 or infinite (-1)
          },
        })

        if (!item) {
          console.log(`Item ID ${itemId} not found or out of stock.`)
          return interaction.reply({
            content: 'Item not found or out of stock.',
            ephemeral: true,
          })
        }

        let userData = await User.findOne({
          where: { user_id: interaction.user.id },
        })
        if (!userData) {
          console.log(
            `User ${interaction.user.id} not found. Creating new entry.`
          )
          userData = await User.create({
            user_id: interaction.user.id,
            user_name: interaction.user.username,
            fate_points: 0,
            bank: 0,
          })
        }

        if (userData.fate_points < item.cost) {
          console.log(
            `User ${interaction.user.username} does not have enough Fate Points.`
          )
          return interaction.reply({
            content: 'Not enough Fate Points.',
            ephemeral: true,
          })
        }

        // Deduct cost and update user
        userData.fate_points -= item.cost
        await userData.save()

        // Reduce stock only if it's not infinite (-1)
        if (item.stock > 0) {
          item.stock -= 1
          await item.save()
        }

        console.log(
          `User ${interaction.user.username} successfully purchased item ID ${itemId}.`
        )

        // Validate the image URL before using setImage()
        const embed = new EmbedBuilder()
          .setTitle('🎉 Purchase Successful')
          .setColor('#00FF00')
          .setDescription(
            `${interaction.user.username}  bought **${item.name}** for **${item.cost}** Fate Points.`
          )
          .setFooter({
            text: `Current Fate: ${userData.fate_points}`,
          })

        if (item.image_url && item.image_url.startsWith('http')) {
          embed.setImage(item.image_url)
        } else {
          console.warn(
            `Invalid image URL for item ID ${itemId}: ${item.image_url}`
          )
        }

        return interaction.reply({ embeds: [embed] })
      }
    } catch (error) {
      console.error(`Error in /shop command:`, error)
      return interaction.reply({
        content: 'An error occurred while processing your request.',
        ephemeral: true,
      })
    }
  },
}
