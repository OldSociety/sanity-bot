const { rosterFor, variantsFor, familyFor } = require('./selection')
const { resolveCharacter } = require('./characters')
const normalize = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/[\[\]_-]/g, ' ').replace(/\s+/g, ' ')
const invalid = message => Object.assign(Error(message), { code: 'ARENA_FIGHT_OPTION' })
function accessibleFamilies(access) {
  if (!Array.isArray(access?.allowedVariantIds)) throw Error('Arena character access is unavailable')
  return rosterFor(access.allowedVariantIds)
}
function findFamily(value, families) {
  const query = normalize(value)
  if (!query) return undefined
  const family = families.find(entry => normalize(entry.id) === query || normalize(entry.name) === query)
  if (family) return family
  const character = resolveCharacter(value)
  return character ? families.find(entry => entry.id === familyFor(character).id) : undefined
}
function resolveFightOptions(access, characterInput, skinInput) {
  if (!characterInput) {
    if (skinInput) throw invalid('Choose a character along with the skin option.')
    return { selection: true }
  }
  const family = findFamily(characterInput, accessibleFamilies(access))
  if (!family) throw invalid('That character is unavailable. Choose one from character autocomplete.')
  const variants = variantsFor(family, access.allowedVariantIds)
  let character
  if (skinInput) {
    const query = normalize(skinInput)
    character = variants.find(variant => [variant.id, variant.version, variant.label, `${variant.version} ${variant.name}`].some(value => normalize(value) === query))
    if (!character) throw invalid('That skin is unavailable for this character. Choose one from skin autocomplete.')
  } else if (variants.length === 1) character = variants[0]
  else return { character: variants[0], selection: true, initialPage: 'skins' }
  return { character, selection: false, startImmediately: true }
}
function createFightOptions({ getAccess = interaction => require('./player-access').playerAccess(interaction) } = {}) {
  async function autocomplete(interaction) {
    if (process.env.NODE_ENV === 'production' || interaction.options.getSubcommand?.(false) !== 'fight') return interaction.respond([])
    const focused = interaction.options.getFocused(true)
    if (!['character', 'skin'].includes(focused?.name)) return interaction.respond([])
    const access = await getAccess(interaction)
    const families = accessibleFamilies(access).sort((a, b) => a.name.localeCompare(b.name))
    const query = normalize(focused.value)
    if (focused.name === 'character') return interaction.respond(families
      .filter(family => normalize(family.name).includes(query)).slice(0, 25)
      .map(family => ({ name: family.name, value: family.id })))
    const family = findFamily(interaction.options.getString('character'), families)
    if (!family) return interaction.respond([])
    return interaction.respond(variantsFor(family, access.allowedVariantIds)
      .filter(variant => normalize(`${variant.version} ${variant.name}`).includes(query)).slice(0, 25)
      .map(variant => ({ name: `${variant.version} ${variant.name}`, value: variant.id })))
  }
  async function resolve(interaction) {
    return resolveFightOptions(await getAccess(interaction), interaction.options.getString('character'), interaction.options.getString('skin'))
  }
  return { autocomplete, resolve }
}
const fightOptions = createFightOptions()
module.exports = { resolveFightOptions, createFightOptions, fightOptions }
