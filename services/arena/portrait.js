const sharp = require('sharp')
const fs = require('node:fs/promises')
const { createHash } = require('node:crypto')
const { createBufferCache } = require('./presentation-cache')
const sourceCache = createBufferCache({
  maxEntries: 32,
  maxBytes: 32 * 1024 * 1024,
})
const portraitCache = createBufferCache({
  maxEntries: 64,
  maxBytes: 8 * 1024 * 1024,
})
const assignments = require('../../config/arena/arena-portrait-framing.json')
const portraitVersion = 1
const defaultFraming = Object.freeze({
  centerX: 0.5,
  centerY: 0.5,
  subjectHeight: 1,
})
const framingFor = (character) => assignments[character?.id] || defaultFraming
// Coordinates describe the character rather than the full decorative canvas.
// Scale the subject to 88% of frame height, then crop scenery to the frame.
async function renderPortrait(
  { image, portraitFraming = defaultFraming },
  width = 72,
  height = 100,
  scale = 2
) {
  const metadata = await sharp(image).metadata()
  const outWidth = width * scale,
    outHeight = height * scale
  const factor =
    (outHeight * 0.88) / (metadata.height * portraitFraming.subjectHeight)
  const resizedWidth = Math.max(1, Math.round(metadata.width * factor))
  const resizedHeight = Math.max(1, Math.round(metadata.height * factor))
  const offsetX = Math.round(
    outWidth / 2 - portraitFraming.centerX * resizedWidth
  )
  const offsetY = Math.round(
    outHeight / 2 - portraitFraming.centerY * resizedHeight
  )
  const left = Math.max(0, -offsetX),
    top = Math.max(0, -offsetY)
  const cropWidth = Math.min(
    resizedWidth - left,
    outWidth - Math.max(0, offsetX)
  )
  const cropHeight = Math.min(
    resizedHeight - top,
    outHeight - Math.max(0, offsetY)
  )
  const cropped = await sharp(image)
    .resize(resizedWidth, resizedHeight)
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .png()
    .toBuffer()
  const mask = Buffer.from(
    `<svg width="${outWidth}" height="${outHeight}"><rect width="${outWidth}" height="${outHeight}" rx="${
      8 * scale
    }" fill="white"/></svg>`
  )
  return sharp({
    create: {
      width: outWidth,
      height: outHeight,
      channels: 4,
      background: '#00000000',
    },
  })
    .composite([
      { input: cropped, left: Math.max(0, offsetX), top: Math.max(0, offsetY) },
    ])
    .png()
    .toBuffer()
    .then((buffer) =>
      sharp(buffer)
        .composite([{ input: mask, blend: 'dest-in' }])
        .png()
        .toBuffer()
    )
}
async function preparedPortrait(fighter, width = 72, height = 100, scale = 2) {
  const source = fighter.image
  let buffer, version
  if (Buffer.isBuffer(source)) {
    buffer = source
    version = createHash('sha256').update(buffer).digest('hex')
  } else {
    const stat = await fs.stat(source, { bigint: true })
    const sourceKey = `${source}|${stat.size}|${stat.mtimeNs}|${stat.ctimeNs}`
    buffer = await sourceCache.get(sourceKey, () => fs.readFile(source))
    version = createHash('sha256').update(buffer).digest('hex')
  }
  const key = JSON.stringify([
    version,
    portraitVersion,
    fighter.portraitFraming || defaultFraming,
    width,
    height,
    scale,
  ])
  return {
    key,
    attachment: await portraitCache.get(key, () =>
      renderPortrait({ ...fighter, image: buffer }, width, height, scale)
    ),
  }
}
async function imageVersion(images) {
  const versions = await Promise.all(
    images.map(async (source) => {
      if (Buffer.isBuffer(source))
        return createHash('sha256').update(source).digest('hex')
      try {
        const stat = await fs.stat(source, { bigint: true })
        return `${source}|${stat.size}|${stat.mtimeNs}|${stat.ctimeNs}`
      } catch {
        return `${source}|unavailable`
      }
    })
  )
  return createHash('sha256')
    .update(versions.join('\n'))
    .digest('hex')
    .slice(0, 16)
}
module.exports = {
  portraitVersion,
  framingFor,
  renderPortrait,
  preparedPortrait,
  imageVersion,
  portraitCacheStats: () => ({
    sources: sourceCache.snapshot(),
    portraits: portraitCache.snapshot(),
  }),
}
