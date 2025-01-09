const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
} = require('discord.js')
const {
  WinterWar,
  WinterMonster,
  Inventory,
  BaseItem,
} = require('../../Models/model.js')

const STAT_BOOSTS = [
  { threshold: 750, multiplier: 16 },
  { threshold: 700, multiplier: 15 },
  { threshold: 650, multiplier: 14 },
  { threshold: 600, multiplier: 13 },
  { threshold: 550, multiplier: 12 },
  { threshold: 500, multiplier: 11 },
  { threshold: 450, multiplier: 9.75 },
  { threshold: 400, multiplier: 8.5 },
  { threshold: 350, multiplier: 7.5 },
  { threshold: 300, multiplier: 6.5 },
  { threshold: 250, multiplier: 5.5 },
  { threshold: 200, multiplier: 4.5 },
  { threshold: 125, multiplier: 3 },
  { threshold: 85, multiplier: 2.5 },
  { threshold: 55, multiplier: 2 },
  { threshold: 35, multiplier: 1.5 },
  { threshold: 20, multiplier: 1.25 },
  { threshold: 13, multiplier: 1 },
  { threshold: 8, multiplier: 0.75 },
  { threshold: 0, multiplier: 0.5 },
]

async function getOrCreatePlayer(userId) {
  try {
    let player = await WinterWar.findOne({ where: { userId } })
    if (!player) {
      player = await WinterWar.create({
        userId,
        hp: 5,
        strength: 5,
        defense: 5,
        agility: 5,
        statPoints: 10,
        war_points: 100,
      })
    }
    return player
  } catch (error) {
    console.error(`Error in getOrCreatePlayer: ${error.message}`)
    throw new Error('Could not retrieve or create player.')
  }
}

function getBoostMultiplier(stat) {
  for (const boost of STAT_BOOSTS) {
    if (stat >= boost.threshold) {
      return boost.multiplier
    }
  }
  return 0.5
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('winterwars')
    .setDescription('Manage your Winter Wars account or fight monsters!')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('account')
        .setDescription('View or allocate stats for your Winter Wars account.')
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('fight').setDescription('Fight a winter monster!')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('inventory')
        .setDescription('View and manage your inventory.')
        .addStringOption((option) =>
          option
            .setName('type')
            .setDescription('Filter by item type.')
            .addChoices(
              { name: 'Weapons', value: 'weapon' },
              { name: 'Defense', value: 'defense' },
              { name: 'Consumables', value: 'consumable' }
            )
        )
    ),

  async execute(interaction) {
    const allowedChannels = [
      process.env.WINTERCHANNELID,
      process.env.BOTTESTCHANNELID,
    ]

    if (!allowedChannels.includes(interaction.channel.id)) {
      await interaction.reply({
        content: `❄️ This command can only be used in the designated Winter Wars channels.`,
        ephemeral: true,
      })
      return
    }

    const userId = interaction.user.id
    const subcommand = interaction.options.getSubcommand()

    if (subcommand === 'account') {
      const player = await getOrCreatePlayer(userId)

      const equippedItems = await Inventory.findAll({
        where: { winterWarId: player.id, equipped: true },
        include: { model: BaseItem, as: 'item' },
        logging: console.log,
      })

      const equippedWeapons = equippedItems
        .filter((item) => item.item.type === 'weapon')
        .map((item) => item.item.name)

      const equippedDefense = equippedItems
        .filter((item) => item.item.type === 'defense')
        .map((item) => item.item.name)

      const generateStatEmbed = () => {
        let description =
          `**HP:** ${player.hp}\n` +
          `**Strength:** ${player.strength}\n` +
          `**Defense:** ${player.defense}\n` +
          `**Agility:** ${player.agility}\n\n**Equipped Items:**\n` +
          `- Weapons: ${equippedWeapons.join(', ') || 'None'}\n` +
          `- Defense: ${equippedDefense.join(', ') || 'None'}\n`

        if (player.statPoints > 0) {
          description =
            `Welcome to Winter Wars! You have **${player.statPoints} points** to distribute among the following stats:\n\n` +
            `**HP:** How much damage you can take before defeat.\n` +
            `**Strength:** How much damage you deal to enemies.\n` +
            `**Defense:** How much damage you can block.\n` +
            `**Agility:** How fast you act and dodge attacks.\n` +
            `Use the buttons below to allocate your points!\n\n` +
            description +
            `\n**Unallocated Points:** ${player.statPoints}\n\n`
        }

        return new EmbedBuilder()
          .setTitle(`${interaction.user.username}'s Winter Wars Account`)
          .setDescription(description)
          .setFooter({ text: `❄️${player.war_points} War Points` })
          .setColor('Blue')
      }

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('hp')
          .setLabel('HP +1')
          .setStyle('Primary'),
        new ButtonBuilder()
          .setCustomId('strength')
          .setLabel('Strength +1')
          .setStyle('Primary'),
        new ButtonBuilder()
          .setCustomId('defense')
          .setLabel('Defense +1')
          .setStyle('Primary'),
        new ButtonBuilder()
          .setCustomId('agility')
          .setLabel('Agility +1')
          .setStyle('Primary')
      )

      const components = player.statPoints > 0 ? [actionRow] : []

      try {
        await interaction.reply({
          embeds: [generateStatEmbed()],
          components,
          ephemeral: true,
        })
      } catch (error) {
        console.error(`Error sending reply: ${error.message}`)
      }

      if (player.statPoints > 0) {
        const collector = interaction.channel.createMessageComponentCollector({
          filter: (i) => i.user.id === userId,
          time: 60000,
        })

        collector.on('collect', async (btnInteraction) => {
          const stat = btnInteraction.customId

          if (player.statPoints > 0) {
            await player.increment(stat, { by: 1 })
            await player.decrement('statPoints', { by: 1 })
            await player.reload()
          }

          await btnInteraction.update({
            embeds: [generateStatEmbed()],
            components: player.statPoints > 0 ? [actionRow] : [],
          })

          if (player.statPoints === 0) {
            collector.stop()
          }
        })

        collector.on('end', async () => {
          await interaction.editReply({
            components: [],
          })
        })
      }
    } else if (subcommand === 'inventory') {
      const itemType = interaction.options.getString('type') // Now required
      const player = await getOrCreatePlayer(userId)

      const inventoryItems = await Inventory.findAll({
        where: { winterWarId: player.id },
        include: { model: BaseItem, as: 'item' },
      })

      // Filter items based on type
      let filteredItems = inventoryItems.filter(
        (item) => item.item.type === itemType
      )

      if (!filteredItems.length) {
        await interaction.reply({
          content: `No items found in the '${itemType}' category.`,
          ephemeral: true,
        })
        return
      }

      const itemsPerPage = 10
      let currentPage = 0

      const createEmbed = (page) => {
        const paginatedItems = filteredItems.slice(
          page * itemsPerPage,
          (page + 1) * itemsPerPage
        )

        const embed = new EmbedBuilder()
          .setTitle(`${interaction.user.username}'s Inventory (${itemType})`)
          .setColor('Green')
          .setFooter({
            text: `Page ${page + 1} of ${Math.ceil(
              filteredItems.length / itemsPerPage
            )}`,
          })

        paginatedItems.forEach((item, index) => {
          const details = []

          // Add damage details if the item deals damage
          if (item.item.damageMin && item.item.damageMax) {
            const avgDamage = (item.item.damageMin + item.item.damageMax) / 2
            details.push(
              `• Damage: ${avgDamage} (${item.item.damageType || 'Physical'})`
            )
          }

          // Add healing details if the item heals
          if (item.item.healing) {
            details.push(`• Healing: ${item.item.healing}`)
          }

          // Add defense details if the item provides defense
          if (item.item.defense) {
            details.push(
              `• Defense: ${item.item.defense} (${
                item.item.damageType || 'General'
              })`
            )
          }

          // Show equipped status for non-consumables
          if (itemType !== 'consumable') {
            details.push(`• Equipped: ${item.equipped ? 'Yes' : 'No'}`)
          }

          embed.addFields({
            name: `${index + 1 + page * itemsPerPage}. ${item.item.name} ${
              item.equipped ? '✅' : ''
            }`,
            value: details.length ? details.join('\n') : 'No additional stats.',
            inline: false,
          })
        })

        return embed
      }

      const getPaginationButtons = (page) =>
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('previous')
            .setLabel('Previous')
            .setStyle('Secondary')
            .setDisabled(page === 0),
          new ButtonBuilder()
            .setCustomId('next')
            .setLabel('Next')
            .setStyle('Secondary')
            .setDisabled((page + 1) * itemsPerPage >= filteredItems.length),
          new ButtonBuilder()
            .setCustomId('finish')
            .setLabel('Finish')
            .setStyle('Danger')
        )

      const createDropdown = (page) => {
        const paginatedItems = filteredItems.slice(
          page * itemsPerPage,
          (page + 1) * itemsPerPage
        )

        const options = paginatedItems.map((item) => ({
          label: `${item.item.name} ${item.equipped ? '✅ Equipped' : ''}`,
          description: item.item.type,
          value: `${item.id}`, // Use the inventory ID for unique selection
        }))

        return new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('equip_dropdown')
            .setPlaceholder('Select an item to equip/unequip')
            .addOptions(options)
        )
      }

      let canEquip = itemType === 'weapon' || itemType === 'defense'

      await interaction.reply({
        embeds: [createEmbed(currentPage)],
        components: [
          getPaginationButtons(currentPage, canEquip),
          ...(canEquip ? [createDropdown(currentPage)] : []),
        ],
        ephemeral: true,
      })

      const collector = interaction.channel.createMessageComponentCollector({
        time: 60000,
      })

      collector.on('collect', async (interaction) => {
        if (interaction.user.id !== userId) {
          await interaction.reply({
            content: "This interaction isn't for you.",
            ephemeral: true,
          })
          return
        }

        const action = interaction.customId

        if (action === 'finish') {
          await interaction.update({
            content: 'Inventory management session finished.',
            components: [],
          })
          collector.stop('finished')
          return
        }

        if (action === 'previous') {
          currentPage = Math.max(currentPage - 1, 0)
          await interaction.update({
            embeds: [createEmbed(currentPage)],
            components: [
              getPaginationButtons(currentPage, canEquip),
              ...(canEquip ? [createDropdown(currentPage)] : []),
            ],
          })
          return
        }

        if (action === 'next') {
          currentPage = Math.min(
            currentPage + 1,
            Math.ceil(filteredItems.length / itemsPerPage) - 1
          )
          await interaction.update({
            embeds: [createEmbed(currentPage)],
            components: [
              getPaginationButtons(currentPage, canEquip),
              ...(canEquip ? [createDropdown(currentPage)] : []),
            ],
          })
          return
        }

        if (action === 'equip_dropdown') {
          const selectedItemId = interaction.values[0]
          const selectedItem = filteredItems.find(
            (item) => item.id.toString() === selectedItemId
          )

          if (!selectedItem) {
            await interaction.reply({
              content: 'Selected item not found.',
              ephemeral: true,
            })
            return
          }

          if (selectedItem.equipped) {
            await Inventory.update(
              { equipped: false },
              { where: { id: selectedItem.id } }
            )

            await interaction.reply({
              content: `Unequipped ${selectedItem.item.name}.`,
              ephemeral: true,
            })
          } else {
            const itemType = selectedItem.item.type

            // Ensure only one weapon or defense is equipped
            if (itemType === 'weapon' || itemType === 'defense') {
              await Inventory.update(
                { equipped: false },
                {
                  where: {
                    winterWarId: player.id,
                    equipped: true,
                  },
                  include: {
                    model: BaseItem,
                    as: 'item',
                    where: { type: itemType },
                  },
                }
              )
            }

            // Equip the selected item
            await Inventory.update(
              { equipped: true },
              { where: { id: selectedItem.id } }
            )

            await interaction.reply({
              content: `Equipped ${selectedItem.item.name}.`,
              ephemeral: true,
            })
          }

          // Refresh filteredItems to reflect changes
          filteredItems = await Inventory.findAll({
            where: { winterWarId: player.id },
            include: { model: BaseItem, as: 'item' },
          })

          // Update components dynamically
          await interaction.followUp({
            embeds: [createEmbed(currentPage)],
            components: [
              getPaginationButtons(currentPage, canEquip),
              ...(canEquip ? [createDropdown(currentPage)] : []),
            ],
            ephemeral: true,
          })
        }
      })

      collector.on('end', async () => {
        await interaction.editReply({
          components: [],
        })
      })
    } else if (subcommand === 'fight') {
      // Fetch player data
      const player = await WinterWar.findOne({ where: { userId } })
      if (!player) {
        await interaction.reply({
          content:
            '❄️ You need to create an account first! Use `/winterwars account`.',
          ephemeral: true,
        })
        return
      }

      // Fetch equipped items
      const equippedItems = await Inventory.findAll({
        where: { winterWarId: player.id, equipped: true },
        include: { model: BaseItem, as: 'item' },
      })

      const equippedWeapons = equippedItems.filter(
        (item) => item.item.type === 'weapon'
      )
      const equippedDefenseItems = equippedItems.filter(
        (item) => item.item.type === 'defense'
      )

      // Select a random monster
      try {
        const monster = await WinterMonster.findOne({
          order: sequelize.random(),
        })
        if (!monster) {
          await interaction.reply({
            content: '❄️ No monsters available. Please try again later!',
            ephemeral: true,
          })
          return
        }
      } catch (error) {
        console.error(`Error fetching monster: ${error.message}`)
        await interaction.reply({
          content:
            'An error occurred while starting the battle. Please try again later.',
          ephemeral: true,
        })
        return
      }

      // Battle state setup
      const battleState = {
        playerHP: player.hp,
        monsterHP: monster.hp,
        history: [],
        turn: 'player',
        defenseModifier: 1,
      }

      // Agility-Based Damage Swing Logic
      const calculateDamageWithAgility = (
        damageMin,
        damageMax,
        attackerAgility,
        defenderAgility
      ) => {
        const maxEffect = 0.9 // Cap agility effect at 90%
        const k = 0.01 // Scaling constant

        const attackerEffect = maxEffect * (1 - Math.exp(-k * attackerAgility))
        const defenderEffect = maxEffect * (1 - Math.exp(-k * defenderAgility))

        const effectiveSwing = attackerEffect - defenderEffect
        const damageRange = damageMax - damageMin

        return Math.floor(damageMin + damageRange * (0.5 + effectiveSwing / 2))
      }

      // Generate battle embed
      const generateBattleEmbed = () =>
        new EmbedBuilder()
          .setTitle(`Battle: ${interaction.user.username} vs ${monster.name}`)
          .setDescription(
            `❄️ **Your HP:** ${battleState.playerHP}
      🔥 **${monster.name} HP:** ${battleState.monsterHP}
      
      ` +
              `**Battle History:**
      ${battleState.history.slice(-5).join('\n') || 'No actions yet.'}`
          )
          .setColor('Blue')

      // Create action buttons
      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('attack')
          .setLabel('Attack')
          .setStyle('Primary'),
        new ButtonBuilder()
          .setCustomId('fierce_attack')
          .setLabel('Fierce Attack')
          .setStyle('Danger')
      )

      equippedWeapons.forEach((weapon, index) => {
        actionRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`weapon_${index}`)
            .setLabel(`Use ${weapon.item.name}`)
            .setStyle('Secondary')
        )
      })

      // Reply with the initial battle state
      try {
        await interaction.reply({
          embeds: [generateBattleEmbed()],
          components: [actionRow],
          ephemeral: true,
        })
      } catch (error) {
        console.error(`Error sending reply: ${error.message}`)
      }

      // Monster Turn Logic
      const monsterTurn = async () => {
        const monsterAttack = calculateDamageWithAgility(
          monster.damageMin,
          monster.damageMax,
          monster.agility,
          player.agility
        )

        const finalDamage = Math.max(
          monsterAttack -
            player.defense *
              getBoostMultiplier(player.defense) *
              battleState.defenseModifier,
          1
        )

        battleState.playerHP -= finalDamage
        battleState.history.push(
          `${monster.name} attacks ${interaction.user.username} for ${finalDamage} damage!`
        )

        if (battleState.playerHP <= 0) {
          collector.stop('defeat')
          return
        }

        battleState.defenseModifier = 1
        battleState.turn = 'player'
        await interaction.editReply({ embeds: [generateBattleEmbed()] })
      }

      // Button interaction collector
      const collector = interaction.channel.createMessageComponentCollector({
        filter: (i) => i.user.id === userId,
        time: 60000,
      })

      collector.on('collect', async (btnInteraction) => {
        if (battleState.turn !== 'player') {
          await btnInteraction.reply({
            content: 'It’s not your turn!',
            ephemeral: true,
          })
          return
        }

        const action = btnInteraction.customId

        if (action === 'attack') {
          const playerAttack = calculateDamageWithAgility(
            equippedWeapons[0]?.item.damageMin || player.strength,
            equippedWeapons[0]?.item.damageMax || player.strength * 2,
            player.agility,
            monster.agility
          )

          const finalDamage = Math.max(
            playerAttack -
              monster.defense * getBoostMultiplier(monster.defense),
            1
          )

          battleState.monsterHP -= finalDamage
          battleState.history.push(
            `${interaction.user.username} attacks ${monster.name} for ${finalDamage} damage!`
          )
        } else if (action === 'fierce_attack') {
          const playerAttack =
            calculateDamageWithAgility(
              player.strength,
              player.strength * 2,
              player.agility,
              monster.agility
            ) * 1.5

          const finalDamage = Math.max(
            playerAttack -
              monster.defense * getBoostMultiplier(monster.defense),
            1
          )

          battleState.monsterHP -= finalDamage
          battleState.defenseModifier = 0.5 // Reduce player's defense for next monster attack
          battleState.history.push(
            `${interaction.user.username} uses a fierce attack on ${monster.name} for ${finalDamage} damage!`
          )
        } else if (action.startsWith('weapon_')) {
          const weaponIndex = parseInt(action.split('_')[1], 10)
          const weapon = equippedWeapons[weaponIndex].item

          const weaponAttack = calculateDamageWithAgility(
            weapon.damageMin,
            weapon.damageMax,
            player.agility,
            monster.agility
          )

          battleState.monsterHP -= weaponAttack
          battleState.history.push(
            `${interaction.user.username} uses ${weapon.name} to deal ${weaponAttack} damage to ${monster.name}!`
          )
        }

        if (battleState.monsterHP <= 0) {
          collector.stop('victory')
          return
        }

        battleState.turn = 'monster'
        await btnInteraction.update({ embeds: [generateBattleEmbed()] })
        await monsterTurn()
      })

      collector.on('end', async (collected, reason) => {
        const resultEmbed = new EmbedBuilder().setTitle('Battle Result')

        if (reason === 'victory') {
          resultEmbed
            .setDescription(`🎉 You defeated ${monster.name}!`)
            .setColor('Green')
          await player.increment('war_points', { by: 10 })
        } else if (reason === 'defeat') {
          resultEmbed
            .setDescription(`💔 You were defeated by ${monster.name}.`)
            .setColor('Red')
        } else {
          resultEmbed
            .setDescription('⏳ The battle ended due to inactivity.')
            .setColor('Grey')
        }

        await interaction.editReply({ embeds: [resultEmbed], components: [] })
      })
    }
  },
}
