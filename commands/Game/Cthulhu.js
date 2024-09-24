// const {
//   SlashCommandBuilder,
//   EmbedBuilder,
//   ActionRowBuilder,
//   ButtonBuilder,
//   ButtonStyle,
// } = require('discord.js')
// const { rollDice, botChooseOutcome } = require('./utils/dice')
// const GameSession = require('./utils/GameSession')

// // Create a Map to store per-session game states (keyed by user ID)
// const gameStates = new Map()

// module.exports = {
//   data: new SlashCommandBuilder()
//     .setName('cthulhu')
//     .setDescription('Cthulhu Dice game commands')
//     .addSubcommand((subcommand) =>
//       subcommand.setName('play').setDescription('Start a game of Cthulhu Dice')
//     )
//     .addSubcommand((subcommand) =>
//       subcommand
//         .setName('help')
//         .setDescription('Explain the rules of Cthulhu Dice')
//     ),

//   // Execute the slash command
//   async execute(interaction) {
//     const subcommand = interaction.options.getSubcommand()

//     try {
//       if (subcommand === 'play') {
//         await startGame(interaction) // Call the startGame function
//       } else if (subcommand === 'help') {
//         await showHelp(interaction) // Call the help function
//       }
//     } catch (error) {
//       console.error(`Error executing command: ${error}`)
//       await interaction.reply({
//         content: 'An error occurred while executing the command.',
//         ephemeral: true,
//       })
//     }
//   },

//   // Handle player turn interaction
//   async handlePlayerTurn(interaction) {
//     try {
//       const userId = interaction.user.id

//       if (!gameStates.has(userId)) {
//         return interaction.reply({
//           content: 'Please start a new game with `/cthulhu play`.',
//           ephemeral: true,
//         })
//       }

//       const gameSession = gameStates.get(userId)
//       const rollResult = rollDice()

//       if (rollResult === 'Eye') {
//         // Handle the Eye outcome by offering choices to the player
//         await handleEyeOutcome(interaction, gameSession)
//       } else {
//         const userOutcome = gameSession.applyOutcome(rollResult, 'user')

//         const userEmbed = new EmbedBuilder()
//           .setColor('#00ff99')
//           .setTitle(`You rolled ${rollResult}!`)
//           .setDescription(userOutcome)
//           .setThumbnail(getDiceImage(rollResult))
//           .addFields(
//             {
//               name: 'Your Sanity',
//               value: displaySanity(gameSession.userSanity),
//               inline: false,
//             },
//             {
//               name: 'Bot Sanity',
//               value: displaySanity(gameSession.botSanity),
//               inline: false,
//             },
//             {
//               name: 'Cthulhu Sanity',
//               value: `Cthulhu: ${gameSession.cthulhuSanity}`,
//               inline: false,
//             }
//           )
//           .setTimestamp()

//         await interaction.reply({
//           embeds: [userEmbed],
//           ephemeral: true,
//         })

//         // Check for win condition
//         const winCondition = gameSession.checkWinConditions()
//         if (winCondition) {
//           await interaction.followUp({
//             content: winCondition,
//             ephemeral: false, // Final game result is public
//           })
//           gameStates.delete(userId)
//           return
//         }

//         // Proceed with bot's turn
//         await handleBotTurn(interaction, gameSession)
//       }
//     } catch (error) {
//       console.error(`Error handling player turn: ${error}`)
//       await interaction.followUp({
//         content: 'An error occurred while processing your turn.',
//         ephemeral: true,
//       })
//     }
//   },
// }

// // Handle Eye outcome logic
// async function handleEyeOutcome(interaction, gameSession) {
//   const row = new ActionRowBuilder().addComponents(
//     new ButtonBuilder()
//       .setCustomId('yellow_sign')
//       .setLabel('Yellow Sign')
//       .setStyle(ButtonStyle.Primary),
//     new ButtonBuilder()
//       .setCustomId('tentacle')
//       .setLabel('Tentacle')
//       .setStyle(ButtonStyle.Primary),
//     new ButtonBuilder()
//       .setCustomId('elder_sign')
//       .setLabel('Elder Sign')
//       .setStyle(ButtonStyle.Primary),
//     new ButtonBuilder()
//       .setCustomId('cthulhu')
//       .setLabel('Cthulhu')
//       .setStyle(ButtonStyle.Danger)
//   )

//   const eyeEmbed = new EmbedBuilder()
//     .setColor('#ffff00')
//     .setTitle('You rolled Eye!')
//     .setDescription('Choose the outcome:')
//     .setTimestamp()

//   await interaction.reply({
//     embeds: [eyeEmbed],
//     components: [row],
//     ephemeral: true,
//   })

//   const filter = (i) => i.customId && i.user.id === interaction.user.id
//   const collector = interaction.channel.createMessageComponentCollector({
//     filter,
//     time: 60000,
//   })

//   collector.on('collect', async (i) => {
//     try {
//       let chosenOutcome
//       switch (i.customId) {
//         case 'yellow_sign':
//           chosenOutcome = 'Yellow Sign'
//           break
//         case 'tentacle':
//           chosenOutcome = 'Tentacle'
//           break
//         case 'elder_sign':
//           chosenOutcome = 'Elder Sign'
//           break
//         case 'cthulhu':
//           chosenOutcome = 'Cthulhu'
//           break
//       }

//       const resultMessage = gameSession.applyOutcome(chosenOutcome, 'user')

//       const resultEmbed = new EmbedBuilder()
//         .setColor('#ff9900')
//         .setTitle(`You chose ${chosenOutcome}`)
//         .setDescription(resultMessage)
//         .setThumbnail(getDiceImage(chosenOutcome))
//         .addFields(
//           {
//             name: 'Your Sanity',
//             value: displaySanity(gameSession.userSanity),
//             inline: false,
//           },
//           {
//             name: 'Bot Sanity',
//             value: displaySanity(gameSession.botSanity),
//             inline: false,
//           },
//           {
//             name: 'Cthulhu Sanity',
//             value: `Cthulhu: ${gameSession.cthulhuSanity}`,
//             inline: false,
//           }
//         )
//         .setTimestamp()

//       // Reply to the button interaction
//       await i.reply({
//         embeds: [resultEmbed],
//         ephemeral: true,
//       })

//       // Check for win condition
//       const winCondition = gameSession.checkWinConditions()
//       if (winCondition) {
//         await i.followUp({
//           content: winCondition,
//           ephemeral: false, // Final game result is public
//         })
//         gameStates.delete(interaction.user.id)
//         return
//       }

//       // Proceed with bot's turn
//       await handleBotTurn(interaction, gameSession)
//     } catch (error) {
//       console.error(`Error during Eye choice: ${error}`)
//       await i.reply({
//         content: 'An error occurred while processing your choice.',
//         ephemeral: true,
//       })
//     }
//   })

//   collector.on('end', async (collected) => {
//     if (collected.size === 0) {
//       await interaction.followUp({
//         content: 'You took too long to choose. The game continues.',
//         ephemeral: true,
//       })

//       // Proceed with bot's turn
//       await handleBotTurn(interaction, gameSession)
//     }
//   })
// }

// // Bot's turn logic
// async function handleBotTurn(interaction, gameSession) {
//   const botRollResult = botChooseOutcome()
//   const botOutcome = gameSession.applyOutcome(botRollResult, 'bot')

//   const botEmbed = new EmbedBuilder()
//     .setColor('#ff0000') // Bot's embed color
//     .setTitle(`Bot rolled ${botRollResult}!`)
//     .setDescription(botOutcome)
//     .setThumbnail(getDiceImage(botRollResult))
//     .addFields(
//       {
//         name: 'Your Sanity',
//         value: displaySanity(gameSession.userSanity),
//         inline: false,
//       },
//       {
//         name: 'Bot Sanity',
//         value: displaySanity(gameSession.botSanity),
//         inline: false,
//       },
//       {
//         name: 'Cthulhu Sanity',
//         value: `Cthulhu: ${gameSession.cthulhuSanity}`,
//         inline: false,
//       }
//     )
//     .setTimestamp()

//   const row = new ActionRowBuilder().addComponents(
//     new ButtonBuilder()
//       .setCustomId('roll')
//       .setLabel('Your Turn')
//       .setStyle(ButtonStyle.Primary)
//   )

//   await interaction.followUp({
//     embeds: [botEmbed],
//     components: [row],
//     ephemeral: true,
//   })
// }

// // Start a new game function
// async function startGame(interaction) {
//   const userId = interaction.user.id

//   // Check if a game session already exists for the user, and delete the old session
//   if (gameStates.has(userId)) {
//     gameStates.delete(userId) // Clean up the previous session
//   }

//   gameStates.set(userId, new GameSession(userId))

//   const startEmbed = new EmbedBuilder()
//     .setColor('#0099ff')
//     .setTitle('Cthulhu Dice Game Started')
//     .setDescription(
//       'You and the bot both start with 6 Sanity. Click "Your Turn" to begin!'
//     )
//     .setTimestamp()

//   const row = new ActionRowBuilder().addComponents(
//     new ButtonBuilder()
//       .setCustomId('roll')
//       .setLabel('Your Turn')
//       .setStyle(ButtonStyle.Primary)
//   )

//   await interaction.reply({
//     embeds: [startEmbed],
//     components: [row],
//     ephemeral: false,
//   }) // Game start is not ephemeral
// }

// // Show help message function
// async function showHelp(interaction) {
//   const helpEmbed = new EmbedBuilder()
//     .setColor('#00ff99')
//     .setTitle('Cthulhu Dice - Game Rules')
//     .setDescription(
//       'Cthulhu Dice is a quick game where each player has 6 sanity. The goal is to drive your opponent insane while keeping your own sanity.'
//     )
//     .addFields(
//       {
//         name: 'Starting the Game',
//         value:
//           'Use `/cthulhu play` to begin a new game. Both you and the bot start with 6 Sanity tokens.',
//       },
//       {
//         name: 'How to Play',
//         value: 'Each turn, roll the dice by clicking the "Your Turn" button.',
//       },
//       {
//         name: 'Dice Outcomes',
//         value:
//           '**Yellow Sign**: Target loses 1 Sanity to Cthulhu.\n**Tentacle**: Steal 1 Sanity from your opponent.\n**Elder Sign**: Gain 1 Sanity from Cthulhu.\n**Cthulhu**: Both lose 1 Sanity.\n**Eye**: Choose an outcome.',
//       }
//     )
//     .setTimestamp()

//   await interaction.reply({ embeds: [helpEmbed], ephemeral: true })
// }

// // Helper to return the dice image based on the roll result
// function getDiceImage(rollResult) {
//   const diceImages = {
//     'Yellow Sign':
//       'https://cdn.discordapp.com/attachments/1262485722275905596/1287479751338098771/yellow.jpg',
//     Tentacle:
//       'https://cdn.discordapp.com/attachments/1262485722275905596/1287479750939644015/tentacle.jpg',
//     'Elder Sign':
//       'https://cdn.discordapp.com/attachments/1262485722275905596/1287479750679330837/star.jpg',
//     Cthulhu:
//       'https://cdn.discordapp.com/attachments/1262485722275905596/1287479750419546172/cthulhu.jpg',
//     Eye: 'https://cdn.discordapp.com/attachments/1262485722275905596/1287479750075355267/Eye.jpg',
//   }
//   return diceImages[rollResult]
// }

// // Helper to display sanity as 🟥 (full) and ⬛ (lost)
// function displaySanity(sanity) {
//   const validSanity = Math.max(0, Math.min(6, sanity)) // Updated for 6 max sanity
//   const full = '🟥'.repeat(validSanity)
//   const empty = '⬛'.repeat(6 - validSanity)
//   return full + empty
// }
