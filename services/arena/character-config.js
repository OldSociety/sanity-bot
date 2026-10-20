// Editable sheets identify the skin and character. Production uses a frozen snapshot.
const filenames = {
  kylax: 'arena-classic-kylax.json',
  selene: 'arena-spooky-selene.json',
  'spooky-marq': 'arena-spooky-marq.json',
  'hellfed-marq': 'arena-hellfed-marq.json',
  maxim: 'arena-spooky-maxim.json',
  azulis: 'arena-classic-azulis.json',
  hendrix: 'arena-classic-hendrix.json',
  template: 'arena-template.json',
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
