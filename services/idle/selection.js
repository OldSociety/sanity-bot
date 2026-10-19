// Follow Arena's live availability. Do not infer unlocks from badge artwork.
const { characters, isSelectable } = require('../arena/characters')
const { roster, variantsFor } = require('../arena/selection')

const families = () => roster.filter(family => variantsFor(family).length)
const characterChoices = (query = '') => families()
  .filter(family => family.name.toLowerCase().includes(query.trim().toLowerCase()))
  .slice(0, 25).map(family => ({ name: family.name, value: family.id }))
const skinChoices = (characterId, query = '') => {
  const family = families().find(entry => entry.id === characterId)
  return (family ? variantsFor(family) : [])
    .filter(skin => `${skin.label} ${skin.id}`.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 25).map(skin => ({ name: skin.label, value: skin.id }))
}
function resolveSelection(characterId, skinId) {
  const family = families().find(entry => entry.id === characterId)
  const skin = characters.find(entry => entry.id === skinId)
  if (!family || !isSelectable(skin) || !variantsFor(family).includes(skin))
    throw new Error('Choose an available character and matching skin from the eligible autocomplete suggestions.')
  // Arena's controller explicitly starts every skin at level 1.
  return { character: skin, level: 1 }
}
module.exports = { characterChoices, skinChoices, resolveSelection }
