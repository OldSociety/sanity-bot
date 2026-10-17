const path = require('node:path')
const banners = {
  'marq:maxim': 'mvm-banner-wide.png',
  'marq:marq': 'marq-vs-marq.png',
  'maxim:marq': 'maxim-vs-marq.png',
  'maxim:maxim': 'maxim-vs-maxim.png',
}
const bannerName = (character, opponent = 'maxim') => banners[`${character?.kit === 'maxim' ? 'maxim' : 'marq'}:${opponent}`] || banners['marq:maxim']
function artFiles(character, opponent = 'maxim', page = 'prefight') {
  if (['characters', 'skins'].includes(page)) return [{ attachment: character.image, name: `arena-skin-${character.id.replace(/[^a-z0-9-]/gi, '-')}.png` }]
  const file = bannerName(character, opponent)
  return [{ attachment: path.join(__dirname, '../../assets/arena', file), name: file }]
}
module.exports = { bannerName, artFiles }
