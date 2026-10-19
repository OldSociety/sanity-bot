const { frames } = require('../../config/arena/arena-rarities.json')
const frameVersion = 2
const frameFor = (character) => frames[character?.rarity] || null
function frameMarkup(frame, x, y, width, height, id) {
  if (!frame) return ''
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${
    frame.light
  }"/><stop offset="0.4" stop-color="${
    frame.color
  }"/><stop offset="1" stop-color="${
    frame.dark
  }"/></linearGradient></defs><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" fill="none" stroke="url(#${id})" stroke-width="1.25"/><rect x="${
    x + 1.5
  }" y="${y + 1.5}" width="${width - 3}" height="${
    height - 3
  }" rx="6.5" fill="none" stroke="${
    frame.light
  }" stroke-opacity="0.16" stroke-width="0.5"/>`
}
module.exports = { frameVersion, frameFor, frameMarkup }
