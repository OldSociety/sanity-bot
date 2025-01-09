const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  EmbedBuilder,
} = require('discord.js')
const { WinterWar } = require('../../Models/model.js')

let jackpot = 1000
const activePlayers = new Set() // Track active players to prevent multiple instances

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slots')
    .setDescription('Play the Winter Points slot machine!'),
  async execute(interaction) {
    const allowedChannels = [
      process.env.WINTERCHANNELID,
      process.env.BOTTESTCHANNELID,
    ]

    if (!allowedChannels.includes(interaction.channel.id)) {
      await interaction.reply({
        content: `❄️ This game can only be played in the designated Winter Slots channels.`,
        ephemeral: true,
      })
      return
    }

    const userId = interaction.user.id

    if (activePlayers.has(userId)) {
      await interaction.reply({
        content: `🎰 You already have a game in progress! Finish your current game first.`,
        ephemeral: true,
      })
      return
    }

    let userData = await WinterWar.findOne({ where: { userId: userId } })
    if (!userData) {
      await interaction.reply({
        content: `❄️ You need to allocate your stats first. Use \`/winterwars account\` to get started!`,
        ephemeral: true,
      })
      return
    }

    if (userData.war_points < 5) {
      await interaction.reply({
        content: `🎰 You don't have enough Winter Points to play! It costs 5 WP per game.`,
        ephemeral: true,
      })
      return
    }

    activePlayers.add(userId)

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('start_game')
        .setLabel("Let's Play (costs 5 WP)")
        .setStyle('Primary')
    )

    const explanationEmbed = new EmbedBuilder()
      .setTitle('Welcome to Winter Slots! ❄️')
      .setDescription(
        `Winter Slots is a game of chance! Advance through five stages—Red, Blue, Green, Gold, and Silver. Each stage increases the stakes and potential rewards.\n\n` +
          `- **Risk/Reward:** Each roll risks your earned pot! You can stop at any time to collect your winnings or chance losing everything.\n` +
          `- **Goal:** Advance through stages and collect War Points.\n` +
          `- **Jackpot:** Chance to win the grand prize on the Silver Stage! ⏩\n\n`
      )
      .setColor('Blue')
      .setFooter({ text: `❄️${userData.war_points} War Points` })
      .addFields({
        name: 'Current Jackpot',
        value: `${jackpot} WP`,
        inline: true,
      })

    await interaction.reply({
      embeds: [explanationEmbed],
      components: [row],
      ephemeral: true,
    })

    const collector = interaction.channel.createMessageComponentCollector({
      filter: (btnInteraction) => btnInteraction.user.id === userId,
      time: 30000, // Timeout after 30 seconds
    })

    collector.on('collect', async (btnInteraction) => {
      try {
        if (btnInteraction.customId === 'start_game') {
          // Defer the interaction to prevent "Interaction Failed"
          await btnInteraction.deferUpdate()

          // Start the game
          collector.stop('game_started')
          await startGame(interaction, userData)
        }
      } catch (error) {
        console.error('Error during game start:', error)
        collector.stop('error')
      }
    })
  },
}

async function startGame(interaction, userData) {
  const userId = interaction.user.id

  // Deduct cost to play
  userData.war_points -= 5
  jackpot += Math.floor(Math.random() * 6) + 5
  await userData.save()

  const columnData = [
    {
      title: 'Red Stage',
      color: 'Red',
      effects: [
        {
          emoji: '🎅',
          type: 'gain',
          chance: 50,
          range: [1, 3],
          message: '**Tiny Win 🎅**',
          link: 'https://twemoji.maxcdn.com/v/latest/svg/1f385.svg',
        },
        {
          emoji: '🎅',
          type: 'false_alarm',
          chance: 16,
          message: '**Near Advance!**',
          link: 'https://twemoji.maxcdn.com/v/latest/svg/1f385.svg',
        },
        {
          emoji: '❄️',
          type: 'lose',
          chance: 12,
          range: [1, 3],
          message: '**Small Loss 💔**',
          link: 'https://twemoji.maxcdn.com/v/latest/svg/2744.svg',
        },
        {
          emoji: '✅',
          type: 'advance',
          chance: 6,
          message: '**Advance to Next Stage! ⏩**  ',
          link: 'https://twemoji.maxcdn.com/v/latest/svg/2705.svg',
        },
        {
          emoji: '🛑',
          type: 'game_over',
          chance: 16,
          message: '**Game Over! 🛑**',
          link: 'https://twemoji.maxcdn.com/v/latest/svg/1f6d1.svg',
        },
      ],
    },
    {
      title: 'Blue Stage',
      color: 'Blue',
      effects: [
        {
          emoji: '🎅',
          type: 'gain',
          chance: 42,
          range: [1, 8],
          message: '**Small Win 🎅**',
          link: 'https://twemoji.maxcdn.com/v/latest/svg/1f385.svg',
        },
        {
          emoji: '🎅',
          type: 'false_alarm',
          chance: 10,
          message: '**Near Advance!**',
          link: 'https://twemoji.maxcdn.com/v/latest/svg/1f385.svg',
        },
        {
          emoji: '❄️',
          type: 'lose',
          chance: 25,
          range: [1, 8],
          message: '**Medium Loss 💔**',
          link: 'https://twemoji.maxcdn.com/v/latest/svg/2744.svg',
        },
        {
          emoji: '✅',
          type: 'advance',
          chance: 5,
          message: '**Advance to Next Stage! ⏩**',
          link: 'https://twemoji.maxcdn.com/v/latest/svg/2705.svg',
        },
        {
          emoji: '🎄',
          type: 'nothing',
          chance: 10,
          message: '**Nothing Happens 🎄**',
          link: 'https://twemoji.maxcdn.com/v/latest/svg/1f384.svg',
        },
        {
          emoji: '🛑',
          type: 'game_over',
          chance: 8,
          message: '**Game Over! 🛑**',
          link: 'https://twemoji.maxcdn.com/v/latest/svg/1f6d1.svg',
        },
      ],
    },
    {
      title: 'Green Stage',
      color: 'Green',
      effects: [
        {
          emoji: '🎅',
          type: 'gain',
          chance: 40,
          range: [1, 13],
          message: '**Medium Win 🎅**',
          link: 'https://twemoji.maxcdn.com/v/latest/svg/1f385.svg',
        },
        {
          emoji: '🎅',
          type: 'false_alarm',
          chance: 8,
          message: '**Near Advance!**',
          link: 'https://twemoji.maxcdn.com/v/latest/svg/1f385.svg',
        },
        {
          emoji: '❄️',
          type: 'lose',
          chance: 24,
          range: [1, 13],
          message: '**Large Loss 💔**',
          link: 'https://twemoji.maxcdn.com/v/latest/svg/2744.svg',
        },
        {
          emoji: '✅',
          type: 'advance',
          chance: 6,
          message: '**Advance to Next Stage! ⏩**',
          link: 'https://twemoji.maxcdn.com/v/latest/svg/2705.svg',
        },
        {
          emoji: '🎁',
          type: 'item',
          chance: 8,
          message: '**Item Found!**',
          link: 'https://twemoji.maxcdn.com/v/latest/svg/1f381.svg',
        },
        {
          emoji: '🛑',
          type: 'game_over',
          chance: 14,
          message: '**Game Over! 🛑**',
          link: 'https://twemoji.maxcdn.com/v/latest/svg/1f6d1.svg',
        },
      ],
    },
    {
      title: 'Gold Stage',
      color: 'Gold',
      effects: [
        {
          emoji: '🎅',
          type: 'gain',
          chance: 35,
          range: [1, 19],
          message: '**Big Win 🎅**',
          link: 'https://twemoji.maxcdn.com/v/latest/svg/1f385.svg',
        },
        {
          emoji: '🎅',
          type: 'false_alarm',
          chance: 5,
          message: '**Near Advance!**',
          link: 'https://twemoji.maxcdn.com/v/latest/svg/1f385.svg',
        },
        {
          emoji: '❄️',
          type: 'lose',
          chance: 27,
          range: [1, 19],
          message: '**Huge Loss 💔**',
          link: 'https://twemoji.maxcdn.com/v/latest/svg/2744.svg',
        },
        {
          emoji: '✅',
          type: 'advance',
          chance: 6,
          message: '**Advance to Final Stage! ⏩**',
          link: 'https://twemoji.maxcdn.com/v/latest/svg/2705.svg',
        },
        {
          emoji: '🔔',
          type: 'mystery',
          chance: 9,
          message: '**🔔 Mystery Event! 🔔**',
          link: 'https://twemoji.maxcdn.com/v/latest/svg/1f514.svg',
        },
        {
          emoji: '🛑',
          type: 'game_over',
          chance: 18,
          message: '**Game Over! 🛑 **',
          link: 'https://twemoji.maxcdn.com/v/latest/svg/1f6d1.svg',
        },
      ],
    },
    {
      title: 'Silver Stage',
      color: 'Silver',
      effects: [
        {
          emoji: '🎅',
          type: 'gain',
          chance: 35,
          range: [1, 25],
          message: '**Massive Win 🎅**',
          link: 'https://twemoji.maxcdn.com/v/latest/svg/1f385.svg',
        },
        {
          emoji: '⭐',
          type: 'jackpot',
          chance: 5,
          message: '**⭐⭐ CONGRATULATIONS ⭐⭐**',
          link: 'https://twemoji.maxcdn.com/v/latest/svg/2b50.svg',
        },
        {
          emoji: '❄️',
          type: 'lose',
          chance: 30,
          range: [1, 25],
          message: '**Major Loss 💔**',
          link: 'https://twemoji.maxcdn.com/v/latest/svg/2744.svg',
        },
        {
          emoji: '🔔',
          type: 'mystery',
          chance: 10,
          message: '**🔔 Mystery Event! 🔔**',
          link: 'https://twemoji.maxcdn.com/v/latest/svg/1f514.svg',
        },
        {
          emoji: '🛑',
          type: 'game_over',
          chance: 20,
          message: '**Game Over! 🛑**',
          link: 'https://twemoji.maxcdn.com/v/latest/svg/1f6d1.svg',
        },
      ],
    },
  ]

  const gameState = {
    currentColumn: 0,
    totalPoints: 0,
    running: true,
  }

  const createRow = (totalPoints) =>
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('spin_again')
        .setLabel('Spin Again')
        .setStyle('Primary'),
      new ButtonBuilder()
        .setCustomId('stop_playing')
        .setLabel(`Stop and collect ${totalPoints} WP`)
        .setStyle('Secondary')
    )

  const playRound = async (interactionObject, isInitial = false) => {
    let effects = columnData[gameState.currentColumn].effects

    // Filter effects for the first roll to exclude "advance" and "game_over"
    if (isInitial) {
      effects = effects.filter(
        (effect) => effect.type !== 'advance' && effect.type !== 'game_over'
      )
    }

    // Perform the weighted random selection
    const roll = weightedRandom(effects)
    let message = roll.message

    if (roll.type === 'gain') {
      const amount =
        Math.floor(Math.random() * (roll.range[1] - roll.range[0] + 1)) +
        roll.range[0]
      gameState.totalPoints = Math.max(0, gameState.totalPoints + amount) // Ensure no negative points
      message += ` You gained ${amount} WP!`
    } else if (roll.type === 'lose') {
      const amount =
        Math.floor(Math.random() * (roll.range[1] - roll.range[0] + 1)) +
        roll.range[0]
      gameState.totalPoints = Math.max(0, gameState.totalPoints - amount) // Ensure no negative points
      message += ` You lost ${amount} WP!`
    } else if (roll.type === 'advance') {
      if (gameState.currentColumn < columnData.length - 1) {
        gameState.currentColumn++ // Advance to the next stage
        message += ` You advanced to the ${
          columnData[gameState.currentColumn].title
        }!`
      }
    } else if (roll.type === 'game_over') {
      // No pot awarded
      jackpot += Math.max(Math.floor(gameState.totalPoints / 2), 0)
      gameState.running = false
      activePlayers.delete(interactionObject.user.id)
      message += ` You lost your pot of **${gameState.totalPoints} WP**.`
      gameState.totalPoints = 0 // Reset the pot
    } else if (roll.type === 'item') {
      // Query the database to get all consumables
      const consumables = await BaseItem.findAll({
        where: { type: 'consumable' },
      })

      if (consumables.length > 0) {
        // Randomly select a consumable
        const randomIndex = Math.floor(Math.random() * consumables.length)
        const item = consumables[randomIndex]

        // Check if the user already has the item in their inventory
        const existingItem = await Inventory.findOne({
          where: { userId: interactionObject.user.id, itemId: item.id },
        })

        if (existingItem) {
          // Increment the count if the item exists
          existingItem.count += 1
          await existingItem.save()
        } else {
          // Create a new inventory entry if the item does not exist
          await Inventory.create({
            userId: interactionObject.user.id,
            itemId: item.id,
            count: 1,
          })
        }

        message += ` You found a **${item.name}**! 🎁`
      } else {
        // Fallback if no consumables are found in the database
        message += ' No items found in the database. 🎁'
      }
    } else if (roll.type === 'jackpot') {
      userData.war_points += jackpot
      userData.save()
      gameState.running = false
      gameState.totalPoints = 0
      activePlayers.delete(interactionObject.user.id)
      message += ` You won the JACKPOT of ${jackpot} WP!`
      jackpot = 1000 // Reset the jackpot
    }

    const embed = new EmbedBuilder()
      .setTitle(columnData[gameState.currentColumn].title) // Reflect current stage
      .setColor(columnData[gameState.currentColumn].color)
      .setDescription(message)
      .setThumbnail(roll.link) // Set emoji image dynamically
      .setFooter({ text: `❄️${userData.war_points} War Points` })
      .addFields(
        {
          name: 'Current Pot',
          value: `${gameState.totalPoints}`,
          inline: true,
        },
        { name: 'Jackpot', value: `${jackpot}`, inline: true }
      )

    // Check if game is over
    if (!gameState.running) {
      activePlayers.delete(interactionObject.user.id) // Clear player from active set
      await interactionObject[
        interactionObject.replied ? 'editReply' : 'update'
      ]({
        embeds: [embed],
        components: [], // Disable all buttons
      })
      return // Stop further processing
    }

    // Update the interaction for ongoing games
    await interactionObject[isInitial ? 'editReply' : 'update']({
      embeds: [embed],
      components: [createRow(gameState.totalPoints)],
    })
  }

  await playRound(interaction, true)

  const collector = interaction.channel.createMessageComponentCollector({
    filter: (btnInteraction) => btnInteraction.user.id === userId,
    time: 60000,
  })

  collector.on('collect', async (btnInteraction) => {
    try {
      if (btnInteraction.customId === 'spin_again') {
        await playRound(btnInteraction)
        if (!gameState.running) collector.stop('game_over')
      } else if (btnInteraction.customId === 'stop_playing') {
        userData.war_points += gameState.totalPoints
        userData.save()
        gameState.running = false
        activePlayers.delete(userId)

        const finalEmbed = new EmbedBuilder()
          .setTitle('Winter Slots Results ❄️')
          .setDescription(`You stopped with **${gameState.totalPoints} WP**.`)
          .setFooter({ text: `❄️${userData.war_points} War Points` })
          .setColor('Green')

        await btnInteraction.update({
          embeds: [finalEmbed],
          components: [],
        })

        collector.stop('user_stopped')
      }
    } catch (error) {
      console.error('Error during interaction collection:', error)
      collector.stop('error')
    }
  })

  collector.on('end', async (collected, reason) => {
    if (reason === 'time') {
      activePlayers.delete(userId)
      await interaction.editReply({
        content: `❄️ Time's up! Your game has ended.`,
        components: [],
      })
    }
  })
}

function weightedRandom(effects) {
  const totalWeight = effects.reduce((sum, effect) => sum + effect.chance, 0)
  const random = Math.random() * totalWeight
  let cumulative = 0

  for (const effect of effects) {
    cumulative += effect.chance
    if (random < cumulative) return effect
  }
}
