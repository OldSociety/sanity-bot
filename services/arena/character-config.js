// Explicit development builds: filenames include skin, character, and environment.
const filenames = {
  selene: 'arena-spooky-selene-development.json',
  'spooky-marq': 'arena-spooky-marq-development.json',
  'hellfed-marq': 'arena-hellfed-marq-development.json',
  maxim: 'arena-spooky-maxim-development.json',
  azulis: 'arena-classic-azulis-development.json',
  hendrix: 'arena-classic-hendrix-development.json',
  template: 'arena-template-development.json',
}
const characterConfigFiles = Object.values(filenames).map(
  (name) => 'config/arena/characters/' + name
)
const sheets = Object.fromEntries(
  Object.entries(filenames).map(([key, name]) => [
    key,
    require('../../config/arena/characters/' + name),
  ])
)
module.exports = { sheets, characterConfigFiles }
