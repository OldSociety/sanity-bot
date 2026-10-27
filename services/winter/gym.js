const SKILLS = Object.freeze([
  Object.freeze({ id: 'strength', name: 'Strength', short: 'STR', emoji: '💪🏽' }),
  Object.freeze({ id: 'accuracy', name: 'Accuracy', short: 'ACC', emoji: '🎯' }),
  Object.freeze({ id: 'defense', name: 'Defense', short: 'DEF', emoji: '🛡️' }),
  Object.freeze({ id: 'attack', name: 'Attack', short: 'ATT', emoji: '⚔️' }),
])
const MAX_LEVEL = 100
const LIFT_TAUNT = 'With those scrawny arms? Nice try.'
const allMaxed = gym => SKILLS.every(skill => (gym?.[skill.id] || 1) >= MAX_LEVEL)
const RECIPE_PRICE = 999000
module.exports = { SKILLS, MAX_LEVEL, LIFT_TAUNT, allMaxed, RECIPE_PRICE }
