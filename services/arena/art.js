const path = require('node:path')
const { basePortraitFor } = require('./selection')
const { createHash } = require('node:crypto')
const sharp = require('sharp')
const { frameVersion, frameFor, frameMarkup } = require('./portrait-frame')
const { portraitVersion, framingFor, renderPortrait } = require('./portrait')
const { imageVersion } = require('./portrait')
const { createBufferCache } = require('./presentation-cache')
const bannerCache = createBufferCache({
  maxEntries: 8,
  maxBytes: 12 * 1024 * 1024,
})
const thumbnailCache = new Map()
const thumbnailKey = (character) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        image: character.image,
        rarity: character.rarity,
        frame: frameFor(character),
        frameVersion,
        portraitVersion,
        portraitFraming: framingFor(character),
      })
    )
    .digest('hex')
    .slice(0, 16)
const banners = {
  'marq:maxim': 'mvm-banner-wide.png',
  'marq:marq': 'marq-vs-marq.png',
  'maxim:marq': 'maxim-vs-marq.png',
  'maxim:maxim': 'maxim-vs-maxim.png',
}
const bannerName = (character, opponent = 'maxim') =>
  banners[`${character?.kit === 'maxim' ? 'maxim' : 'marq'}:${opponent}`] ||
  banners['marq:maxim']
function artFiles(character, opponent = 'maxim', page = 'prefight') {
  if (page === 'characters') {
    const base = basePortraitFor(character)
    return [
      {
        attachment: base.image,
        name:
          process.env.NODE_ENV === 'production'
            ? `arena-character-${base.kit}-${thumbnailKey(base)}.png`
            : `arena-portrait-${thumbnailKey(base)}.png`,
      },
    ]
  }
  if (['characters', 'skins'].includes(page))
    return [
      {
        attachment: character.image,
        name:
          process.env.NODE_ENV === 'production'
            ? `arena-skin-${character.id.replace(
                /[^a-z0-9-]/gi,
                '-'
              )}-${thumbnailKey(character)}.png`
            : `arena-portrait-${thumbnailKey(character)}.png`,
      },
    ]
  const file = bannerName(character, opponent)
  return [
    {
      attachment: path.join(__dirname, '../../assets/arena', file),
      name: file,
    },
  ]
}
async function framedArtFiles(
  character,
  opponent = 'maxim',
  page = 'prefight',
  logger = console
) {
  const files = artFiles(character, opponent, page)
  if (!['characters', 'skins'].includes(page)) {
    if (process.env.NODE_ENV === 'production' && !require('./build-profile').productionPlaytest)
      return files
    try {
      const key = await imageVersion([files[0].attachment])
      const attachment = await bannerCache.get(key, () =>
        sharp(files[0].attachment)
          .resize({ width: 800, withoutEnlargement: true })
          .png()
          .toBuffer()
      )
      return [{ ...files[0], attachment }]
    } catch (error) {
      logger.warn?.(`Arena banner preparation unavailable: ${error.message}`)
      return files
    }
  }
  const portrait =
    page === 'characters' ? basePortraitFor(character) : character
  const frame = frameFor(portrait)
  if (!frame) return files
  const key = thumbnailKey(portrait)
  try {
    if (!thumbnailCache.has(key)) {
      const pending = (async () => {
        const art = await renderPortrait(
          { image: portrait.image, portraitFraming: framingFor(portrait) },
          72,
          100,
          3
        )
        const background =
          '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="108"><rect x="4" y="4" width="72" height="100" rx="8" fill="#171822"/></svg>'
        const border = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="108">${frameMarkup(
          frame,
          4,
          4,
          72,
          100,
          'thumbnail-rarity'
        )}</svg>`
        const overlay = await sharp(Buffer.from(border), { density: 216 })
          .png()
          .toBuffer()
        return sharp(Buffer.from(background), { density: 216 })
          .composite([
            { input: art, left: 12, top: 12 },
            { input: overlay, left: 0, top: 0 },
          ])
          .png()
          .toBuffer()
      })()
      if (thumbnailCache.size >= 64)
        thumbnailCache.delete(thumbnailCache.keys().next().value)
      thumbnailCache.set(key, pending)
    }
    return [{ ...files[0], attachment: await thumbnailCache.get(key) }]
  } catch (error) {
    thumbnailCache.delete(key)
    logger.warn?.(`Arena rarity thumbnail unavailable: ${error.message}`)
    return files
  }
}
module.exports = { bannerName, artFiles, framedArtFiles }
