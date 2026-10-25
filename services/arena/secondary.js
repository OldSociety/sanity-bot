// Branch prototype: presentation and equipment only; no combat bonuses.
const enabled = () => process.env.NODE_ENV === 'development'
const testRosterIds = Object.freeze(['classic:kyl', 'classic:hen', 'classic:azu'])
const choices = session => enabled()
  ? require('./characters').characters.filter(character =>
      testRosterIds.includes(character.id) && character.id !== session.character.id &&
      require('./characters').isSelectable(character) &&
      (!session.allowedVariantIds || session.allowedVariantIds.includes(character.id)))
  : []
const equipped = session => choices(session).find(character => character.id === session.secondaryId)
module.exports = { enabled, testRosterIds, choices, equipped }
