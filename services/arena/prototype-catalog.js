// Production metadata stays pinned alongside its frozen combat configuration.
const templates = require('../../config/arena/characters/arena-template-development.json')
const hendrix = require('../../config/arena/characters/arena-classic-hendrix-development.json')
const prototypeEntries =
  process.env.NODE_ENV === 'development'
    ? [
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
