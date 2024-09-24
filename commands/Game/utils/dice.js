// Utility function for rolling the dice
function rollDice() {
  const outcomes = ['Yellow Sign', 'Tentacle', 'Elder Sign', 'Cthulhu', 'Eye']
  return outcomes[Math.floor(Math.random() * outcomes.length)]
}

// Bot decision-making for the "Eye" outcome
function botChooseOutcome() {
  const possibleOutcomes = ['Yellow Sign', 'Tentacle', 'Elder Sign', 'Cthulhu']
  // Here we just randomize the outcome, but a strategy can be implemented
  return possibleOutcomes[Math.floor(Math.random() * possibleOutcomes.length)]
}

module.exports = { rollDice, botChooseOutcome }
