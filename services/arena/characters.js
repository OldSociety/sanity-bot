const path = require('node:path')
const badges = require('../../config/badges.json')

// Prototype variants. No ownership, shop or XP imports.
const characters = Object.freeze([
  ...badges.badges.map(badge => Object.freeze({ id: `${badges.collectionId}:${badge.characterId}`,
    name: badge.name, version: 'Spooky', label: `${badge.name} [Spooky]`,
    passive: badge.characterId === 'max' ? 'opportunity' : null,
    image: path.join(__dirname, '../../assets/badges/Spooky', badge.imageAsset) })),
  Object.freeze({ id: 'classic:sel', name: 'Selene', version: 'Classic', label: 'Selene [Classic]',
    passive: null, image: path.join(__dirname, '../../assets/badges/selene_badge.png') }),
])
const defaultCharacter = characters.find(character => character.id === 'spooky-2026:mrq')
const normalized = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
function resolveCharacter(value) {
  if (!value) return defaultCharacter
  const query = normalized(value)
  const exact = characters.find(character => normalized(character.id) === query || normalized(character.label) === query)
  if (exact) return exact
  const named = characters.filter(character => normalized(character.name) === query)
  return named.length === 1 ? named[0] : null
}
function characterChoices(value = '') {
  const terms = normalized(value).replace(/[\[\]]/g, ' ').split(/\s+/).filter(Boolean)
  return characters.filter(character => terms.every(term => normalized(character.label).includes(term)))
    .slice(0, 25).map(character => ({ name: character.label, value: character.id }))
}
module.exports = { characters, defaultCharacter, resolveCharacter, characterChoices }
