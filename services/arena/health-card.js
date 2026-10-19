const { createHash } = require('node:crypto')
const sharp = require('sharp')
const { defaultCharacter, resolveCharacter } = require('./characters')
const { resourceMeter } = require('./resources')
const { statusIcons, iconSvg } = require('./status-icons')
const { frameVersion, frameFor, frameMarkup } = require('./portrait-frame')
const { portraitVersion, framingFor, renderPortrait } = require('./portrait')
const { preparedPortrait } = require('./portrait')
const { createBufferCache, createRenderQueue } = require('./presentation-cache')
const templateCache = createBufferCache({
  maxEntries: 64,
  maxBytes: 16 * 1024 * 1024,
})
const renderQueue = createRenderQueue()

// Match Discord's usual 400px embed image width at an exact 2x pixel density.
const logicalWidth = 400,
  logicalHeight = 286,
  scale = 2
const width = logicalWidth * scale,
  height = logicalHeight * scale
const xml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      }[char])
  )
const ratio = (value, max) =>
  max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
function cardData(session) {
  const character =
    session.character ||
    resolveCharacter(session.battle.player.label) ||
    defaultCharacter
  const opponent = resolveCharacter(
    session.opponent ||
      (session.battle.enemy.kit === 'spooky-marq' ? 'marq' : 'maxim')
  )
  const fighter = (actor, art, side) => ({
    side,
    name: actor.name,
    skin: art.version,
    image: art.image,
    rarity: art.rarity || null,
    rarityFrame: frameFor(art),
    portraitFraming: framingFor(art),
    meter: resourceMeter(actor),
    hp: actor.hp,
    maxHp: actor.maxHp,
    stress: actor.stress,
    maxStress: actor.maxStress,
    icons: statusIcons(actor).map(({ type, label, singleUse, value }) => ({
      type,
      label,
      ...(singleUse ? { singleUse } : {}),
      ...(['slayer', 'alignment', 'windWall'].includes(type) ? { value } : {}),
    })),
    brinkTriggered: actor.passive === 'on-the-brink' && actor.brinkUsed,
  })
  return {
    frameVersion,
    portraitVersion,
    ...(session.assetVersion ? { assetVersion: session.assetVersion } : {}),
    fighters: [
      fighter(session.battle.player, character, 'YOU'),
      fighter(session.battle.enemy, opponent, 'OPPONENT'),
    ],
  }
}
function cardName(session) {
  return `arena-health-${createHash('sha256')
    .update(JSON.stringify(cardData(session)))
    .digest('hex')
    .slice(0, 20)}.png`
}
function cardSvg(data) {
  const text = (x, y, value, size = 20, fill = '#f4f2f7', extra = '') =>
    `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${extra}>${xml(
      value
    )}</text>`
  const panels = data.fighters
    .map((fighter, index) => {
      const y = 6 + index * 140,
        r = ratio(fighter.hp, fighter.maxHp)
      const healthColor = fighter.brinkTriggered
        ? '#a8adb8'
        : r <= 0.25
        ? '#f07178'
        : r <= 0.5
        ? '#edbd65'
        : '#2dc88d'
      const fillWidth = r === 0 ? 0 : Math.max(1, 276 * r)
      const accent = index ? '#a898f1' : '#ed969f'
      const symbols = fighter.icons
        .map(
          (icon, i) =>
            iconSvg(icon.type, 100 + i * 25, y + 98, 23) +
            (['slayer', 'alignment', 'windWall'].includes(icon.type)
              ? `<circle cx="${120 + i * 25}" cy="${
                  y + 99
                }" r="7" fill="#15151e"/>${text(
                  120 + i * 25,
                  y + 103,
                  icon.value,
                  11,
                  '#67d6e7',
                  'text-anchor="middle" font-weight="700"'
                )}`
              : '')
        )
        .join('')
      const segments = Array.from(
        { length: fighter.meter?.max ?? fighter.maxStress },
        (_, i) =>
          `<rect x="${
            256 + i * (fighter.meter?.label === 'Rage' ? 40 : 20)
          }" y="${y + 106}" width="${
            fighter.meter?.label === 'Rage' ? 37 : 17
          }" height="8" rx="3" fill="${
            i < (fighter.meter?.value ?? fighter.stress)
              ? fighter.meter?.label === 'Rage'
                ? '#ed4747'
                : '#949ffa'
              : '#10121b'
          }"/>`
      ).join('')
      return `<rect x="6" y="${y}" width="388" height="132" rx="12" fill="#21212d" stroke="#3e3c50"/>
      <rect x="16" y="${y + 16}" width="72" height="100" rx="9" fill="#171822"/>
      ${text(
        100,
        y + 30,
        fighter.name,
        Math.min(24, Math.floor(210 / (fighter.name.length * 0.6))),
        '#ffffff',
        'font-weight="700"'
      )}
      ${text(
        376,
        y + 26,
        fighter.side,
        11,
        accent,
        'font-weight="700" text-anchor="end"'
      )}
      ${text(
        100,
        y + 57,
        `${fighter.hp} / ${fighter.maxHp} HP`,
        20,
        '#ffffff',
        'font-weight="600"'
      )}
      ${text(
        376,
        y + 57,
        `${Math.round(r * 100)}%`,
        19,
        healthColor,
        'text-anchor="end" font-weight="700"'
      )}
      <defs><clipPath id="health-${index}"><rect x="100" y="${
        y + 70
      }" width="276" height="14" rx="7"/></clipPath></defs>
      <rect x="100" y="${
        y + 70
      }" width="276" height="14" rx="7" fill="#10121b"/>
      <rect x="100" y="${
        y + 70
      }" width="${fillWidth}" height="14" fill="${healthColor}" clip-path="url(#health-${index})"/>
      ${symbols}${
        fighter.meter?.label === 'Rage'
          ? text(256, y + 100, `Rage ${fighter.meter.value}/3`, 12)
          : ''
      }${segments}`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${logicalWidth}" height="${logicalHeight}" font-family="Segoe UI, sans-serif"><rect width="${logicalWidth}" height="${logicalHeight}" rx="16" fill="#15151e"/>${panels}</svg>`
}
async function renderHealthCard(
  session,
  { optimized = process.env.NODE_ENV !== 'production' } = {}
) {
  const data = cardData(session)
  if (optimized)
    return renderQueue.run(async () => {
      const prepared = await Promise.all(
        data.fighters.map((fighter) =>
          preparedPortrait(fighter, 72, 100, scale)
        )
      )
      const key = JSON.stringify([
        frameVersion,
        prepared.map((portrait) => portrait.key),
        data.fighters.map((fighter) => fighter.rarityFrame),
      ])
      // Reuse a prepared composition template, preserving the original overlay
      // order and alpha math instead of flattening portraits into another PNG.
      const template = await templateCache.get(key, async () => {
        const frames = await sharp(Buffer.from(portraitFramesSvg(data)), {
          density: 72 * scale,
        })
          .png()
          .toBuffer()
        return {
          byteLength:
            frames.byteLength +
            prepared.reduce(
              (bytes, portrait) => bytes + portrait.attachment.byteLength,
              0
            ),
          overlays: [
            ...prepared.map((portrait, index) => ({
              input: portrait.attachment,
              left: 16 * scale,
              top: (22 + index * 140) * scale,
            })),
            { input: frames, left: 0, top: 0 },
          ],
        }
      })
      return {
        name: cardName(session),
        attachment: await sharp(Buffer.from(cardSvg(data)), {
          density: 72 * scale,
        })
          .composite(template.overlays)
          .png()
          .toBuffer(),
      }
    })
  const portraits = await Promise.all(
    data.fighters.map(async (fighter, index) => ({
      input: await renderPortrait(fighter, 72, 100, scale),
      left: 16 * scale,
      top: (22 + index * 140) * scale,
    }))
  )
  return {
    name: cardName(session),
    attachment: await sharp(Buffer.from(cardSvg(data)), {
      density: 72 * scale,
    })
      .composite([
        ...portraits,
        {
          input: await sharp(Buffer.from(portraitFramesSvg(data)), {
            density: 72 * scale,
          })
            .png()
            .toBuffer(),
          left: 0,
          top: 0,
        },
      ])
      .png()
      .toBuffer(),
  }
}
// Composite above the unchanged portrait artwork, so opaque art cannot cover
// the border. Rarity and palette both participate in the existing content key.
function portraitFramesSvg(data) {
  const frames = data.fighters
    .map((fighter, index) => {
      const frame = fighter.rarityFrame
      if (!frame) return ''
      return frameMarkup(
        frame,
        16,
        22 + index * 140,
        72,
        100,
        `rarity-${index}`
      )
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${logicalWidth}" height="${logicalHeight}">${frames}</svg>`
}
module.exports = {
  renderStats: () => ({
    templates: templateCache.snapshot(),
    queue: renderQueue.snapshot(),
  }),
  renderHealthCard,
  cardName,
  cardData,
  cardSvg,
  portraitFramesSvg,
  width,
  height,
}
