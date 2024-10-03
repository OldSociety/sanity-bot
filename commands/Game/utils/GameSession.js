// class GameSession {
//   constructor(userId) {
//     this.userId = userId
//     this.userSanity = 6
//     this.botSanity = 6
//     this.cthulhuSanity = 0
//   }

//   applyOutcome(result, caster) {
//     let message = ''

//     if (caster === 'user') {
//       switch (result) {
//         case 'Yellow Sign':
//           this.botSanity = Math.max(0, this.botSanity - 1)
//           this.cthulhuSanity += 1
//           message = 'The bot loses 1 Sanity to Cthulhu.'
//           break
//         case 'Tentacle':
//           this.userSanity = Math.min(9, this.userSanity + 1)
//           this.botSanity = Math.max(0, this.botSanity - 1)
//           message = 'You steal 1 Sanity from the bot!'
//           break
//         case 'Elder Sign':
//           if (this.cthulhuSanity > 0) {
//             this.userSanity = Math.min(9, this.userSanity + 1)
//             this.cthulhuSanity -= 1
//             message = 'You gain 1 Sanity from Cthulhu.'
//           } else {
//             message =
//               'You rolled Elder Sign but there’s no Sanity to take from Cthulhu.'
//           }
//           break
//         case 'Cthulhu':
//           this.userSanity = Math.max(0, this.userSanity - 1)
//           this.botSanity = Math.max(0, this.botSanity - 1)
//           this.cthulhuSanity += 2
//           message = 'Cthulhu devours 1 Sanity from both players!'
//           break
//         case 'Eye':
//           message = 'You rolled Eye! Choose an outcome.'
//           break
//       }
//     } else if (caster === 'bot') {
//       switch (result) {
//         case 'Yellow Sign':
//           this.userSanity = Math.max(0, this.userSanity - 1)
//           this.cthulhuSanity += 1
//           message = 'You lose 1 Sanity to Cthulhu.'
//           break
//         case 'Tentacle':
//           this.botSanity = Math.min(9, this.botSanity + 1)
//           this.userSanity = Math.max(0, this.userSanity - 1)
//           message = 'The bot steals 1 Sanity from you!'
//           break
//         case 'Elder Sign':
//           if (this.cthulhuSanity > 0) {
//             this.botSanity = Math.min(9, this.botSanity + 1)
//             this.cthulhuSanity -= 1
//             message = 'The bot gains 1 Sanity from Cthulhu.'
//           } else {
//             message =
//               'The bot rolled Elder Sign but there’s no Sanity to take from Cthulhu.'
//           }
//           break
//         case 'Cthulhu':
//           this.userSanity = Math.max(0, this.userSanity - 1)
//           this.botSanity = Math.max(0, this.botSanity - 1)
//           this.cthulhuSanity += 2
//           message = 'Cthulhu devours 1 Sanity from both players!'
//           break
//         case 'Eye':
//           message = 'The bot rolled Eye! The bot chooses an outcome.'
//           break
//       }
//     }

//     return message
//   }
  
//   checkWinConditions() {
//     if (this.userSanity <= 0 && this.botSanity <= 0) {
//       return 'Cthulhu wins!'
//     } else if (this.userSanity <= 0) {
//       return 'Bot wins!'
//     } else if (this.botSanity <= 0) {
//       return 'Player wins!'
//     }
//     return null
//   }
// }

// module.exports = GameSession
