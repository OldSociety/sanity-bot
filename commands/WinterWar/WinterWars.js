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

// Function to determine the first turn
const determineFirstTurn = (playerAgility, monsterAgility) => {
  const totalAgility = playerAgility + monsterAgility

  // Calculate player and monster probabilities
  const playerChance = playerAgility / totalAgility
  const monsterChance = monsterAgility / totalAgility

  // Generate a random number to determine first turn
  const randomValue = Math.random()
  return randomValue < playerChance ? 'player' : 'monster'
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
      // process.env.WINTERCHANNELID,
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
      let itemType = interaction.options.getString('type') // Initial type
      const player = await getOrCreatePlayer(userId)

      const inventoryItems = await Inventory.findAll({
        where: { winterWarId: player.id },
        include: { model: BaseItem, as: 'item' },
      })

      const damageTypeEmojis = {
        physical: '✊', // Sword
        cold: '❄️', // Snowflake
        fire: '🔥', // Fire
        water: '🌊', // Wave
        acid: '☣️', // Test tube
        earth: '🪨', // Earth globe
      }

      const filterItems = () =>
        inventoryItems.filter((item) => item.item.type === itemType)

      let filteredItems = filterItems()
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
            text: `Equipped: ${player.equippedCount}/2 | Page ${
              page + 1
            } of ${Math.ceil(filteredItems.length / itemsPerPage)}`,
          })

        paginatedItems.forEach((item, index) => {
          const details = []

          if (item.item.damageMin && item.item.damageMax) {
            const avgDamage = (item.item.damageMin + item.item.damageMax) / 2

            // Fetch the emoji and label for the damage type
            const damageEmoji =
              damageTypeEmojis[item.item.damageType] ||
              damageTypeEmojis['physical']
            const damageTypeLabel = item.item.damageType
              ? `${item.item.damageType
                  .charAt(0)
                  .toUpperCase()}${item.item.damageType.slice(1)}`
              : 'Physical' // Default to Physical if no type is specified

            // Push formatted damage detail to details array
            details.push(
              `• Damage: ${Math.floor(
                avgDamage
              )} ${damageTypeLabel} ${damageEmoji}`
            )
          }

          if (item.item.healing) {
            details.push(`• Healing: ${item.item.healing}`)
          }

          if (item.item.defense) {
            details.push(
              `• Defense: ${item.item.defense} (${
                item.item.damageType || 'General'
              })`
            )
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

      const createButtons = (page) => {
        const typeSwitchButton = new ButtonBuilder()
          .setCustomId('switch_type')
          .setLabel(
            itemType === 'weapon'
              ? 'Switch to Defense'
              : itemType === 'defense'
              ? 'Switch to Consumables'
              : 'Switch to Weapons'
          )
          .setStyle(
            itemType === 'weapon'
              ? 'Primary'
              : itemType === 'defense'
              ? 'Secondary'
              : 'Success'
          )

        return new ActionRowBuilder().addComponents(
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
          typeSwitchButton,
          new ButtonBuilder()
            .setCustomId('finish')
            .setLabel('Finish')
            .setStyle('Danger')
        )
      }

      const createDropdown = (page) => {
        const paginatedItems = filteredItems.slice(
          page * itemsPerPage,
          (page + 1) * itemsPerPage
        )

        const options = paginatedItems.map((item) => ({
          label: `${item.item.name} ${item.equipped ? '✅ Equipped' : ''}`,
          description: item.item.type,
          value: `${item.id}`,
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
          createButtons(currentPage),
          ...(canEquip ? [createDropdown(currentPage)] : []),
        ],
        ephemeral: true,
      })

      const collector = interaction.channel.createMessageComponentCollector({
        time: 60000,
      })

      collector.on('collect', async (btnInteraction) => {
        try {
          if (btnInteraction.user.id !== interaction.user.id) {
            await btnInteraction.reply({
              content: "This interaction isn't for you.",
              ephemeral: true,
            })
            return
          }

          await btnInteraction.deferUpdate()

          if (btnInteraction.customId === 'finish') {
            collector.stop('finished')
            await interaction.editReply({
              content: 'Inventory management session ended.',
              components: [],
            })
            return
          }

          if (btnInteraction.customId === 'switch_type') {
            itemType =
              itemType === 'weapon'
                ? 'defense'
                : itemType === 'defense'
                ? 'consumable'
                : 'weapon'

            filteredItems = filterItems()
            currentPage = 0
          } else if (btnInteraction.customId === 'previous') {
            currentPage = Math.max(currentPage - 1, 0)
          } else if (btnInteraction.customId === 'next') {
            currentPage = Math.min(
              currentPage + 1,
              Math.ceil(filteredItems.length / itemsPerPage) - 1
            )
          } else if (btnInteraction.customId === 'equip_dropdown') {
            const selectedItemId = btnInteraction.values[0]
            const selectedItem = filteredItems.find(
              (item) => item.id.toString() === selectedItemId
            )

            if (!selectedItem) {
              await btnInteraction.followUp({
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
              await WinterWar.increment('equippedCount', {
                by: -1,
                where: { id: player.id },
              })

              // Update locally
              selectedItem.equipped = false
            } else {
              if (player.equippedCount >= 2) {
                await btnInteraction.followUp({
                  content: `You cannot equip more than 2 items at a time.`,
                  ephemeral: true,
                })
                return
              }

              await Inventory.update(
                { equipped: true },
                { where: { id: selectedItem.id } }
              )
              await WinterWar.increment('equippedCount', {
                by: 1,
                where: { id: player.id },
              })

              // Update locally
              selectedItem.equipped = true
            }

            player.equippedCount = await WinterWar.sum('equippedCount', {
              where: { id: player.id },
            })
          }

          // Update the embed with the local state
          await btnInteraction.editReply({
            embeds: [createEmbed(currentPage)],
            components: [
              createButtons(currentPage),
              ...(itemType === 'weapon' || itemType === 'defense'
                ? [createDropdown(currentPage)]
                : []),
            ],
          })
        } catch (error) {
          console.error('Error handling interaction:', error)
          if (!btnInteraction.replied) {
            await btnInteraction.reply({
              content: 'An error occurred. Please try again.',
              ephemeral: true,
            })
          }
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
      const damageTypeEmojis = {
        physical: '✊', // Sword
        cold: '❄️', // Snowflake
        fire: '🔥', // Fire
        water: '🌊', // Wave
        acid: '☣️', // Test tube
        earth: '🪨', // Earth globe
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
      let monster

      try {
        await interaction.deferReply({ ephemeral: true })

        // Fetch all monsters from the database
        const monsters = await WinterMonster.findAll()

        if (!monsters || monsters.length === 0) {
          await interaction.editReply({
            content: '❄️ No monsters available. Please try again later!',
          })
          return
        }

        // Select a random monster from the list
        const randomIndex = Math.floor(Math.random() * monsters.length)
        monster = monsters[randomIndex]

        if (!monster) {
          await interaction.editReply({
            content: '❄️ No monsters available. Please try again later!',
          })
          return
        }

        console.log(`Selected Monster: ${monster.name}`)

        // Inform the user about the battle start
        await interaction.editReply({
          content: `You are battling **${monster.name}**! Prepare for combat!`,
        })
      } catch (error) {
        console.error(`Error fetching monster: ${error.message}`)
        await interaction.editReply({
          content:
            'An error occurred while starting the battle. Please try again later.',
        })
        return
      }

      // Decide who gets the first turn based on agility
      const firstTurn = determineFirstTurn(player.agility, monster.agility)

      // Initialize battle state
      const battleState = {
        playerHP: player.hp,
        monsterHP: monster.hp,
        history: [],
        turn: firstTurn,
        defenseModifier: 1,
      }

      // Log the first turn in the battle history
      if (firstTurn === 'player') {
        battleState.history.push('🎯 You get the first attack!')
      } else {
        battleState.history.push(`🎯 ${monster.name} gets the first attack!`)
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
          .setTitle(`${monster.name}`)
          .setDescription(
            `❄️ **Your HP:** ${battleState.playerHP}
            🔥 **Enemy HP:** ${battleState.monsterHP}
            
            **Battle History:**
            ${battleState.history.slice(-5).join('\n') || 'No actions yet.'}`
          )
          .setColor('Blue')
          .setThumbnail(
            `https://raw.githubusercontent.com/OldSociety/sanity-bot/main/assets/${monster.url}.png`
          )

      const generateActionButtons = () => {
        const actionRow = new ActionRowBuilder()

        // Check if weapons are equipped
        if (equippedWeapons.length > 0) {
          equippedWeapons.forEach((weapon, index) => {
            // Calculate average damage (primary and secondary)
            const primaryAverage =
              (weapon.item.damageMin + weapon.item.damageMax) / 2
            const secondaryAverage =
              weapon.item.damage2Min && weapon.item.damage2Max
                ? (weapon.item.damage2Min + weapon.item.damage2Max) / 2
                : 0

            const totalAverage = Math.floor(primaryAverage + secondaryAverage)

            // Add a button for each weapon
            actionRow.addComponents(
              new ButtonBuilder()
                .setCustomId(`weapon_${index}`)
                .setLabel(`${weapon.item.name} [${totalAverage}]`)
                .setStyle('Secondary')
            )
          })
        } else {
          // Add fallback "Basic Attack" button if no weapons are equipped
          actionRow.addComponents(
            new ButtonBuilder()
              .setCustomId('basic_attack')
              .setLabel('Basic Attack')
              .setStyle('Primary')
          )
        }

        // Add the "Fierce Attack" button
        actionRow.addComponents(
          new ButtonBuilder()
            .setCustomId('fierce_attack')
            .setLabel('Fierce Attack')
            .setStyle('Danger')
        )

        return actionRow
      }

      // Reply with the initial battle state
      await interaction.editReply({
        embeds: [generateBattleEmbed()],
        components: [generateActionButtons()],
      })

      // Monster Turn Logic
      const monsterTurn = async () => {
        // Parse monster's attacks if stored as JSON
        const parsedAttacks =
          typeof monster.attacks === 'string'
            ? JSON.parse(monster.attacks)
            : monster.attacks

        // Filter attacks by specific conditions (e.g., player HP < 3)
        const prioritizedAttacks = parsedAttacks.filter((attack) => {
          // Example condition: Use high-damage attacks if player HP is low
          if (battleState.playerHP < 3 && attack.damageMax > 2) {
            return true
          }
          // Otherwise, keep all attacks available
          return true
        })

        let lastAttack = null // Track the last used attack
        let repeatCount = 0 // Track how many times the same attack is repeated

        const selectAttack = (attacks) => {
          // Adjust priorities based on repeat count
          const adjustedAttacks = attacks.map((attack) => {
            let adjustedPriority = attack.priority

            // Reduce priority if the attack was used repeatedly
            if (attack.name === lastAttack) {
              adjustedPriority = Math.max(1, attack.priority - repeatCount) // Avoid 0 priority
            }

            return {
              ...attack,
              adjustedPriority,
            }
          })

          // Calculate total priority
          const totalPriority = adjustedAttacks.reduce(
            (sum, attack) => sum + attack.adjustedPriority,
            0
          )

          // Generate a random number between 0 and totalPriority
          const randomValue = Math.random() * totalPriority

          // Weighted random selection
          let cumulativePriority = 0
          for (const attack of adjustedAttacks) {
            cumulativePriority += attack.adjustedPriority
            if (randomValue <= cumulativePriority) {
              // Update last attack and repeat count
              if (attack.name === lastAttack) {
                repeatCount++
              } else {
                lastAttack = attack.name
                repeatCount = 1
              }
              return attack
            }
          }

          // Fallback: Return the last attack (should never happen in practice)
          return adjustedAttacks[adjustedAttacks.length - 1]
        }

        // Use the function to select an attack
        const chosenAttack = selectAttack(prioritizedAttacks)

        // Calculate raw attack damage
        const monsterAttack = calculateDamageWithAgility(
          chosenAttack.damageMin,
          chosenAttack.damageMax,
          monster.agility,
          player.agility
        )

        // Calculate type-specific defense
        let totalDefense = 0

        // Check for type-specific defense items equipped by the player
        for (const item of equippedItems) {
          if (item.damageType === chosenAttack.damageType) {
            totalDefense += item.defense
          }
        }

        // Fallback to default player defense if no type-specific defense applies
        if (totalDefense === 0) {
          totalDefense = player.defense * getBoostMultiplier(player.defense)
        }

        const effectivePlayerDefense =
          player.defense *
          getBoostMultiplier(player.defense) *
          battleState.defenseModifier

        // Calculate final damage
        const finalDamage = Math.max(
          monsterAttack - totalDefense,
          1 // Minimum damage floor
        )

        // Apply damage to the player
        battleState.playerHP -= finalDamage

        // Log the attack in the battle history
        const damageEmoji = damageTypeEmojis[chosenAttack.damageType] || ''
        battleState.history.push(
          `${monster.name} uses ${chosenAttack.name} for ${finalDamage}${damageEmoji} damage!`
        )

        // battleState.history.push(
        //   `🛡️ Your effective defense during this attack: ${Math.floor(
        //     effectivePlayerDefense
        //   )}`
        // );

        // console.log(`[Monster Turn Log] Monster Attack: ${monsterAttack}`)
        // console.log(
        //   `[Monster Turn Log] Player Effective Defense: ${effectivePlayerDefense}`
        // )
        // console.log(`[Monster Turn Log] Final Damage: ${finalDamage}`)
        // Check if the player is defeated
        if (battleState.playerHP <= 0) {
          collector.stop('defeat')
          return
        }

        // Pass turn back to the player
        battleState.defenseModifier = 1
        battleState.turn = 'player'
        await interaction.editReply({ embeds: [generateBattleEmbed()] })
      }
      if (battleState.turn === 'monster') {
        await monsterTurn() // Monster attacks first
        // Check if the player is still alive
        if (battleState.playerHP <= 0) {
          await interaction.editReply({ embeds: [generateBattleEmbed()] })
          return
        }
      }
      // Button interaction collector
      const collector = interaction.channel.createMessageComponentCollector({
        filter: (i) => i.user.id === userId,
        time: 60000,
      })

      collector.on('collect', async (btnInteraction) => {
        try {
          if (battleState.turn !== 'player') {
            await btnInteraction.reply({
              content: 'It’s not your turn!',
              ephemeral: true,
            })
            return
          }

          // Ensure interaction is deferred properly
          await btnInteraction.deferUpdate()

          const action = btnInteraction.customId

          if (action === 'basic_attack') {
            const playerAttack = calculateDamageWithAgility(
              equippedWeapons[0]?.item.damageMin || 1,
              equippedWeapons[0]?.item.damageMax || 2,
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
              `${interaction.user.username} deals ${finalDamage} ✊ to ${monster.name}!`
            )
          } else if (action === 'fierce_attack') {
            // Calculate the total base damage
            let basePlayerAttack = equippedWeapons.reduce(
              (totalDamage, weapon) => {
                const primaryDamage = calculateDamageWithAgility(
                  weapon.item.damageMin,
                  weapon.item.damageMax,
                  player.agility,
                  monster.agility
                )

                const secondaryDamage =
                  weapon.item.damage2Min && weapon.item.damage2Max
                    ? calculateDamageWithAgility(
                        weapon.item.damage2Min,
                        weapon.item.damage2Max,
                        player.agility,
                        monster.agility
                      )
                    : 0

                return totalDamage + primaryDamage + secondaryDamage
              },
              0
            )

            // Add unarmed damage if no weapons are equipped
            if (equippedWeapons.length === 0) {
              basePlayerAttack += calculateDamageWithAgility(
                1, // Unarmed damageMin
                2, // Unarmed damageMax
                player.agility,
                monster.agility
              )
            }

            // Apply fierce attack multiplier
            const fiercePlayerAttack = basePlayerAttack * 1.5

            // Calculate final damage
            const finalFierceDamage = Math.max(
              Math.floor(fiercePlayerAttack) -
                monster.defense * getBoostMultiplier(monster.defense),
              2 // Minimum damage floor for fierce attacks
            )

            // Apply damage to the monster
            battleState.monsterHP -= finalFierceDamage

            // Adjust defense penalty based on equipped weapons
            if (equippedWeapons.length === 2) {
              battleState.defenseModifier = 0.25 // 75% reduction
            } else if (equippedWeapons.length === 1) {
              battleState.defenseModifier = 0.5 // 50% reduction
            } else {
              battleState.defenseModifier = 1 // No penalty if unarmed
            }

            // Log the fierce attack
            battleState.history.push(
              `${
                interaction.user.username
              } uses a fierce attack for ${finalFierceDamage}! Your defense drops by ${
                equippedWeapons.length === 2 ? '75%' : '50%'
              } until your next turn.`
            )

            console.log(
              `[Fierce Attack Log] Base Player Attack: ${basePlayerAttack}, Fierce Damage: ${finalFierceDamage}`
            )
            console.log(
              `[Fierce Attack Log] Defense Modifier Applied: ${battleState.defenseModifier}`
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
            const weaponDamageEmoji = [
              damageTypeEmojis[weapon.damageType],
              weapon.damageType2 ? damageTypeEmojis[weapon.damageType2] : null,
            ]
              .filter(Boolean)
              .join('')
            battleState.history.push(
              `${interaction.user.username} uses ${weapon.name} to deal ${weaponAttack}${weaponDamageEmoji} to ${monster.name}!`
            )
          }

          if (battleState.monsterHP <= 0) {
            collector.stop('victory')
            return
          }

          battleState.turn = 'monster'

          // Update interaction with the battle embed
          await btnInteraction.editReply({ embeds: [generateBattleEmbed()] })
          await monsterTurn()
        } catch (error) {
          console.error('Error handling button interaction:', error)

          if (!btnInteraction.replied && !btnInteraction.deferred) {
            await btnInteraction.reply({
              content: 'An error occurred. Please try again.',
              ephemeral: true,
            })
          }
        }
      })

      // Collector end logic
      collector.on('end', async (collected, reason) => {
        const resultEmbed = new EmbedBuilder().setTitle('Battle Result');
      
        if (reason === 'victory') {
          resultEmbed
            .setDescription(`🎉 You defeated ${monster.name}!`)
            .setColor('Green')
            .setImage(
              `https://raw.githubusercontent.com/OldSociety/sanity-bot/main/assets/${monster.url}.png`
            );
      
          await player.increment('war_points', { by: 10 });
        } else if (reason === 'defeat') {
          resultEmbed
            .setDescription(`💔 You were defeated by ${monster.name}.`)
            .setColor('Red')
            .setThumbnail(
              `https://raw.githubusercontent.com/OldSociety/sanity-bot/main/assets/${monster.url}.png`
            );
        } else {
          resultEmbed
            .setDescription('⏳ The battle ended due to inactivity.')
            .setColor('Grey');
        }
      
        // Follow up with a public message
        await interaction.followUp({ embeds: [resultEmbed] });
      });
      
    }
  },
}
