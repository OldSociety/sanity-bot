const path = require('node:path')
const { pieces } = require('./config')
const positions = ['tl', 'tr', 'bl', 'br']
const characters = [...new Set(pieces.map(piece => piece.characterId))]
const names = new Set(characters.flatMap(id => Array.from({ length: 15 }, (_, index) => {
  const mask = index + 1
  return `${id}_${positions.filter((_, bit) => mask & (1 << bit)).join('_')}.png`
})))
function tokenImage(characterId, ownedPositions) {
  if (!characters.includes(characterId) || !Array.isArray(ownedPositions) ||
    ownedPositions.some(position => !positions.includes(position))) throw new Error('Invalid token image ownership')
  const owned = positions.filter(position => ownedPositions.includes(position))
  if (!owned.length) return null
  return `${characterId}_${owned.join('_')}.png`
}
function validateFiles(files) {
  const badgeNames = new Set(require('../badges').badges.map(badge => badge.imageAsset)
    .filter(name => typeof name === 'string' && /^[A-Za-z0-9_-]+\.png$/.test(name)))
  if (!Array.isArray(files) || files.length < 1 || files.length > 2 || new Set(files.map(file => file?.name)).size !== files.length ||
    files.some(file => !file || (file.tokenAsset && file.badgeAsset) ||
      !(file.tokenAsset ? names.has(file.tokenAsset) && file.name === file.tokenAsset : badgeNames.has(file.badgeAsset) && file.name === file.badgeAsset))) {
    throw new Error('Invalid token attachment descriptor')
  }
  return files
}
function preparePayload(payload) {
  if (!payload.files) return payload
  return { ...payload, files: validateFiles(payload.files).map(file => ({
    attachment: file.badgeAsset ? path.join(__dirname, '..', '..', 'assets', 'badges', file.badgeAsset)
      : path.join(__dirname, '..', '..', 'assets', 'spooky', 'tokens', file.tokenAsset), name: file.name,
  })) }
}
// Discord expands attachment:// references into CDN URLs. Resolve only against
// freshly fetched attachments, keeping acknowledgement evidence fail-closed.
function evidenceEmbeds(payload, evidence) {
  if (!payload.files) return evidence.embeds || []
  validateFiles(payload.files)
  const attachments = payload.files.map(file => ({ file, attachment: evidence.attachments?.find(item => item.name === file.name) }))
  if (attachments.some(item => !item.attachment?.url)) return []
  const portableURL = url => attachments.find(item => item.attachment.url === url)
  const resolve = url => portableURL(url) ? `attachment://${portableURL(url).file.name}` : url
  return (evidence.embeds || []).map(embed => ({ ...embed,
    ...(embed.image ? { image: { ...embed.image, url: resolve(embed.image.url) } } : {}),
    ...(embed.thumbnail ? { thumbnail: { ...embed.thumbnail, url: resolve(embed.thumbnail.url) } } : {}),
  }))
}
module.exports = { tokenImage, preparePayload, evidenceEmbeds }
