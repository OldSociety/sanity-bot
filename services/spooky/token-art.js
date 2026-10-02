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
  if (!Array.isArray(files) || files.length !== 1 || !names.has(files[0]?.tokenAsset) || files[0].name !== files[0].tokenAsset) throw new Error('Invalid token attachment descriptor')
  return files
}
function preparePayload(payload) {
  if (!payload.files) return payload
  return { ...payload, files: validateFiles(payload.files).map(file => ({
    attachment: path.join(__dirname, '..', '..', 'assets', 'spooky', 'tokens', file.tokenAsset), name: file.name,
  })) }
}
// Discord expands attachment:// references into CDN URLs. Resolve only against
// freshly fetched attachments, keeping acknowledgement evidence fail-closed.
function evidenceEmbeds(payload, evidence) {
  if (!payload.files) return evidence.embeds || []
  validateFiles(payload.files)
  const file = payload.files[0]
  const attachment = evidence.attachments?.find(item => item.name === file.name)
  if (!attachment?.url) return []
  return (evidence.embeds || []).map(embed => ({ ...embed,
    ...(embed.image?.url === attachment.url ? { image: { ...embed.image, url: `attachment://${file.name}` } } : {}),
  }))
}
module.exports = { tokenImage, preparePayload, evidenceEmbeds }
