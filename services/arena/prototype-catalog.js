// Production metadata stays pinned alongside its frozen combat configuration.
const { productionPlaytest, buildFor } = require('./build-profile')
const templates = buildFor('template')
const hendrix = buildFor('hendrix')
const prototypeEntries =
  process.env.NODE_ENV === 'development' || productionPlaytest
    ? [
        ...(process.env.NODE_ENV === 'development' && buildFor('kylax').enabled
          ? [{ ...buildFor('kylax').identity, label: 'Kylax [Classic]',
              aliases: ['Kylax', 'classic-kylax'], role: 'Seraph · Grave Cleric',
              lore: 'A defensive grave cleric who resists critical attacks and executes weakened opponents.',
              imageAsset: 'KYLAX_BADGE.png' }] : []),
        ...(templates.enabled ? [templates.identity] : []),
        ...(hendrix.enabled
          ? [
              {
                ...hendrix.identity,
                label: `${hendrix.identity.name} [Classic]`,
                aliases: [hendrix.identity.name, hendrix.identity.kit],
                role: `${hendrix.identity.class} · ${hendrix.identity.subclass}`,
                lore: 'A rapid-striking brawler who maintains Bleeding to amplify each blow.',
                imageAsset: 'HENDRIX_BADGE.png',
              },
            ]
          : []),
      ]
    : require('../../config/arena/arena-templates-production.json').characters
module.exports = { prototypeEntries }
