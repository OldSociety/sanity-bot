// Explicit character speech only: keep system feedback and controls separate.
function dialogue(text) {
  return text.split('\n\n').map(paragraph => paragraph ? `_${paragraph}_` : '').join('\n\n')
}
module.exports = { dialogue }
