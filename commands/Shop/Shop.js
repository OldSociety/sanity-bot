const { SlashCommandBuilder, EmbedBuilder } = require('discord.js')
const { User, Inventory } = require('../../Models/model.js')
const { Op, literal } = require('sequelize')

// Helper function to generate a slug from a string.
const slugify = (text) =>
  text.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]+/g, '')

// Fetch available items (stock > 0 or infinite) sorted with infinite stock first, then by name.
const fetchAvailableItems = async () => {
  return await Inventory.findAll({
    where: {
      stock: { [Op.or]: { [Op.gt]: 0, [Op.eq]: -1 } },
    },
    order: [
      [literal("CASE WHEN stock = -1 THEN 0 ELSE 1 END"), 'ASC'],
      ['name', 'ASC']
    ]
  })
}

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
            .setName('number')
            .setDescription('Item number (as displayed in the shop list) to remove')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('restock')
        .setDescription('Admins: Restock an item in the shop.')
        .addIntegerOption((option) =>
          option
            .setName('number')
            .setDescription('Item number (as displayed in the shop list) to restock')
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
            .setName('number')
            .setDescription('Item number (as displayed in the shop list) to buy')
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
        content: `This command can only be used in <#${allowedChannelIds[0]}>.`,
        ephemeral: true,
      })
    }

    console.log(`Received /shop command: ${interaction.options.getSubcommand()}`)

    const member = interaction.member
    const isAdmin = member.roles.cache.has(
      process.env.ADMINROLEID || process.env.MODERATORROLEID
    )
    const subcommand = interaction.options.getSubcommand()

    try {
      if (subcommand === 'add-item') {
        if (!isAdmin) {
          console.log(`Unauthorized add-item attempt by ${interaction.user.username}.`)
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

        // Generate slug from the item name.
        const shopSlug = slugify(itemName)

        const newItem = await Inventory.create({
          name: itemName,
          slug: shopSlug,
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

      // For remove and restock, fetch all items without filtering by stock.
      const fetchAllSortedItems = async () => {
        return await Inventory.findAll({
          order: [
            [literal("CASE WHEN stock = -1 THEN 0 ELSE 1 END"), 'ASC'],
            ['name', 'ASC']
          ]
        })
      }

      if (subcommand === 'remove-item') {
        if (!isAdmin)
          return interaction.reply({
            content: 'Only admins can remove items.',
            ephemeral: true,
          })

        const number = interaction.options.getInteger('number')
        const items = await fetchAllSortedItems()
        if (number < 1 || number > items.length) {
          console.log(`Invalid item number: ${number}`)
          return interaction.reply({
            content: 'Item not found. Please check the shop list for the correct number.',
            ephemeral: true,
          })
        }
        const targetItem = items[number - 1]
        console.log(`Attempting to remove item: ${targetItem.name} (Slug: ${targetItem.slug})`)
        const deleted = await Inventory.destroy({ where: { slug: targetItem.slug } })
        if (!deleted) {
          console.log(`Item ${targetItem.slug} not found.`)
          return interaction.reply({
            content: 'Item not found.',
            ephemeral: true,
          })
        }

        console.log(`Item ${targetItem.slug} removed successfully.`)
        return interaction.reply({
          content: `Item **${targetItem.name}** removed from the shop.`,
          ephemeral: true,
        })
      }

      if (subcommand === 'restock') {
        if (!isAdmin)
          return interaction.reply({
            content: 'Only admins can restock items.',
            ephemeral: true,
          })

        const number = interaction.options.getInteger('number')
        const newStock = interaction.options.getInteger('amount')
        const items = await fetchAllSortedItems()
        if (number < 1 || number > items.length) {
          console.log(`Invalid item number: ${number}`)
          return interaction.reply({
            content: 'Item not found. Please check the shop list for the correct number.',
            ephemeral: true,
          })
        }
        const targetItem = items[number - 1]
        console.log(`Restocking item: ${targetItem.name} (Slug: ${targetItem.slug}) to ${newStock} units.`)

        const updated = await Inventory.update(
          { stock: newStock },
          { where: { slug: targetItem.slug } }
        )

        if (!updated[0])
          return interaction.reply({
            content: 'Item not found.',
            ephemeral: true,
          })

        console.log(`Item ${targetItem.slug} restocked successfully.`)
        return interaction.reply({
          content: `Item **${targetItem.name}** restocked to **${newStock}** units.`,
          ephemeral: true,
        })
      }

      if (subcommand === 'list') {
        console.log(`Fetching shop inventory.`)

        const items = await fetchAvailableItems()

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
          console.log(`User ${interaction.user.id} not found. Creating new entry.`)
          userData = await User.create({
            user_id: interaction.user.id,
            user_name: interaction.user.username,
            fate_points: 0,
            bank: 0,
          })
        }
        const embed = new EmbedBuilder()
          .setTitle('🛒 Meridian Campaign Setting Shop')
          .setDescription('Use `/shop buy <number>` to purchase an item.')
          .setColor('#FFD700')
          .setFooter({
            text: `Current Fate: ${userData.fate_points}`,
          })

        items.forEach((item, index) => {
          embed.addFields({
            name: `${index + 1}. ${item.name} - **<:fatePoints:1338569506640887919>${item.cost}**`,
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
        // Try to retrieve the option "number"; if null, fall back to "id"
        let number = interaction.options.getInteger('number')
        if (number === null) {
          number = interaction.options.getInteger('id')
        }
        console.log(`User ${interaction.user.username} attempting to buy item number: ${number}`)

        // Use the same ordering as in the list command.
        const items = await fetchAvailableItems()

        if (number === null || number < 1 || number > items.length) {
          console.log(`Invalid item number: ${number}`)
          return interaction.reply({
            content: 'Item not found. Please check the shop list for the correct number.',
            ephemeral: true,
          })
        }
        const targetItem = items[number - 1]

        let userData = await User.findOne({
          where: { user_id: interaction.user.id },
        })
        if (!userData) {
          console.log(`User ${interaction.user.id} not found. Creating new entry.`)
          userData = await User.create({
            user_id: interaction.user.id,
            user_name: interaction.user.username,
            fate_points: 0,
            bank: 0,
          })
        }

        if (userData.fate_points < targetItem.cost) {
          console.log(`User ${interaction.user.username} does not have enough Fate Points.`)
          return interaction.reply({
            content: 'Not enough Fate Points.',
            ephemeral: true,
          })
        }

        // Deduct cost and update user.
        userData.fate_points -= targetItem.cost
        await userData.save()

        // Reduce stock only if it's not infinite (-1).
        if (targetItem.stock > 0) {
          targetItem.stock -= 1
          await targetItem.save()
        }

        console.log(`User ${interaction.user.username} successfully purchased item: ${targetItem.name} (Slug: ${targetItem.slug}).`)

        const embed = new EmbedBuilder()
          .setTitle('🎉 Purchase Successful')
          .setColor('#00FF00')
          .setDescription(
            `${interaction.user.username} bought **${targetItem.name}** for **${targetItem.cost}** Fate Points.`
          )
          .setFooter({
            text: `Current Fate: ${userData.fate_points}`,
          })

        if (targetItem.image_url && targetItem.image_url.startsWith('http')) {
          embed.setImage(targetItem.image_url)
        } else {
          console.warn(
            `Invalid image URL for item ${targetItem.slug}: ${targetItem.image_url}`
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
