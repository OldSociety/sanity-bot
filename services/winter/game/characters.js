const path = require('node:path');
const nnorahc = Object.freeze({
  id: 'nnorahc',
  name: "N'norah'c",
  image: path.join(__dirname, '../../../assets/characters/Winter/NNORAHC_PLACEHOLDER.jpeg')
});
function discover(s) {
  s.secretCharacters ||= {};
  if (s.secretCharacters[nnorahc.id]) return false;
  s.secretCharacters[nnorahc.id] = { name: nnorahc.name, gameAt: s.now };
  s.milestones.nnorahc ??= s.now;
  return true;
}
module.exports = { nnorahc, discover };
