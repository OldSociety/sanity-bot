const { randomInt } = require('node:crypto')

const INGREDIENTS = Object.freeze([
  Object.freeze({ id: 'pepper', emoji: '🌶️' }),
  Object.freeze({ id: 'cherry', emoji: '🍒' }),
  Object.freeze({ id: 'avocado', emoji: '🥑' }),
  Object.freeze({ id: 'garlic', emoji: '🧄' }),
  Object.freeze({ id: 'eggplant', emoji: '🍆' }),
])
const IDS = Object.freeze(INGREDIENTS.map(i => i.id))
const DIRTY_RECIPE = Object.freeze(['eggplant', 'garlic', 'avocado', 'garlic', 'pepper'])
const emojiFor = id => INGREDIENTS.find(i => i.id === id)?.emoji
function shuffleIngredients(previous, draw = randomInt) {
  const order = previous.slice()
  for (let i = order.length - 1; i > 0; i--) {
    const j = draw(i + 1)
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  // A redraw must visibly move the controls even if randomness repeats the order.
  if (order.every((value, i) => value === previous[i])) order.push(order.shift())
  return order
}
function readDraft(row) {
  const ingredients = JSON.parse(row.ingredients)
  const ingredientOrder = JSON.parse(row.ingredientOrder)
  if (!Array.isArray(ingredients) || ingredients.length > 7 || ingredients.some(i => !IDS.includes(i)) ||
      !Array.isArray(ingredientOrder) || ingredientOrder.length !== IDS.length || new Set(ingredientOrder).size !== IDS.length || ingredientOrder.some(i => !IDS.includes(i))) throw Error('Invalid saved recipe draft.')
  return { ...row, ingredients, ingredientOrder }
}
module.exports = { INGREDIENTS, IDS, DIRTY_RECIPE, emojiFor, shuffleIngredients, readDraft }
