const { characters, defaultCharacter, isSelectable } = require('./characters')
const { balance } = require('./rules')
const availableOpponents = () =>
  characters.filter(
    (character) =>
      isSelectable(character) &&
      Boolean(balance.ai.characters[character.kit]) &&
      (balance.manualOpponentSelection || character.kit !== 'hellfed-marq')
  )
const initialOpponent = () => {
  const choices = availableOpponents()
  return (
    choices.find((character) => character.id === defaultCharacter.id) ||
    choices[0]
  )
}
module.exports = { availableOpponents, initialOpponent }
