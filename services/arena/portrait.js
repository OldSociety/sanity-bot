const sharp = require('sharp')
const assignments = require('../../config/arena-portrait-framing.json')
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
module.exports = { portraitVersion, framingFor, renderPortrait }
