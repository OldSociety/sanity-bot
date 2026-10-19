const { characters, defaultCharacter, isSelectable } = require('./characters')
// Families organize the selector. Variants retain independent IDs, kits,
// stats and feature overrides; choosing a skin never copies another kit.
const roster = Object.freeze(
  [
    ...(process.env.NODE_ENV === 'development'
      ? [
          {
            id: 'azulis',
            name: 'Azulis',
            role: 'Druid · Sustain / Healer',
            lore: 'A sea-themed Star Druid, Azulis spends Stress to restore Health.',
            variantIds: ['classic:azu'],
          },
        ]
      : []),
    {
      id: 'marq',
      name: 'Marq',
      role: 'Juggernaut',
      lore: 'A steadfast juggernaut, Marq faces danger head-on and refuses to yield when the odds turn against him.',
      variantIds: ['spooky-2026:mrq', 'spooky-2026:hfm'],
    },
    {
      id: 'maxim',
      name: 'Maxim',
      role: 'Warrior',
      lore: 'Driven to prove himself, Maxim meets every challenge with fierce determination and a warrior’s resolve.',
      variantIds: ['spooky-2026:max'],
    },
  ].map((entry) => Object.freeze(entry))
)
const familyFor = (variant) =>
  roster.find((entry) => entry.variantIds.includes(variant?.id)) || roster[0]
const variantsFor = (family) =>
  family.variantIds
    .map((id) => characters.find((variant) => variant.id === id))
    .filter((variant) => variant && isSelectable(variant))
// Presentation fallback only: this does not add a playable Classic variant.
const basePortraitFor = (variant) =>
  characters.find((entry) => entry.id === familyFor(variant).variantIds[0])
const findFamily = (id) => roster.find((entry) => entry.id === id)
const fighterChoices = (value) =>
  roster
    .filter((entry) =>
      entry.name.toLowerCase().includes(String(value || '').toLowerCase())
    )
    .map((entry) => ({ name: entry.name, value: entry.id }))
function groupsFor(entries = roster) {
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name))
  const initials = new Map()
  for (const entry of sorted) {
    const key = entry.name[0].toUpperCase()
    if (!initials.has(key)) initials.set(key, [])
    initials.get(key).push(entry)
  }
  const batches = []
  let current = []
  for (const list of initials.values()) {
    if (current.length + list.length > 25 && current.length) {
      batches.push(current)
      current = []
    }
    for (const entry of list) {
      current.push(entry)
      if (current.length === 25) {
        batches.push(current)
        current = []
      }
    }
  }
  if (current.length) batches.push(current)
  return batches.map((entries, index) => ({
    id: String(index),
    label: `${entries[0].name} – ${entries.at(-1).name}`,
    entries,
  }))
}
function createMemoryPreferences() {
  const entries = new Map()
  return {
    get: (guild, user) => entries.get(`${guild}:${user}`),
    set: (guild, user, value) => entries.set(`${guild}:${user}`, value),
  }
}
function createPreferenceStore(
  file = require('node:path').resolve(
    __dirname,
    process.env.NODE_ENV === 'production'
      ? '../../config/arena-selection-preferences-production.json'
      : '../../config/arena-selection-preferences.json'
  )
) {
  const fs = require('node:fs'),
    path = require('node:path')
  const read = () => {
    if (!fs.existsSync(file)) return {}
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw Error('Invalid Arena selection preferences')
    return data
  }
  return {
    get: (guild, user) => read()[`${guild}:${user}`],
    set: (guild, user, value) => {
      const data = read()
      data[`${guild}:${user}`] = value
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file + '.tmp', JSON.stringify(data), 'utf8')
      fs.renameSync(file + '.tmp', file)
    },
  }
}
const preferredVariant = (saved, explicit) =>
  explicit ||
  characters.find(
    (entry) => entry.id === saved?.variantId && isSelectable(entry)
  ) ||
  defaultCharacter
module.exports = {
  roster,
  familyFor,
  variantsFor,
  basePortraitFor,
  findFamily,
  fighterChoices,
  groupsFor,
  createMemoryPreferences,
  createPreferenceStore,
  preferredVariant,
}
