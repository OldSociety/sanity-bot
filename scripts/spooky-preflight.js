// Offline only: construct command definitions without importing the bot/runtime.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { tokenImage, preparePayload } = require('../services/spooky/token-art')
const {
  config,
  pieces,
  requireApprovedRarity,
  getEventState,
} = require('../services/spooky/config')
const { spookyCommand } = require('../services/spooky/command-definition')
const { adminCommand } = require('../services/spooky/admin-command')
const reminders = require('../config/spooky-reminders.json')
const winners = require('../config/spooky-winners.json')
const badgeAccess = require('../config/badge-access.json')

function preflight(args = []) {
  if (args.length)
    throw new Error(
      'Offline preflight accepts no arguments or target overrides',
    )
  requireApprovedRarity()
  require('../services/badge-access').validateSettings(badgeAccess)
  assert.equal(pieces.length, 28)
  assert.equal(new Set(pieces.map((piece) => piece.id)).size, 28)
  assert.equal(getEventState(Date.parse(config.startsAt)), 'ACTIVE')
  assert.equal(getEventState(Date.parse(config.endsAt)), 'CLOSED')
  let tokenImages = 0
  for (const id of new Set(pieces.map((piece) => piece.characterId)))
    for (let mask = 1; mask <= 15; mask++) {
      const name = tokenImage(
        id,
        ['tl', 'tr', 'bl', 'br'].filter((_, bit) => mask & (1 << bit)),
      )
      fs.accessSync(
        preparePayload({ files: [{ tokenAsset: name, name }] }).files[0]
          .attachment,
        fs.constants.R_OK,
      )
      tokenImages++
    }
  const controller = {
    execute() {
      throw new Error('Preflight cannot execute interactions')
    },
  }
  const commands = [spookyCommand(controller), adminCommand(controller)].map(
    (command) => command.data.toJSON(),
  )
  assert.equal(new Set(commands.map((command) => command.name)).size, 2)
  const expected = [7, 4]
  commands.forEach((command, index) => {
    assert.equal(command.options.length, expected[index])
    assert.equal(
      new Set(command.options.map((option) => option.name)).size,
      expected[index],
    )
    for (const option of command.options)
      assert.match(option.name, /^[a-z0-9-]{1,32}$/)
  })
  assert.ok(commands[0].options.some((option) => option.name === 'help'))
  const badgeCommand = require('../commands/Achievements/Badges').data.toJSON()
  assert.deepEqual(
    badgeCommand.options.map((option) => option.name),
    ['view', 'leaderboard'],
  )
  // This offline report reads configuration only, never credentials or live
  // permissions. Production launch/registry evidence is recorded separately.
  const gates = [
    `Published population results are historical and do not measure version ${config.version}; current rules were accepted for live observation.`,
    'Selene and Marq artwork/native emoji are configured; five other badges use accepted placeholders.',
    'Compare the live registry before bulk registration; preserve server-only commands.',
    'This offline check does not attest live permissions, process health or interaction acceptance; see production-launch guide.',
  ]
  if (!config.enabled) gates.push('Global/test gameplay remains disabled; selected development/production runtimes use explicit activation overrides.')
  if (!badgeAccess.enabled) gates.push('Badge access uses guild-pinned development/production overrides; remaining five cosmetic roles/artworks are pending.')
  if (!reminders.enabled) gates.push('Resident recruitment reminders stay disabled; weekly Fate reminders use the separate event runtime.')
  if (!winners.enabled) gates.push('Finale uses the production-only override and selected environment role/channel; development finale stays disabled.')
  return {
    scope: 'offline Spooky definitions/configuration only',
    configVersion: config.version,
    databaseOpened: false,
    discordContacted: false,
    environmentCredentialsRead: false,
    checksPassed: true,
    liveAcceptanceComplete: false,
    pieces: pieces.length,
    rarityCounts: Object.fromEntries(['common', 'rare', 'legendary'].map(rarity => [rarity, pieces.filter(piece => piece.rarity === rarity).length])),
    characterRarities: Object.fromEntries([...new Set(pieces.map(piece => piece.characterId))].map(id => [id, pieces.filter(piece => piece.characterId === id).map(piece => piece.rarity)])),
    tokenImages,
    fullCircleImages: 7,
    commands: commands.map((command) => ({
      name: command.name,
      subcommands: command.options.map((option) => option.name),
    })),
    permanentBadgeCommand: {
      name: badgeCommand.name,
      subcommands: badgeCommand.options.map((option) => option.name),
    },
    gates,
  }
}
if (require.main === module) {
  try {
    process.stdout.write(
      `${JSON.stringify(preflight(process.argv.slice(2)), null, 2)}\n`,
    )
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
module.exports = { preflight }
