const path = require('node:path')
const badges = require('../../config/badges.json')
const {
  variants: rarityByVariant,
} = require('../../config/arena-rarities.json')

// Prototype variants. No ownership, shop or XP imports.
const characters = Object.freeze([
  Object.freeze({
    id: 'classic:azu',
    rarity: rarityByVariant['classic:azu'],
    name: 'Azulis',
    version: 'Classic',
    label: 'Azulis [Classic]',
    kit: 'classic-azulis',
    aliases: ['classic-azulis'],
    passive: null,
    developmentOnly: true,
    image: path.join(__dirname, '../../assets/badges/Classic/AZULIS_BADGE.png'),
  }),
  ...badges.badges.map((badge) =>
    Object.freeze({
      id: `${badges.collectionId}:${badge.characterId}`,
      rarity: rarityByVariant[`${badges.collectionId}:${badge.characterId}`],
      name: badge.characterId === 'hfm' ? 'Marq' : badge.name,
      version: badge.characterId === 'hfm' ? 'Hell-fed' : 'Spooky',
      label:
        badge.characterId === 'hfm'
          ? 'Marq [Hell-fed]'
          : `${badge.name} [Spooky]`,
      aliases:
        badge.characterId === 'hfm'
          ? ['Hellfed Marq', 'Hellfed Marq [Spooky]', 'Hell-fed Marq']
          : [],
      passive:
        badge.characterId === 'hfm'
          ? 'hellfed'
          : badge.characterId === 'max'
          ? 'not-good-enough'
          : badge.characterId === 'mrq'
          ? 'on-the-brink'
          : null,
      kit:
        badge.characterId === 'hfm'
          ? 'hellfed-marq'
          : badge.characterId === 'max'
          ? 'maxim'
          : badge.characterId === 'mrq'
          ? 'spooky-marq'
          : 'marq',
      image: path.join(
        __dirname,
        '../../assets/badges/Spooky',
        badge.imageAsset
      ),
    })
  ),
  Object.freeze({
    id: 'classic:sel',
    rarity: rarityByVariant['classic:sel'],
    name: 'Selene',
    version: 'Classic',
    label: 'Selene [Classic]',
    passive: null,
    image: path.join(__dirname, '../../assets/badges/Classic/SELENE_BADGE.png'),
  }),
])
const defaultCharacter = characters.find(
  (character) => character.id === 'spooky-2026:mrq'
)
const isSelectable = (character) =>
  Boolean(
    character &&
      (!character.developmentOnly ||
        Boolean(require('./rules').balance.characters[character.kit])) &&
      [
        'spooky-2026:mrq',
        'spooky-2026:max',
        ...(process.env.NODE_ENV === 'development'
          ? ['spooky-2026:hfm', 'classic:azu']
          : []),
      ].includes(character.id)
  )
const normalized = (value) =>
  String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
function resolveCharacter(value) {
  if (!value) return defaultCharacter
  const query = normalized(value)
  const exact = characters.find(
    (character) =>
      normalized(character.id) === query ||
      normalized(character.label) === query ||
      character.aliases?.some((alias) => normalized(alias) === query)
  )
  if (exact) return exact
  const named = characters.filter(
    (character) => normalized(character.name) === query
  )
  return named.length === 1
    ? named[0]
    : query === 'marq'
    ? defaultCharacter
    : null
}
function characterChoices(value = '') {
  const terms = normalized(value)
    .replace(/-/g, '')
    .replace(/[\[\]]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  return characters
    .filter(
      (character) =>
        isSelectable(character) &&
        terms.every((term) =>
          normalized(character.label).replace(/-/g, '').includes(term)
        )
    )
    .slice(0, 25)
    .map((character) => ({ name: character.label, value: character.id }))
}
module.exports = {
  characters,
  defaultCharacter,
  resolveCharacter,
  characterChoices,
  isSelectable,
}
